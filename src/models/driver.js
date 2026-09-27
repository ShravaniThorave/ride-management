// ============================================
// DRIVER MODEL
// ============================================
// Purpose: Handle all driver-related database operations
// This file contains functions to create, find, update drivers

const pool = require('../db/db');
const ApiError = require('../utils/ApiError');

/**
 * Driver Model
 *
 * Contains all database operations for drivers:
 * - Create driver
 * - Find driver by user_id
 * - Find driver by id
 * - Update status
 * - Update rating
 * - Add earnings
 * - Increment ride count
 * - Get active drivers
 *
 * NOTE: Actual table columns (see src/db/schema.sql) are:
 * id, user_id, license_number, is_online, rating_average,
 * total_rides, total_earnings, documents_verified,
 * created_at, updated_at
 * There is no `status` / `rating` / `earnings` / `vehicle_id` column:
 * - `status` ('online'/'offline'/'on_ride') maps to `is_online`
 *   ('on_ride' is stored as online; live ride state comes from
 *   the rides table). Vehicles live in the separate `vehicles`
 *   table (vehicles.driver_id -> drivers.id).
 */
class Driver {
    /**
     * Allowed driver statuses (API-level).
     */
    static get STATUSES() {
        return ['online', 'offline', 'on_ride'];
    }

    /**
     * CREATE DRIVER
     * Inserts a new driver row linked to an existing user
     *
     * @param {number} userId - FK to users.id (must exist)
     * @param {string} licenseNumber - Unique driver license number
     * @param {number} [vehicleId] - Optional vehicles.id to assign to this driver
     * @returns {Object} - Created driver object
     */
    static async create(userId, licenseNumber, vehicleId = null) {
        if (!userId) {
            throw new ApiError(400, 'userId is required');
        }

        if (!licenseNumber || !String(licenseNumber).trim()) {
            throw new ApiError(400, 'licenseNumber is required');
        }

        const connection = await pool.getConnection();

        try {
            // Verify the linked user exists
            const [users] = await connection.query(
                'SELECT id FROM users WHERE id = ?',
                [userId]
            );

            if (users.length === 0) {
                throw new ApiError(404, 'User not found. Cannot create driver');
            }

            // Prevent duplicate driver profile
            const [existing] = await connection.query(
                'SELECT id FROM drivers WHERE user_id = ?',
                [userId]
            );

            if (existing.length > 0) {
                throw new ApiError(409, 'Driver profile already exists for this user');
            }

            // License number must be unique
            const [licenseTaken] = await connection.query(
                'SELECT id FROM drivers WHERE license_number = ?',
                [licenseNumber]
            );

            if (licenseTaken.length > 0) {
                throw new ApiError(409, 'License number already registered');
            }

            // If a vehicle was given, verify it exists before inserting
            if (vehicleId !== null && vehicleId !== undefined) {
                const [vehicles] = await connection.query(
                    'SELECT id FROM vehicles WHERE id = ?',
                    [vehicleId]
                );

                if (vehicles.length === 0) {
                    throw new ApiError(404, 'Vehicle not found. Cannot assign to driver');
                }
            }

            // Insert driver into database
            const query = `
                INSERT INTO drivers (user_id, license_number)
                VALUES (?, ?)
            `;

            const [result] = await connection.query(query, [
                userId,
                licenseNumber,
            ]);

            // Assign the vehicle to this driver, if one was given
            if (vehicleId !== null && vehicleId !== undefined) {
                await connection.query(
                    'UPDATE vehicles SET driver_id = ? WHERE id = ?',
                    [result.insertId, vehicleId]
                );
            }

            // Return created driver
            return await Driver.findById(result.insertId);
        } catch (error) {
            // Preserve intentional ApiErrors, wrap raw DB failures
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to create driver: ${error.message}`);
        } finally {
            // Always release connection back to pool
            connection.release();
        }
    }

    /**
     * FIND DRIVER BY USER ID
     * Gets a driver by their linked users.id
     *
     * @param {number} userId - users.id to search for
     * @returns {Object} - Driver object
     */
    static async findByUserId(userId) {
        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT id, user_id, license_number, is_online, rating_average,
                       total_rides, total_earnings, documents_verified,
                       created_at, updated_at
                FROM drivers
                WHERE user_id = ?
            `;

            const [rows] = await connection.query(query, [userId]);

            if (rows.length === 0) {
                throw new ApiError(404, 'Driver not found for this user');
            }

            return rows[0];
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to find driver: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * FIND DRIVER BY ID
     * Finds a driver by their drivers.id
     *
     * @param {number} driverId - Driver ID
     * @returns {Object} - Driver object
     */
    static async findById(driverId) {
        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT id, user_id, license_number, is_online, rating_average,
                       total_rides, total_earnings, documents_verified,
                       created_at, updated_at
                FROM drivers
                WHERE id = ?
            `;

            const [rows] = await connection.query(query, [driverId]);

            if (rows.length === 0) {
                throw new ApiError(404, 'Driver not found');
            }

            return rows[0];
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to find driver: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * UPDATE STATUS
     * Updates the driver's availability status.
     * 'online'/'on_ride' -> is_online = TRUE, 'offline' -> FALSE.
     *
     * @param {number} driverId - Driver ID
     * @param {string} status - One of: online, offline, on_ride
     * @returns {Object} - Updated driver object
     */
    static async updateStatus(driverId, status) {
        if (!Driver.STATUSES.includes(status)) {
            throw new ApiError(400, `Status must be one of: ${Driver.STATUSES.join(', ')}`);
        }

        const connection = await pool.getConnection();

        try {
            const query = `
                UPDATE drivers
                SET is_online = ?
                WHERE id = ?
            `;

            const [result] = await connection.query(query, [
                status === 'offline' ? false : true,
                driverId,
            ]);

            if (result.affectedRows === 0) {
                throw new ApiError(404, 'Driver not found. Status not updated');
            }

            // Return updated driver
            return await Driver.findById(driverId);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to update status: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * UPDATE RATING
     * Updates the driver's average rating
     *
     * NOTE: A DB trigger (update_driver_rating) also maintains
     * rating_average automatically from the ratings table.
     * This method is for manual/administrative corrections.
     *
     * @param {number} driverId - Driver ID
     * @param {number} newRating - New average rating (0 - 5)
     * @returns {Object} - Updated driver object
     */
    static async updateRating(driverId, newRating) {
        const rating = Number(newRating);

        if (Number.isNaN(rating) || rating < 0 || rating > 5) {
            throw new ApiError(400, 'Rating must be a number between 0 and 5');
        }

        const connection = await pool.getConnection();

        try {
            const query = `
                UPDATE drivers
                SET rating_average = ?
                WHERE id = ?
            `;

            const [result] = await connection.query(query, [rating, driverId]);

            if (result.affectedRows === 0) {
                throw new ApiError(404, 'Driver not found. Rating not updated');
            }

            // Return updated driver
            return await Driver.findById(driverId);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to update rating: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * ADD EARNINGS
     * Adds an amount to the driver's total_earnings
     * (pass a negative amount to subtract, e.g. adjustments)
     *
     * @param {number} driverId - Driver ID
     * @param {number} amount - Amount to add (e.g. 250)
     * @returns {Object} - Updated driver object
     */
    static async addEarnings(driverId, amount) {
        if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
            throw new ApiError(400, 'A valid amount is required');
        }

        const connection = await pool.getConnection();

        try {
            const query = `
                UPDATE drivers
                SET total_earnings = total_earnings + ?
                WHERE id = ?
            `;

            const [result] = await connection.query(query, [Number(amount), driverId]);

            if (result.affectedRows === 0) {
                throw new ApiError(404, 'Driver not found. Earnings not updated');
            }

            // Return updated driver
            return await Driver.findById(driverId);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to add earnings: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * INCREMENT RIDE COUNT
     * Adds 1 to the driver's total_rides
     *
     * @param {number} driverId - Driver ID
     * @returns {Object} - Updated driver object
     */
    static async incrementRideCount(driverId) {
        const connection = await pool.getConnection();

        try {
            const query = `
                UPDATE drivers
                SET total_rides = total_rides + 1
                WHERE id = ?
            `;

            const [result] = await connection.query(query, [driverId]);

            if (result.affectedRows === 0) {
                throw new ApiError(404, 'Driver not found. Ride count not updated');
            }

            // Return updated driver
            return await Driver.findById(driverId);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to increment ride count: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * GET ACTIVE DRIVERS
     * Returns all drivers currently online (is_online = TRUE)
     *
     * @returns {Array} - List of online driver objects
     */
    static async getActiveDrivers() {
        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT id, user_id, license_number, is_online, rating_average,
                       total_rides, total_earnings, documents_verified,
                       created_at, updated_at
                FROM drivers
                WHERE is_online = TRUE
                ORDER BY rating_average DESC
            `;

            const [rows] = await connection.query(query);

            return rows;
        } catch (error) {
            throw new ApiError(500, `Failed to fetch active drivers: ${error.message}`);
        } finally {
            connection.release();
        }
    }
}

module.exports = Driver;

/**
 * USAGE EXAMPLES:
 *
 * // Create a driver profile for an existing user
 * const driver = await Driver.create(2, 'MH12AB1234');
 *
 * // Create a driver and assign a vehicle to them
 * const driver = await Driver.create(2, 'MH12AB1234', 5);
 *
 * // Find driver by user_id
 * const driver = await Driver.findByUserId(2);
 *
 * // Find driver by id
 * const driver = await Driver.findById(1);
 *
 * // Update availability status
 * const updated = await Driver.updateStatus(1, 'online');
 * const updated = await Driver.updateStatus(1, 'on_ride');
 * const updated = await Driver.updateStatus(1, 'offline');
 *
 * // Update average rating
 * const updated = await Driver.updateRating(1, 4.8);
 *
 * // Add ride earnings
 * const updated = await Driver.addEarnings(1, 250);
 *
 * // Increment ride count after a completed ride
 * const updated = await Driver.incrementRideCount(1);
 *
 * // Get all online drivers
 * const online = await Driver.getActiveDrivers();
 */
