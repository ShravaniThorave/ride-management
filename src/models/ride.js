// ============================================
// RIDE MODEL
// ============================================
// Purpose: Handle all ride-related database operations
// Used by AI Ride Assistant to fetch ride info for user queries

const pool = require('../db/db');

/**
 * Ride Model
 *
 * Tables involved:
 * - rides (core ride data)
 * - passengers (maps users.id -> passengers.id)
 * - drivers (maps users.id -> drivers.id)
 */
class Ride {
    /**
     * Resolve passenger.id from users.id
     */
    static async getPassengerIdByUserId(userId) {
        const [rows] = await pool.query(
            'SELECT id FROM passengers WHERE user_id = ?',
            [userId]
        );
        return rows.length > 0 ? rows[0].id : null;
    }

    /**
     * Resolve driver.id from users.id
     */
    static async getDriverIdByUserId(userId) {
        const [rows] = await pool.query(
            'SELECT id FROM drivers WHERE user_id = ?',
            [userId]
        );
        return rows.length > 0 ? rows[0].id : null;
    }

    /**
     * GET ALL RIDES FOR A USER (role-aware)
     * Passengers see rides they booked, drivers see rides they drove,
     * admins see latest rides across the system.
     */
    static async findByUser(userId, role = 'passenger', limit = 10) {
        if (role === 'admin') {
            const [rows] = await pool.query(
                `SELECT r.*,
                        up.name AS passenger_name,
                        ud.name AS driver_name
                 FROM rides r
                 LEFT JOIN passengers p ON r.passenger_id = p.id
                 LEFT JOIN users up ON p.user_id = up.id
                 LEFT JOIN drivers d ON r.driver_id = d.id
                 LEFT JOIN users ud ON d.user_id = ud.id
                 ORDER BY r.created_at DESC
                 LIMIT ?`,
                [String(limit)]
            );
            return rows;
        }

        if (role === 'driver') {
            const driverId = await Ride.getDriverIdByUserId(userId);
            if (!driverId) return [];
            const [rows] = await pool.query(
                `SELECT r.*, up.name AS passenger_name
                 FROM rides r
                 LEFT JOIN passengers p ON r.passenger_id = p.id
                 LEFT JOIN users up ON p.user_id = up.id
                 WHERE r.driver_id = ?
                 ORDER BY r.created_at DESC
                 LIMIT ${Number(limit) || 10}`,
                [driverId]
            );
            return rows;
        }

        // default: passenger
        const passengerId = await Ride.getPassengerIdByUserId(userId);
        if (!passengerId) return [];
        const [rows] = await pool.query(
            `SELECT r.*, ud.name AS driver_name
             FROM rides r
             LEFT JOIN drivers d ON r.driver_id = d.id
             LEFT JOIN users ud ON d.user_id = ud.id
             WHERE r.passenger_id = ?
             ORDER BY r.created_at DESC
             LIMIT ${Number(limit) || 10}`,
            [passengerId]
        );
        return rows;
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

        const [rows] = await pool.query(query, params);
        return rows.length > 0 ? rows[0] : null;
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
