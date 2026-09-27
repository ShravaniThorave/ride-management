// ============================================
// PASSENGER MODEL
// ============================================
// Purpose: Handle all passenger-related database operations
// This file contains functions to create, find, update passengers

const pool = require('../db/db');
const ApiError = require('../utils/ApiError');

/**
 * Passenger Model
 *
 * Contains all database operations for passengers:
 * - Create passenger
 * - Find passenger by user_id
 * - Find passenger by id
 * - Update wallet balance
 * - Update rating
 * - Increment ride count
 *
 * NOTE: Actual table columns (see src/db/schema.sql) are:
 * id, user_id, total_rides, rating_average, wallet_balance,
 * emergency_contact, created_at, updated_at
 */
class Passenger {
    /**
     * CREATE PASSENGER
     * Inserts a new passenger row linked to an existing user
     *
     * @param {number} userId - FK to users.id (must exist)
     * @param {Object} [initialData] - Optional initial values
     * @param {number} [initialData.wallet_balance] - Starting wallet balance
     * @param {string} [initialData.emergency_contact] - Emergency contact number
     * @returns {Object} - Created passenger object
     */
    static async create(userId, initialData = {}) {
        if (!userId) {
            throw new ApiError(400, 'userId is required');
        }

        const { wallet_balance = 0.0, emergency_contact = null } = initialData;

        const connection = await pool.getConnection();

        try {
            // Verify the linked user exists
            const [users] = await connection.query(
                'SELECT id FROM users WHERE id = ?',
                [userId]
            );

            if (users.length === 0) {
                throw new ApiError(404, 'User not found. Cannot create passenger');
            }

            // Prevent duplicate passenger profile
            const [existing] = await connection.query(
                'SELECT id FROM passengers WHERE user_id = ?',
                [userId]
            );

            if (existing.length > 0) {
                throw new ApiError(409, 'Passenger profile already exists for this user');
            }

            // Insert passenger into database
            const query = `
                INSERT INTO passengers (user_id, wallet_balance, emergency_contact)
                VALUES (?, ?, ?)
            `;

            const [result] = await connection.query(query, [
                userId,
                wallet_balance,
                emergency_contact,
            ]);

            // Return created passenger
            return await Passenger.findById(result.insertId);
        } catch (error) {
            // Preserve intentional ApiErrors, wrap raw DB failures
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to create passenger: ${error.message}`);
        } finally {
            // Always release connection back to pool
            connection.release();
        }
    }

    /**
     * FIND PASSENGER BY USER ID
     * Gets a passenger by their linked users.id
     *
     * @param {number} userId - users.id to search for
     * @returns {Object} - Passenger object
     */
    static async findByUserId(userId) {
        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT id, user_id, total_rides, rating_average, wallet_balance,
                       emergency_contact, created_at, updated_at
                FROM passengers
                WHERE user_id = ?
            `;

            const [rows] = await connection.query(query, [userId]);

            if (rows.length === 0) {
                throw new ApiError(404, 'Passenger not found for this user');
            }

            return rows[0];
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to find passenger: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * FIND PASSENGER BY ID
     * Finds a passenger by their passengers.id
     *
     * @param {number} passengerId - Passenger ID
     * @returns {Object} - Passenger object
     */
    static async findById(passengerId) {
        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT id, user_id, total_rides, rating_average, wallet_balance,
                       emergency_contact, created_at, updated_at
                FROM passengers
                WHERE id = ?
            `;

            const [rows] = await connection.query(query, [passengerId]);

            if (rows.length === 0) {
                throw new ApiError(404, 'Passenger not found');
            }

            return rows[0];
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to find passenger: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * UPDATE WALLET
     * Adds (positive amount) or subtracts (negative amount)
     * from the passenger's wallet_balance
     *
     * @param {number} passengerId - Passenger ID
     * @param {number} amount - Amount to add/subtract (e.g. 100 or -50)
     * @returns {Object} - Updated passenger object
     */
    static async updateWallet(passengerId, amount) {
        if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
            throw new ApiError(400, 'A valid amount is required');
        }

        const connection = await pool.getConnection();

        try {
            const query = `
                UPDATE passengers
                SET wallet_balance = wallet_balance + ?
                WHERE id = ?
            `;

            const [result] = await connection.query(query, [Number(amount), passengerId]);

            if (result.affectedRows === 0) {
                throw new ApiError(404, 'Passenger not found. Wallet not updated');
            }

            // Guard against negative balance
            const updated = await Passenger.findById(passengerId);

            if (Number(updated.wallet_balance) < 0) {
                // Roll back this update so balance stays valid
                await connection.query(
                    'UPDATE passengers SET wallet_balance = wallet_balance - ? WHERE id = ?',
                    [Number(amount), passengerId]
                );
                throw new ApiError(400, 'Insufficient wallet balance');
            }

            return updated;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to update wallet: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * UPDATE RATING
     * Updates the passenger's average rating
     *
     * NOTE: A DB trigger (update_passenger_rating) also maintains
     * rating_average automatically from the ratings table.
     * This method is for manual/administrative corrections.
     *
     * @param {number} passengerId - Passenger ID
     * @param {number} newRating - New average rating (0 - 5)
     * @returns {Object} - Updated passenger object
     */
    static async updateRating(passengerId, newRating) {
        const rating = Number(newRating);

        if (Number.isNaN(rating) || rating < 0 || rating > 5) {
            throw new ApiError(400, 'Rating must be a number between 0 and 5');
        }

        const connection = await pool.getConnection();

        try {
            const query = `
                UPDATE passengers
                SET rating_average = ?
                WHERE id = ?
            `;

            const [result] = await connection.query(query, [rating, passengerId]);

            if (result.affectedRows === 0) {
                throw new ApiError(404, 'Passenger not found. Rating not updated');
            }

            // Return updated passenger
            return await Passenger.findById(passengerId);
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
     * INCREMENT RIDE COUNT
     * Adds 1 to the passenger's total_rides
     *
     * @param {number} passengerId - Passenger ID
     * @returns {Object} - Updated passenger object
     */
    static async incrementRideCount(passengerId) {
        const connection = await pool.getConnection();

        try {
            const query = `
                UPDATE passengers
                SET total_rides = total_rides + 1
                WHERE id = ?
            `;

            const [result] = await connection.query(query, [passengerId]);

            if (result.affectedRows === 0) {
                throw new ApiError(404, 'Passenger not found. Ride count not updated');
            }

            // Return updated passenger
            return await Passenger.findById(passengerId);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to increment ride count: ${error.message}`);
        } finally {
            connection.release();
        }
    }
}

module.exports = Passenger;

/**
 * USAGE EXAMPLES:
 *
 * // Create a passenger profile for an existing user
 * const passenger = await Passenger.create(1, {
 *     wallet_balance: 500.00,
 *     emergency_contact: '9876543210'
 * });
 *
 * // Find passenger by user_id
 * const passenger = await Passenger.findByUserId(1);
 *
 * // Find passenger by id
 * const passenger = await Passenger.findById(1);
 *
 * // Add money to wallet (subtract with a negative amount)
 * const updated = await Passenger.updateWallet(1, 200);   // +200
 * const updated = await Passenger.updateWallet(1, -50);   // -50
 *
 * // Update average rating
 * const updated = await Passenger.updateRating(1, 4.5);
 *
 * // Increment ride count after a completed ride
 * const updated = await Passenger.incrementRideCount(1);
 */
