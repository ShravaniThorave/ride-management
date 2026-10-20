// ============================================
// RATING MODEL
// ============================================
// Purpose: Handle all rating-related database operations
// This file contains functions to submit and fetch ride ratings

const pool = require('../db/db');
const ApiError = require('../utils/ApiError');

/**
 * Rating Model
 *
 * Contains all database operations for ratings:
 * - Submit rating
 * - Get ratings by ride id
 * - Get driver average rating
 * - Get passenger average rating
 *
 * NOTE: Actual table columns (see src/db/schema.sql) are:
 * id, ride_id, rater_id (-> users.id), ratee_id (-> users.id),
 * rating (1-5), comment, created_at
 * Averages are maintained by DB triggers (update_driver_rating,
 * update_passenger_rating) and re-synced explicitly here as well.
 */
class Rating {
    /**
     * SUBMIT RATING
     * Inserts a new rating for a ride and syncs the ratee's
     * average rating on drivers / passengers.
     *
     * @param {number} rideId - rides.id (must exist)
     * @param {number} raterId - users.id of the person rating (must be part of the ride)
     * @param {number} ratingValue - Stars, 1-5
     * @param {string} [comment] - Optional comment
     * @returns {Object} - Created rating details
     */
    static async submitRating(rideId, raterId, ratingValue, comment = null) {
        if (!rideId) {
            throw new ApiError(400, 'rideId is required');
        }
        if (!raterId) {
            throw new ApiError(400, 'raterId is required');
        }
        if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
            throw new ApiError(400, 'ratingValue must be an integer between 1 and 5');
        }

        const connection = await pool.getConnection();

        try {
            const [rides] = await connection.query(
                'SELECT id, passenger_id, driver_id, status FROM rides WHERE id = ?',
                [rideId]
            );

            if (rides.length === 0) {
                throw new ApiError(404, 'Ride not found');
            }

            const ride = rides[0];

            if (ride.driver_id === null) {
                throw new ApiError(400, 'Ride has no assigned driver yet');
            }

            // Only completed rides can be rated
            if (ride.status !== 'completed') {
                throw new ApiError(400, `You can only rate completed rides. This ride is ${ride.status}`);
            }

            const [passengers] = await connection.query(
                'SELECT id, user_id FROM passengers WHERE id = ?',
                [ride.passenger_id]
            );
            const [drivers] = await connection.query(
                'SELECT id, user_id FROM drivers WHERE id = ?',
                [ride.driver_id]
            );

            if (passengers.length === 0 || drivers.length === 0) {
                throw new ApiError(404, 'Ride participants not found');
            }

            const passengerUserId = passengers[0].user_id;
            const driverUserId = drivers[0].user_id;

            let rateeId;
            if (raterId === passengerUserId) {
                rateeId = driverUserId;
            } else if (raterId === driverUserId) {
                rateeId = passengerUserId;
            } else {
                throw new ApiError(403, 'You are not part of this ride');
            }

            // No UNIQUE constraint on (ride_id, rater_id) in the schema,
            // so guard duplicates here to avoid double-counted averages.
            const [existing] = await connection.query(
                'SELECT id FROM ratings WHERE ride_id = ? AND rater_id = ? LIMIT 1',
                [rideId, raterId]
            );
            if (existing.length > 0) {
                throw new ApiError(409, 'You have already rated this ride');
            }

            const [result] = await connection.query(
                'INSERT INTO ratings (ride_id, rater_id, ratee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
                [rideId, raterId, rateeId, ratingValue, comment]
            );

            // Re-sync the ratee's average. Normally DB triggers
            // (update_driver_rating / update_passenger_rating) do this, but on
            // databases where creating triggers is not permitted (e.g. no SUPER
            // privilege with binary logging) the averages stay stale — so we
            // also recompute explicitly here. When both run it is idempotent.
            try {
                await connection.query(
                    'UPDATE drivers SET rating_average = (SELECT AVG(rating) FROM ratings WHERE ratee_id = ?) WHERE user_id = ?',
                    [rateeId, rateeId]
                );
                await connection.query(
                    'UPDATE passengers SET rating_average = (SELECT AVG(rating) FROM ratings WHERE ratee_id = ?) WHERE user_id = ?',
                    [rateeId, rateeId]
                );
            } catch (resyncErr) {
                console.error('Rating average re-sync failed:', resyncErr.message);
            }

            const [rows] = await connection.query(
                'SELECT * FROM ratings WHERE id = ?',
                [result.insertId]
            );

            return rows[0];
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to submit rating: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * GET RIDE RATINGS
     * Gets all ratings for a ride (newest first)
     *
     * @param {number} rideId - rides.id to search for
     * @returns {Array} - List of rating objects
     */
    static async getRideRatings(rideId) {
        if (!rideId) {
            throw new ApiError(400, 'rideId is required');
        }

        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT r.*,
                       u_rater.name AS rater_name,
                       u_ratee.name AS ratee_name
                FROM ratings r
                LEFT JOIN users u_rater ON r.rater_id = u_rater.id
                LEFT JOIN users u_ratee ON r.ratee_id = u_ratee.id
                WHERE r.ride_id = ?
                ORDER BY r.created_at DESC
            `;

            const [rows] = await connection.query(query, [rideId]);

            return rows;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to fetch ride ratings: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * GET RATINGS BY RATER
     * Gets all ratings submitted by a user (newest first).
     * Used by the frontend to know which rides are already rated.
     *
     * @param {number} raterId - users.id of the rater
     * @returns {Array} - List of rating objects
     */
    static async getRatingsByRater(raterId) {
        if (!raterId) {
            throw new ApiError(400, 'raterId is required');
        }

        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT r.*,
                       u_ratee.name AS ratee_name
                FROM ratings r
                LEFT JOIN users u_ratee ON r.ratee_id = u_ratee.id
                WHERE r.rater_id = ?
                ORDER BY r.created_at DESC
            `;

            const [rows] = await connection.query(query, [raterId]);

            return rows;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to fetch ratings for rater: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * GET DRIVER RATING
     * Gets a driver's average rating
     *
     * @param {number} driverId - drivers.id to search for
     * @returns {Object} - { driverId, rating_average, total_ratings }
     */
    static async getDriverRating(driverId) {
        if (!driverId) {
            throw new ApiError(400, 'driverId is required');
        }

        const connection = await pool.getConnection();

        try {
            const [drivers] = await connection.query(
                'SELECT id, user_id, rating_average FROM drivers WHERE id = ?',
                [driverId]
            );

            if (drivers.length === 0) {
                throw new ApiError(404, 'Driver not found');
            }

            const [stats] = await connection.query(
                'SELECT AVG(rating) AS rating_average, COUNT(*) AS total_ratings FROM ratings WHERE ratee_id = ?',
                [drivers[0].user_id]
            );

            return {
                driverId: drivers[0].id,
                rating_average:
                    stats[0].rating_average !== null
                        ? Number(Number(stats[0].rating_average).toFixed(2))
                        : Number(drivers[0].rating_average),
                total_ratings: Number(stats[0].total_ratings),
            };
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to fetch driver rating: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * GET PASSENGER RATING
     * Gets a passenger's average rating
     *
     * @param {number} passengerId - passengers.id to search for
     * @returns {Object} - { passengerId, rating_average, total_ratings }
     */
    static async getPassengerRating(passengerId) {
        if (!passengerId) {
            throw new ApiError(400, 'passengerId is required');
        }

        const connection = await pool.getConnection();

        try {
            const [passengers] = await connection.query(
                'SELECT id, user_id, rating_average FROM passengers WHERE id = ?',
                [passengerId]
            );

            if (passengers.length === 0) {
                throw new ApiError(404, 'Passenger not found');
            }

            const [stats] = await connection.query(
                'SELECT AVG(rating) AS rating_average, COUNT(*) AS total_ratings FROM ratings WHERE ratee_id = ?',
                [passengers[0].user_id]
            );

            return {
                passengerId: passengers[0].id,
                rating_average:
                    stats[0].rating_average !== null
                        ? Number(Number(stats[0].rating_average).toFixed(2))
                        : Number(passengers[0].rating_average),
                total_ratings: Number(stats[0].total_ratings),
            };
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to fetch passenger rating: ${error.message}`);
        } finally {
            connection.release();
        }
    }
}

module.exports = Rating;

/**
 * USAGE EXAMPLES:
 *
 * // Submit a rating (passenger rates driver, or driver rates passenger)
 * const rating = await Rating.submitRating(rideId, raterUserId, 5, 'Great ride!');
 *
 * // Get all ratings for a ride
 * const ratings = await Rating.getRideRatings(rideId);
 *
 * // Get a driver's average rating
 * const driverRating = await Rating.getDriverRating(driverId);
 *
 * // Get a passenger's average rating
 * const passengerRating = await Rating.getPassengerRating(passengerId);
 */
