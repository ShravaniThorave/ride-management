const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/auth.middleware');
const {
    getMyProfile,
    createDriver,
    updateStatus,
    getEarnings,
    getActiveDrivers,
} = require('../controllers/driverController');

/**
 * @swagger
 * /api/drivers/me:
 *   get:
 *     summary: Get logged-in user's driver profile
 *     tags:
 *       - Drivers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Driver profile fetched
 *       401:
 *         description: Unauthorized - please login first
 *       404:
 *         description: Driver profile not found
 */
router.get('/me', verifyJWT, getMyProfile);

/**
 * @swagger
 * /api/drivers:
 *   post:
 *     summary: Create a driver profile for the logged-in user
 *     tags:
 *       - Drivers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - licenseNumber
 *             properties:
 *               licenseNumber:
 *                 type: string
 *                 example: "DL123456"
 *               vehicleId:
 *                 type: number
 *                 example: 1
 *     responses:
 *       201:
 *         description: Driver profile created
 *       400:
 *         description: licenseNumber is required
 *       401:
 *         description: Unauthorized - please login first
 *       409:
 *         description: Driver profile already exists for this user
 */
router.post('/', verifyJWT, createDriver);

/**
 * @swagger
 * /api/drivers/status:
 *   put:
 *     summary: Update the logged-in driver's availability status
 *     tags:
 *       - Drivers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [online, offline, on_ride]
 *                 example: "online"
 *     responses:
 *       200:
 *         description: Driver status updated
 *       400:
 *         description: Status must be one of online, offline, on_ride
 *       401:
 *         description: Unauthorized - please login first
 *       404:
 *         description: Driver profile not found
 */
router.put('/status', verifyJWT, updateStatus);

/**
 * @swagger
 * /api/drivers/earnings:
 *   get:
 *     summary: Get logged-in driver's earnings summary
 *     tags:
 *       - Drivers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Driver earnings fetched
 *       401:
 *         description: Unauthorized - please login first
 *       404:
 *         description: Driver profile not found
 */
router.get('/earnings', verifyJWT, getEarnings);

/**
 * @swagger
 * /api/drivers/active:
 *   get:
 *     summary: List all online drivers (public, used for ride matching)
 *     tags:
 *       - Drivers
 *     responses:
 *       200:
 *         description: Active drivers fetched
 */
router.get('/active', getActiveDrivers);

module.exports = router;
