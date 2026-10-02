// ============================================
// PAYMENT MODEL
// ============================================
// Purpose: Handle all payment-related database operations
// Simulates wallet-based ride payments with atomic transactions

const pool = require('../db/db');
const ApiError = require('../utils/ApiError');

/**
 * Payment Model
 *
 * Table (see src/db/schema.sql -> payments):
 *  id, ride_id, passenger_id, amount,
 *  payment_method ('card','wallet','upi','cash'),
 *  status ('pending','completed','failed','refunded'),
 *  created_at, updated_at
 *
 * Flow (processPayment):
 *  1. Check passenger wallet balance
 *  2. Deduct from passenger wallet
 *  3. Add to driver earnings
 *  4. Create payment record (status = completed)
 *  All steps run inside a single DB transaction.
 */
class Payment {
    /**
     * Allowed payment methods / statuses (match ENUMs in schema).
     */
    static get METHODS() {
        return ['card', 'wallet', 'upi', 'cash'];
    }

    static get STATUSES() {
        return ['pending', 'completed', 'failed', 'refunded'];
    }

    /**
     * FIND PAYMENT BY ID
     *
     * @param {number} paymentId - payments.id
     * @returns {Object} - Payment row
     */
    static async findById(paymentId) {
        const connection = await pool.getConnection();

        try {
            const [rows] = await connection.query('SELECT * FROM payments WHERE id = ?', [paymentId]);

            if (rows.length === 0) {
                throw new ApiError(404, 'Payment not found');
            }

            return rows[0];
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to find payment: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * PROCESS PAYMENT
     * Simulates a wallet payment for a ride:
     *  - Check passenger wallet balance
     *  - Deduct from passenger wallet
     *  - Add to driver earnings
     *  - Create payment record
     *
     * @param {number} rideId - rides.id (must exist)
     * @param {number} passengerId - passengers.id (must exist, must own the ride)
     * @param {number} driverId - drivers.id (must exist)
     * @param {number} amount - Amount to charge (> 0)
     * @param {string} [paymentMethod='wallet'] - One of: card, wallet, upi, cash
     * @returns {Object} - Created payment details
     */
    static async processPayment(rideId, passengerId, driverId, amount, paymentMethod = 'wallet') {
        const value = Number(amount);

        if (!rideId) {
            throw new ApiError(400, 'rideId is required');
        }
        if (!passengerId) {
            throw new ApiError(400, 'passengerId is required');
        }
        if (!driverId) {
            throw new ApiError(400, 'driverId is required');
        }
        if (amount === undefined || amount === null || Number.isNaN(value) || value <= 0) {
            throw new ApiError(400, 'amount must be a number greater than 0');
        }
        if (!Payment.METHODS.includes(paymentMethod)) {
            throw new ApiError(400, `paymentMethod must be one of: ${Payment.METHODS.join(', ')}`);
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // 1. Verify ride exists and belongs to this passenger/driver
            const [rides] = await connection.query(
                'SELECT id, passenger_id, driver_id, status FROM rides WHERE id = ? FOR UPDATE',
                [rideId]
            );
            if (rides.length === 0) {
                throw new ApiError(404, 'Ride not found. Payment not processed');
            }
            const ride = rides[0];

            if (Number(ride.passenger_id) !== Number(passengerId)) {
                throw new ApiError(403, 'Passenger does not own this ride. Payment not processed');
            }
            if (ride.driver_id !== null && Number(ride.driver_id) !== Number(driverId)) {
                throw new ApiError(403, 'Driver is not assigned to this ride. Payment not processed');
            }

            // 2. Prevent double-charging an already-paid ride
            const [existing] = await connection.query(
                "SELECT id FROM payments WHERE ride_id = ? AND status = 'completed' LIMIT 1",
                [rideId]
            );
            if (existing.length > 0) {
                throw new ApiError(409, 'Payment already completed for this ride');
            }

            // 3. Check passenger wallet balance (row-locked)
            const [passengers] = await connection.query(
                'SELECT id, wallet_balance FROM passengers WHERE id = ? FOR UPDATE',
                [passengerId]
            );
            if (passengers.length === 0) {
                throw new ApiError(404, 'Passenger not found. Payment not processed');
            }
            if (Number(passengers[0].wallet_balance) < value) {
                throw new ApiError(400, 'Insufficient wallet balance');
            }

            // Verify driver exists (row-locked)
            const [drivers] = await connection.query(
                'SELECT id FROM drivers WHERE id = ? FOR UPDATE',
                [driverId]
            );
            if (drivers.length === 0) {
                throw new ApiError(404, 'Driver not found. Payment not processed');
            }

            // 4. Deduct from passenger wallet
            await connection.query('UPDATE passengers SET wallet_balance = wallet_balance - ? WHERE id = ?', [
                value,
                passengerId,
            ]);

            // 5. Add to driver earnings
            await connection.query('UPDATE drivers SET total_earnings = total_earnings + ? WHERE id = ?', [
                value,
                driverId,
            ]);

            // 6. Create payment record
            const [result] = await connection.query(
                `INSERT INTO payments (ride_id, passenger_id, amount, payment_method, status)
                 VALUES (?, ?, ?, ?, 'completed')`,
                [rideId, passengerId, value, paymentMethod]
            );

            await connection.commit();

            return await Payment.findById(result.insertId);
        } catch (error) {
            try {
                await connection.rollback();
            } catch (_) {
                // ignore rollback errors
            }
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to process payment: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * GET PAYMENT HISTORY
     * Gets all payments for a user — works for passengers
     * (payments they made) and drivers (payments for rides they drove).
     *
     * @param {number} userId - users.id
     * @returns {Array} - List of payment objects (newest first)
     */
    static async getPaymentHistory(userId) {
        if (!userId) {
            throw new ApiError(400, 'userId is required');
        }

        const connection = await pool.getConnection();

        try {
            // Resolve passenger + driver profile ids for this user
            const [passRows] = await connection.query('SELECT id FROM passengers WHERE user_id = ?', [userId]);
            const [driverRows] = await connection.query('SELECT id FROM drivers WHERE user_id = ?', [userId]);

            const passengerId = passRows.length > 0 ? passRows[0].id : null;
            const driverId = driverRows.length > 0 ? driverRows[0].id : null;

            if (passengerId === null && driverId === null) {
                return [];
            }

            const query = `
                SELECT pay.*,
                       r.pickup_location, r.dropoff_location, r.status AS ride_status
                FROM payments pay
                JOIN rides r ON pay.ride_id = r.id
                WHERE pay.passenger_id = ? OR r.driver_id = ?
                ORDER BY pay.created_at DESC
            `;

            const [rows] = await connection.query(query, [passengerId, driverId]);

            return rows;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to fetch payment history: ${error.message}`);
        } finally {
            connection.release();
        }
    }
}

module.exports = Payment;

/**
 * USAGE EXAMPLES:
 *
 * // Process a wallet payment for a ride
 * const payment = await Payment.processPayment(rideId, passengerId, driverId, 250);
 *
 * // With explicit method
 * const payment = await Payment.processPayment(rideId, passengerId, driverId, 250, 'upi');
 *
 * // Payment history for a user (passenger or driver)
 * const history = await Payment.getPaymentHistory(userId);
 */
