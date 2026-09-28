// ============================================
// RIDE MODEL
// ============================================
// Purpose: Handle all ride-related database operations
// This file contains functions to create, find, update rides
// Used by AI Ride Assistant to fetch ride info for user queries

const pool = require('../db/db');
const ApiError = require('../utils/ApiError');

/**
 * Ride Model
 *
 * Contains all database operations for rides:
 * - Create ride
 * - Find ride by id (with passenger and driver details)
 * - Find rides by passenger id
 * - Find rides by driver id
 * - Update ride status
 * - Calculate fare
 * - Complete ride (mark completed + set final_fare)
 * - Get rides by status
 * - Role-aware helpers for the AI Ride Assistant
 *
 * NOTE: Actual table columns (see src/db/schema.sql) are:
 * id, passenger_id, driver_id, vehicle_id, pickup_location,
 * dropoff_location, distance_km, pickup_time, dropoff_time,
 * status ('requested','accepted','started','completed','cancelled'),
 * base_fare, surge_multiplier, final_fare, created_at, updated_at
 * There is no `rating` / `surge_charge` column:
 * - `surge_charge` is derived as
 *   (base_fare + distance_km * PER_KM_RATE) * (surge_multiplier - 1)
 * - ratings live in the separate `ratings` table.
 */
class Ride {
    /**
     * Allowed ride statuses (matches ENUM in schema).
     */
    static get STATUSES() {
        return ['requested', 'accepted', 'started', 'completed', 'cancelled'];
    }

    /**
     * Valid forward transitions:
     * requested -> accepted / cancelled
     * accepted  -> started / cancelled
     * started   -> completed / cancelled
     * completed / cancelled are terminal.
     */
    static get ALLOWED_TRANSITIONS() {
        return {
            requested: ['accepted', 'cancelled'],
            accepted: ['started', 'cancelled'],
            started: ['completed', 'cancelled'],
            completed: [],
            cancelled: [],
        };
    }

    /**
     * Fare constants.
     */
    static get BASE_FARE() {
        return 100.0;
    }

    static get PER_KM_RATE() {
        return 15;
    }

    /**
     * CREATE RIDE
     * Inserts a new ride row with status="requested"
     *
     * @param {Object} passengerData - Ride data
     * @param {number} passengerData.passenger_id - FK to passengers.id (required)
     * @param {string} passengerData.pickup_location - Pickup address (required)
     * @param {string} passengerData.dropoff_location - Dropoff address (required)
     * @param {number} [passengerData.distance_km] - Estimated distance in km
     * @param {number} [passengerData.driver_id] - FK to drivers.id (optional, assigned later)
     * @param {number} [passengerData.vehicle_id] - FK to vehicles.id (optional)
     * @param {number} [passengerData.base_fare] - Base fare (defaults to 100.00)
     * @param {number} [passengerData.surge_multiplier] - Surge multiplier (defaults to 1.00)
     * @returns {Object} - Created ride object with status="requested"
     */
    static async create(passengerData) {
        if (!passengerData || typeof passengerData !== 'object') {
            throw new ApiError(400, 'Ride data is required');
        }

        const {
            passenger_id,
            pickup_location,
            dropoff_location,
            distance_km = null,
            driver_id = null,
            vehicle_id = null,
            base_fare = Ride.BASE_FARE,
            surge_multiplier = 1.0,
        } = passengerData;

        if (!passenger_id) {
            throw new ApiError(400, 'passenger_id is required');
        }

        if (!pickup_location || !String(pickup_location).trim()) {
            throw new ApiError(400, 'pickup_location is required');
        }

        if (!dropoff_location || !String(dropoff_location).trim()) {
            throw new ApiError(400, 'dropoff_location is required');
        }

        const connection = await pool.getConnection();

        try {
            // Verify the passenger exists
            const [passengers] = await connection.query(
                'SELECT id FROM passengers WHERE id = ?',
                [passenger_id]
            );

            if (passengers.length === 0) {
                throw new ApiError(404, 'Passenger not found. Cannot create ride');
            }

            // If a driver was given, verify it exists
            if (driver_id !== null && driver_id !== undefined) {
                const [drivers] = await connection.query(
                    'SELECT id FROM drivers WHERE id = ?',
                    [driver_id]
                );

                if (drivers.length === 0) {
                    throw new ApiError(404, 'Driver not found. Cannot assign to ride');
                }
            }

            // If a vehicle was given, verify it exists
            if (vehicle_id !== null && vehicle_id !== undefined) {
                const [vehicles] = await connection.query(
                    'SELECT id FROM vehicles WHERE id = ?',
                    [vehicle_id]
                );

                if (vehicles.length === 0) {
                    throw new ApiError(404, 'Vehicle not found. Cannot assign to ride');
                }
            }

            // Insert ride into database (status defaults to "requested")
            const query = `
                INSERT INTO rides
                    (passenger_id, driver_id, vehicle_id, pickup_location,
                     dropoff_location, distance_km, status, base_fare, surge_multiplier)
                VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, ?)
            `;

            const [result] = await connection.query(query, [
                passenger_id,
                driver_id,
                vehicle_id,
                pickup_location,
                dropoff_location,
                distance_km,
                base_fare,
                surge_multiplier,
            ]);

            // Return created ride
            return await Ride.findById(result.insertId);
        } catch (error) {
            // Preserve intentional ApiErrors, wrap raw DB failures
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to create ride: ${error.message}`);
        } finally {
            // Always release connection back to pool
            connection.release();
        }
    }

    /**
     * FIND RIDE BY ID
     * Gets a ride by its rides.id with passenger and driver details
     *
     * @param {number} rideId - rides.id to search for
     * @returns {Object} - Ride object with passenger/driver details
     */
    static async findById(rideId) {
        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT r.*,
                       up.name AS passenger_name,
                       up.phone AS passenger_phone,
                       ud.name AS driver_name,
                       ud.phone AS driver_phone,
                       v.license_plate, v.vehicle_type, v.color
                FROM rides r
                LEFT JOIN passengers p ON r.passenger_id = p.id
                LEFT JOIN users up ON p.user_id = up.id
                LEFT JOIN drivers d ON r.driver_id = d.id
                LEFT JOIN users ud ON d.user_id = ud.id
                LEFT JOIN vehicles v ON r.vehicle_id = v.id
                WHERE r.id = ?
            `;

            const [rows] = await connection.query(query, [rideId]);

            if (rows.length === 0) {
                throw new ApiError(404, 'Ride not found');
            }

            return rows[0];
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to find ride: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * FIND RIDES BY PASSENGER ID
     * Gets all rides booked by a passenger (newest first)
     *
     * @param {number} passengerId - passengers.id to search for
     * @returns {Array} - List of ride objects
     */
    static async findByPassengerId(passengerId) {
        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT r.*,
                       ud.name AS driver_name,
                       v.license_plate, v.vehicle_type
                FROM rides r
                LEFT JOIN drivers d ON r.driver_id = d.id
                LEFT JOIN users ud ON d.user_id = ud.id
                LEFT JOIN vehicles v ON r.vehicle_id = v.id
                WHERE r.passenger_id = ?
                ORDER BY r.created_at DESC
            `;

            const [rows] = await connection.query(query, [passengerId]);

            return rows;
        } catch (error) {
            throw new ApiError(500, `Failed to find rides for passenger: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * FIND RIDES BY DRIVER ID
     * Gets all rides driven by a driver (newest first)
     *
     * @param {number} driverId - drivers.id to search for
     * @returns {Array} - List of ride objects
     */
    static async findByDriverId(driverId) {
        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT r.*,
                       up.name AS passenger_name,
                       v.license_plate, v.vehicle_type
                FROM rides r
                LEFT JOIN passengers p ON r.passenger_id = p.id
                LEFT JOIN users up ON p.user_id = up.id
                LEFT JOIN vehicles v ON r.vehicle_id = v.id
                WHERE r.driver_id = ?
                ORDER BY r.created_at DESC
            `;

            const [rows] = await connection.query(query, [driverId]);

            return rows;
        } catch (error) {
            throw new ApiError(500, `Failed to find rides for driver: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * UPDATE STATUS
     * Updates the ride status following the flow:
     * requested -> accepted -> started -> completed
     * (cancelled is allowed from requested / accepted / started)
     *
     * @param {number} rideId - Ride ID
     * @param {string} newStatus - One of: requested, accepted, started, completed, cancelled
     * @returns {Object} - Updated ride object
     */
    static async updateStatus(rideId, newStatus) {
        if (!Ride.STATUSES.includes(newStatus)) {
            throw new ApiError(400, `Status must be one of: ${Ride.STATUSES.join(', ')}`);
        }

        const connection = await pool.getConnection();

        try {
            // Fetch current status to validate the transition
            const [existing] = await connection.query(
                'SELECT id, status FROM rides WHERE id = ?',
                [rideId]
            );

            if (existing.length === 0) {
                throw new ApiError(404, 'Ride not found. Status not updated');
            }

            const currentStatus = existing[0].status;

            const allowed = Ride.ALLOWED_TRANSITIONS[currentStatus] || [];
            if (currentStatus !== newStatus && !allowed.includes(newStatus)) {
                throw new ApiError(
                    400,
                    `Invalid status transition: ${currentStatus} -> ${newStatus}`
                );
            }

            const timestampColumn =
                newStatus === 'accepted' || newStatus === 'started'
                    ? ', pickup_time = NOW()'
                    : '';

            const query = `
                UPDATE rides
                SET status = ?${timestampColumn}
                WHERE id = ?
            `;

            const [result] = await connection.query(query, [newStatus, rideId]);

            if (result.affectedRows === 0) {
                throw new ApiError(404, 'Ride not found. Status not updated');
            }

            // Return updated ride
            return await Ride.findById(rideId);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to update ride status: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * CALCULATE FARE
     * Calculates: base_fare + (distanceKm x 15) + surge_charge
     * where surge_charge = (base_fare + distanceKm x 15) x (surgeMultiplier - 1)
     *
     * @param {number} distanceKm - Distance travelled in km
     * @param {number} [surgeMultiplier=1.00] - Surge multiplier (e.g. 1.5 = +50%)
     * @param {number} [baseFare=100.00] - Base fare
     * @returns {number} - Total fare rounded to 2 decimals
     */
    static async calculateFare(distanceKm, surgeMultiplier = 1.0, baseFare = Ride.BASE_FARE) {
        const distance = Number(distanceKm);
        const surge = Number(surgeMultiplier);
        const base = Number(baseFare);

        if (Number.isNaN(distance) || distance < 0) {
            throw new ApiError(400, 'distanceKm must be a non-negative number');
        }

        if (Number.isNaN(surge) || surge < 1) {
            throw new ApiError(400, 'surgeMultiplier must be a number >= 1');
        }

        if (Number.isNaN(base) || base < 0) {
            throw new ApiError(400, 'baseFare must be a non-negative number');
        }

        try {
            const distanceFare = distance * Ride.PER_KM_RATE;
            const subtotal = base + distanceFare;
            const surgeCharge = subtotal * (surge - 1);
            const totalFare = subtotal + surgeCharge;

            return Number(totalFare.toFixed(2));
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to calculate fare: ${error.message}`);
        }
    }

    /**
     * COMPLETE RIDE (note: kept the requested `completRide` spelling)
     * Marks the ride as completed, calculates final_fare and stores it.
     *
     * @param {number} rideId - Ride ID
     * @param {number} distanceKm - Final distance travelled in km
     * @returns {Object} - Updated ride object (contains final_fare)
     */
    static async completRide(rideId, distanceKm) {
        const distance = Number(distanceKm);

        if (distanceKm === undefined || distanceKm === null || Number.isNaN(distance) || distance < 0) {
            throw new ApiError(400, 'distanceKm must be a non-negative number');
        }

        const connection = await pool.getConnection();

        try {
            // Fetch current ride
            const [rows] = await connection.query(
                'SELECT id, status, base_fare, surge_multiplier FROM rides WHERE id = ?',
                [rideId]
            );

            if (rows.length === 0) {
                throw new ApiError(404, 'Ride not found. Cannot complete ride');
            }

            const ride = rows[0];

            if (ride.status === 'completed') {
                throw new ApiError(400, 'Ride is already completed');
            }

            if (ride.status === 'cancelled') {
                throw new ApiError(400, 'Cancelled ride cannot be completed');
            }

            // Calculate fare: base_fare + (distanceKm x 15) + surge_charge
            const finalFare = await Ride.calculateFare(
                distance,
                Number(ride.surge_multiplier) || 1.0,
                Number(ride.base_fare) || Ride.BASE_FARE
            );

            const query = `
                UPDATE rides
                SET status = 'completed',
                    distance_km = ?,
                    final_fare = ?,
                    dropoff_time = NOW()
                WHERE id = ?
            `;

            const [result] = await connection.query(query, [distance, finalFare, rideId]);

            if (result.affectedRows === 0) {
                throw new ApiError(404, 'Ride not found. Ride not completed');
            }

            // Return completed ride (contains final_fare)
            return await Ride.findById(rideId);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to complete ride: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * COMPLETE RIDE (correctly spelled alias of completRide)
     */
    static async completeRide(rideId, distanceKm) {
        return await Ride.completRide(rideId, distanceKm);
    }

    /**
     * GET RIDES BY STATUS
     * Returns rides with a specific status (newest first)
     *
     * @param {string} status - One of: requested, accepted, started, completed, cancelled
     * @param {number} [limit=10] - Max number of rides to return
     * @returns {Array} - List of ride objects
     */
    static async getRidesByStatus(status, limit = 10) {
        if (!Ride.STATUSES.includes(status)) {
            throw new ApiError(400, `Status must be one of: ${Ride.STATUSES.join(', ')}`);
        }

        const parsedLimit = Number(limit) || 10;

        if (parsedLimit <= 0) {
            throw new ApiError(400, 'Limit must be a positive number');
        }

        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT r.*,
                       up.name AS passenger_name,
                       ud.name AS driver_name
                FROM rides r
                LEFT JOIN passengers p ON r.passenger_id = p.id
                LEFT JOIN users up ON p.user_id = up.id
                LEFT JOIN drivers d ON r.driver_id = d.id
                LEFT JOIN users ud ON d.user_id = ud.id
                WHERE r.status = ?
                ORDER BY r.created_at DESC
                LIMIT ${parsedLimit}
            `;

            const [rows] = await connection.query(query, [status]);

            return rows;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to fetch rides by status: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * Resolve passenger.id from users.id
     */
    static async getPassengerIdByUserId(userId) {
        const connection = await pool.getConnection();

        try {
            const [rows] = await connection.query(
                'SELECT id FROM passengers WHERE user_id = ?',
                [userId]
            );
            return rows.length > 0 ? rows[0].id : null;
        } catch (error) {
            throw new ApiError(500, `Failed to resolve passenger: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * Resolve driver.id from users.id
     */
    static async getDriverIdByUserId(userId) {
        const connection = await pool.getConnection();

        try {
            const [rows] = await connection.query(
                'SELECT id FROM drivers WHERE user_id = ?',
                [userId]
            );
            return rows.length > 0 ? rows[0].id : null;
        } catch (error) {
            throw new ApiError(500, `Failed to resolve driver: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * GET ALL RIDES FOR A USER (role-aware)
     * Passengers see rides they booked, drivers see rides they drove,
     * admins see latest rides across the system.
     */
    static async findByUser(userId, role = 'passenger', limit = 10) {
        const connection = await pool.getConnection();

        try {
            const parsedLimit = Number(limit) || 10;

            if (role === 'admin') {
                const [rows] = await connection.query(
                    `SELECT r.*,
                            up.name AS passenger_name,
                            ud.name AS driver_name
                     FROM rides r
                     LEFT JOIN passengers p ON r.passenger_id = p.id
                     LEFT JOIN users up ON p.user_id = up.id
                     LEFT JOIN drivers d ON r.driver_id = d.id
                     LEFT JOIN users ud ON d.user_id = ud.id
                     ORDER BY r.created_at DESC
                     LIMIT ${parsedLimit}`
                );
                return rows;
            }

            if (role === 'driver') {
                const driverId = await Ride.getDriverIdByUserId(userId);
                if (!driverId) return [];
                const [rows] = await connection.query(
                    `SELECT r.*, up.name AS passenger_name
                     FROM rides r
                     LEFT JOIN passengers p ON r.passenger_id = p.id
                     LEFT JOIN users up ON p.user_id = up.id
                     WHERE r.driver_id = ?
                     ORDER BY r.created_at DESC
                     LIMIT ${parsedLimit}`,
                    [driverId]
                );
                return rows;
            }

            // default: passenger
            const passengerId = await Ride.getPassengerIdByUserId(userId);
            if (!passengerId) return [];
            const [rows] = await connection.query(
                `SELECT r.*, ud.name AS driver_name
                 FROM rides r
                 LEFT JOIN drivers d ON r.driver_id = d.id
                 LEFT JOIN users ud ON d.user_id = ud.id
                 WHERE r.passenger_id = ?
                 ORDER BY r.created_at DESC
                 LIMIT ${parsedLimit}`,
                [passengerId]
            );
            return rows;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to fetch rides: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * GET ACTIVE RIDES (requested / accepted / started)
     */
    static async findActiveByUser(userId, role = 'passenger') {
        const all = await Ride.findByUser(userId, role, 50);
        return all.filter((r) =>
            ['requested', 'accepted', 'started'].includes(r.status)
        ).slice(0, 10);
    }

    /**
     * FIND SINGLE RIDE BY ID (scoped to user unless admin)
     */
    static async findByIdForUser(rideId, userId, role = 'passenger') {
        const connection = await pool.getConnection();

        try {
            let query = `
                SELECT r.*,
                       up.name AS passenger_name,
                       ud.name AS driver_name,
                       v.license_plate, v.vehicle_type, v.color
                FROM rides r
                LEFT JOIN passengers p ON r.passenger_id = p.id
                LEFT JOIN users up ON p.user_id = up.id
                LEFT JOIN drivers d ON r.driver_id = d.id
                LEFT JOIN users ud ON d.user_id = ud.id
                LEFT JOIN vehicles v ON r.vehicle_id = v.id
                WHERE r.id = ?
            `;
            const params = [rideId];

            if (role === 'driver') {
                const driverId = await Ride.getDriverIdByUserId(userId);
                if (!driverId) return null;
                query += ' AND r.driver_id = ?';
                params.push(driverId);
            } else if (role !== 'admin') {
                const passengerId = await Ride.getPassengerIdByUserId(userId);
                if (!passengerId) return null;
                query += ' AND r.passenger_id = ?';
                params.push(passengerId);
            }

            const [rows] = await connection.query(query, params);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to find ride: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * RIDE STATS (counts by status + total spend/earnings)
     */
    static async getStatsForUser(userId, role = 'passenger') {
        const rides = await Ride.findByUser(userId, role, 100);
        const stats = {
            total: rides.length,
            requested: 0,
            accepted: 0,
            started: 0,
            completed: 0,
            cancelled: 0,
            totalSpent: 0,
        };
        for (const r of rides) {
            if (stats[r.status] !== undefined) stats[r.status] += 1;
            if (r.status === 'completed') {
                stats.totalSpent += Number(r.final_fare || r.base_fare || 0);
            }
        }
        stats.totalSpent = Number(stats.totalSpent.toFixed(2));
        stats.active = stats.requested + stats.accepted + stats.started;
        return stats;
    }
}

module.exports = Ride;

/**
 * USAGE EXAMPLES:
 *
 * // Create a new ride (status = "requested")
 * const ride = await Ride.create({
 *     passenger_id: 1,
 *     pickup_location: 'Pune Station',
 *     dropoff_location: 'Airport Terminal 2',
 *     distance_km: 12.5
 * });
 *
 * // Find ride by id (with passenger + driver details)
 * const ride = await Ride.findById(1);
 *
 * // Find all rides for a passenger / driver
 * const rides = await Ride.findByPassengerId(1);
 * const rides = await Ride.findByDriverId(1);
 *
 * // Update ride status (requested -> accepted -> started -> completed)
 * const updated = await Ride.updateStatus(1, 'accepted');
 *
 * // Calculate fare: base_fare + (distanceKm x 15) + surge_charge
 * const fare = await Ride.calculateFare(12.5);          // no surge
 * const fare = await Ride.calculateFare(12.5, 1.5);     // 1.5x surge
 *
 * // Complete a ride (sets status + final_fare)
 * const completed = await Ride.completRide(1, 12.5);
 *
 * // Get rides by status
 * const requested = await Ride.getRidesByStatus('requested', 10);
 */
