// ============================================
// DRIVER CONTROLLER
// ============================================
// Purpose: Handle all driver-related HTTP requests
// Routes are wired in src/routes/driver.routes.js
// (all routes require auth via verifyJWT -> req.user,
//  except getActiveDrivers which is public for ride matching)

const pool = require('../db/db');
const Driver = require('../models/driver');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Shape a driver row into the public profile format.
 * NOTE: DB columns are `is_online` / `rating_average` / `total_earnings`
 * (see src/db/schema.sql); exposed as `status` / `rating` / `earnings`
 * for API consumers, with the raw columns kept as aliases.
 * `vehicle_id` comes from the separate `vehicles` table
 * (vehicles.driver_id -> drivers.id).
 */
const toProfile = (d, vehicleId = null) => ({
    id: d.id,
    user_id: d.user_id,
    license_number: d.license_number,
    vehicle_id: vehicleId,
    rating: Number(d.rating_average),
    rating_average: Number(d.rating_average),
    total_rides: d.total_rides,
    earnings: Number(d.total_earnings),
    total_earnings: Number(d.total_earnings),
    status: d.is_online ? 'online' : 'offline',
    is_online: Boolean(d.is_online),
});

/**
 * Look up the assigned vehicle id for a single driver.
 * Returns null when the driver has no vehicle row.
 */
const getVehicleId = async (driverId) => {
    const [rows] = await pool.query(
        'SELECT id FROM vehicles WHERE driver_id = ? LIMIT 1',
        [driverId]
    );
    return rows.length > 0 ? rows[0].id : null;
};

/**
 * Batch look-up of vehicle ids for a list of drivers.
 * Returns a Map of driverId -> vehicleId (one query, no N+1).
 */
const getVehicleIds = async (driverIds) => {
    const map = new Map();
    if (!driverIds.length) return map;
    const [rows] = await pool.query(
        `SELECT driver_id, id FROM vehicles WHERE driver_id IN (${driverIds.map(() => '?').join(',')})`,
        driverIds
    );
    for (const row of rows) {
        if (!map.has(row.driver_id)) map.set(row.driver_id, row.id);
    }
    return map;
};

/**
 * GET /api/drivers/me
 * Get the logged-in user's driver profile.
 * Auth: required (verifyJWT attaches req.user; 401 if missing/invalid).
 */
const getMyProfile = asyncHandler(async (req, res) => {
    // Driver model throws 404 ApiError if no profile exists
    const driver = await Driver.findByUserId(req.user.id);
    const vehicleId = await getVehicleId(driver.id);

    res.status(200).json(
        new ApiResponse(200, toProfile(driver, vehicleId), 'Driver profile fetched')
    );
});

/**
 * POST /api/drivers
 * Auto-create a driver profile linked to the logged-in user.
 * Body: { "licenseNumber": "DL123456", "vehicleId": 1 (optional) }
 * Model throws 409 ApiError if a profile already exists for this user.
 */
const createDriver = asyncHandler(async (req, res) => {
    const { licenseNumber, vehicleId } = req.body || {};

    if (!licenseNumber || !String(licenseNumber).trim()) {
        throw new ApiError(400, 'licenseNumber is required');
    }

    const driver = await Driver.create(
        req.user.id,
        String(licenseNumber).trim(),
        vehicleId ?? null
    );
    const assignedVehicleId = await getVehicleId(driver.id);

    res.status(201).json(
        new ApiResponse(201, toProfile(driver, assignedVehicleId), 'Driver profile created')
    );
});

/**
 * PUT /api/drivers/status
 * Update the logged-in driver's availability status.
 * Body: { "status": "online" } (one of: online, offline, on_ride)
 */
const updateStatus = asyncHandler(async (req, res) => {
    const { status } = req.body || {};

    if (!Driver.STATUSES.includes(status)) {
        throw new ApiError(400, `Status must be one of: ${Driver.STATUSES.join(', ')}`);
    }

    const driver = await Driver.findByUserId(req.user.id);
    await Driver.updateStatus(driver.id, status);

    res.status(200).json(
        new ApiResponse(200, { status }, 'Driver status updated')
    );
});

/**
 * GET /api/drivers/earnings
 * Get the logged-in driver's earnings summary.
 * Model throws 404 ApiError if no driver profile exists.
 */
const getEarnings = asyncHandler(async (req, res) => {
    const driver = await Driver.findByUserId(req.user.id);

    const earnings = Number(driver.total_earnings);
    const totalRides = driver.total_rides;

    res.status(200).json(
        new ApiResponse(
            200,
            {
                earnings,
                totalRides,
                averagePerRide: totalRides > 0 ? Number((earnings / totalRides).toFixed(2)) : 0,
            },
            'Driver earnings fetched'
        )
    );
});

/**
 * GET /api/drivers/active
 * List all online drivers. NO auth (used for ride matching).
 */
const getActiveDrivers = asyncHandler(async (req, res) => {
    const drivers = await Driver.getActiveDrivers();
    const vehicleMap = await getVehicleIds(drivers.map((d) => d.id));

    res.status(200).json(
        new ApiResponse(
            200,
            drivers.map((d) => toProfile(d, vehicleMap.get(d.id) ?? null)),
            'Active drivers fetched'
        )
    );
});

module.exports = {
    getMyProfile,
    createDriver,
    updateStatus,
    getEarnings,
    getActiveDrivers,
};
