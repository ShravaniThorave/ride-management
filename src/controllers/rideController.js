// ============================================
// RIDE CONTROLLER
// ============================================
// Purpose: Handle all ride-related HTTP requests
// Routes are wired in src/routes/ride.routes.js
// (all routes require auth via verifyJWT -> req.user,
//  except getRidesByStatus which is public)

const pool = require('../db/db');
const Ride = require('../models/ride');
const Passenger = require('../models/passenger');
const Driver = require('../models/driver');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/rides/book
 * Book a new ride (status = "requested").
 * Body: { "pickup_location": "Andheri", "dropoff_location": "Bandra", "distance_km": 12.5 }
 * Auth: required (verifyJWT attaches req.user; 401 if missing/invalid).
 */
const bookRide = asyncHandler(async (req, res) => {
    const { pickup_location, dropoff_location, distance_km } = req.body || {};

    if (!pickup_location || !String(pickup_location).trim()) {
        throw new ApiError(400, 'pickup_location is required');
    }

    if (!dropoff_location || !String(dropoff_location).trim()) {
        throw new ApiError(400, 'dropoff_location is required');
    }

    // Passenger model throws 404 ApiError if no profile exists
    const passenger = await Passenger.findByUserId(req.user.id);

    // Create ride with status="requested"
    const ride = await Ride.create({
        passenger_id: passenger.id,
        pickup_location: String(pickup_location).trim(),
        dropoff_location: String(dropoff_location).trim(),
        ...(distance_km !== undefined && { distance_km }),
    });

    // Fetch online drivers nearby (all online drivers; no geo data available)
    const availableDrivers = await Driver.getActiveDrivers();

    res.status(201).json(
        new ApiResponse(201, { ride, availableDrivers }, 'Ride booked successfully')
    );
});

/**
 * PUT /api/rides/:id/accept
 * Driver accepts a requested ride (requested -> accepted).
 * Auth: required (driver profile looked up from req.user).
 */
const acceptRide = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Must be a driver to accept (throws 404 if no driver profile)
    const driver = await Driver.findByUserId(req.user.id);

    // Ride model throws 404 ApiError if ride does not exist
    const ride = await Ride.findById(id);

    if (ride.status !== 'requested') {
        throw new ApiError(400, `Ride cannot be accepted. Current status: ${ride.status}`);
    }

    // Assign the accepting driver to the ride
    await pool.query('UPDATE rides SET driver_id = ? WHERE id = ?', [driver.id, id]);

    // Update status: requested -> accepted
    const updatedRide = await Ride.updateStatus(id, 'accepted');

    // Update driver status: online -> on_ride
    await Driver.updateStatus(driver.id, 'on_ride');

    res.status(200).json(
        new ApiResponse(200, updatedRide, 'Ride accepted')
    );
});

/**
 * PUT /api/rides/:id/start
 * Driver starts an accepted ride (accepted -> started).
 * Auth: required.
 */
const startRide = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Ride model throws 404 ApiError if ride does not exist
    const ride = await Ride.findById(id);

    if (ride.status !== 'accepted') {
        throw new ApiError(400, `Ride cannot be started. Current status: ${ride.status}`);
    }

    // If the caller is a driver, only the assigned driver may start the ride
    if (req.user.role === 'driver') {
        const driver = await Driver.findByUserId(req.user.id);
        if (ride.driver_id !== driver.id) {
            throw new ApiError(403, 'You are not assigned to this ride');
        }
    }

    // Update status: accepted -> started
    const updatedRide = await Ride.updateStatus(id, 'started');

    res.status(200).json(
        new ApiResponse(200, updatedRide, 'Ride started')
    );
});

/**
 * PUT /api/rides/:id/complete
 * Complete a started ride (started -> completed), calculate final_fare,
 * deduct from passenger wallet and add to driver earnings.
 * Body: { "distance_km": 12.5 }
 * Auth: required.
 */
const completeRide = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { distance_km } = req.body || {};

    // Ride model throws 404 ApiError if ride does not exist
    const ride = await Ride.findById(id);

    if (ride.status !== 'started') {
        throw new ApiError(400, `Ride cannot be completed. Current status: ${ride.status}`);
    }

    const distance = Number(distance_km ?? ride.distance_km);

    if (distance_km === undefined && ride.distance_km === null) {
        throw new ApiError(400, 'distance_km is required');
    }

    if (Number.isNaN(distance) || distance < 0) {
        throw new ApiError(400, 'distance_km must be a non-negative number');
    }

    // Mark completed + calculate/store final_fare
    const completedRide = await Ride.completRide(id, distance);
    const fare = Number(completedRide.final_fare);

    // Deduct from passenger wallet (throws 400 on insufficient balance)
    await Passenger.updateWallet(completedRide.passenger_id, -fare);

    // Add to driver earnings
    if (completedRide.driver_id) {
        await Driver.addEarnings(completedRide.driver_id, fare);
        // Free the driver for the next ride
        await Driver.updateStatus(completedRide.driver_id, 'online');
    }

    res.status(200).json(
        new ApiResponse(200, { ride: completedRide, fare }, 'Ride completed')
    );
});

/**
 * GET /api/rides/:id
 * Get a single ride, scoped to the logged-in user (passengers see their
 * own rides, drivers see rides they drove, admins see any ride).
 * Auth: required.
 */
const getRideById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const role = req.user?.role || 'passenger';

    const ride = await Ride.findByIdForUser(id, req.user.id, role);

    if (!ride) {
        throw new ApiError(404, 'Ride not found or unauthorized');
    }

    res.status(200).json(
        new ApiResponse(200, ride, 'Ride fetched')
    );
});

/**
 * GET /api/rides/my
 * Get all rides for the logged-in user (role-aware).
 * Auth: required.
 */
const getMyRides = asyncHandler(async (req, res) => {
    const role = req.user?.role || 'passenger';
    const limit = Number(req.query.limit) || 50;

    const rides = await Ride.findByUser(req.user.id, role, limit);

    res.status(200).json(
        new ApiResponse(200, rides, 'Rides fetched')
    );
});

/**
 * GET /api/rides/status/:status
 * Get rides with a specific status (newest first).
 * NO auth (public).
 */
const getRidesByStatus = asyncHandler(async (req, res) => {
    const { status } = req.params;
    const limit = Number(req.query.limit) || 10;

    // Model throws 400 ApiError for invalid status
    const rides = await Ride.getRidesByStatus(status, limit);

    res.status(200).json(
        new ApiResponse(200, rides, 'Rides fetched')
    );
});

module.exports = {
    bookRide,
    acceptRide,
    startRide,
    completeRide,
    getRideById,
    getMyRides,
    getRidesByStatus,
};
