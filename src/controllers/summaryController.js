// ============================================
// ADMIN SUMMARY CONTROLLER
// ============================================
// Purpose: Read-only platform stats for the admin dashboard.
// Single GET endpoint -> GET /api/admin/summary

const pool = require('../db/db');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/admin/summary
 * Read-only summary of rides, revenue, and online drivers.
 * Auth: required (any logged-in user; tighten with an admin check if needed).
 */
const getSummary = asyncHandler(async (req, res) => {
    const [total] = await pool.query('SELECT COUNT(*) AS total_rides FROM rides');
    const [completed] = await pool.query(
        "SELECT COUNT(*) AS completed_rides FROM rides WHERE status = 'completed'"
    );
    const [revenue] = await pool.query(
        "SELECT COALESCE(SUM(final_fare), 0) AS total_revenue FROM rides WHERE status = 'completed'"
    );
    // NOTE: the drivers table has no `status` column — availability is
    // stored as `is_online` (see schema.sql / driverController). The spec's
    // `WHERE status = 'online'` was adapted to `WHERE is_online = 1`.
    const [drivers] = await pool.query(
        'SELECT COUNT(*) AS online_drivers FROM drivers WHERE is_online = 1'
    );

    res.status(200).json(
        new ApiResponse(
            200,
            {
                total_rides: Number(total[0].total_rides),
                completed_rides: Number(completed[0].completed_rides),
                total_revenue: Number(revenue[0].total_revenue),
                online_drivers: Number(drivers[0].online_drivers),
            },
            'Admin summary fetched'
        )
    );
});

module.exports = { getSummary };
