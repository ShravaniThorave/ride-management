const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/auth.middleware');
const { getSummary } = require('../controllers/summaryController');

/**
 * @swagger
 * /api/admin/summary:
 *   get:
 *     summary: Read-only admin summary (rides, revenue, online drivers)
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Admin summary fetched
 *       401:
 *         description: Unauthorized - please login first
 */
router.get('/', verifyJWT, getSummary);

module.exports = router;
