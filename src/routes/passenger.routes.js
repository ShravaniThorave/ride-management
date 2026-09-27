const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/auth.middleware');
const {
    getMyProfile,
    createPassenger,
    addWallet,
    getWallet,
} = require('../controllers/passengerController');

/**
 * @swagger
 * /api/passengers/me:
 *   get:
 *     summary: Get logged-in user's passenger profile
 *     tags:
 *       - Passengers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Passenger profile fetched
 *       401:
 *         description: Unauthorized - please login first
 *       404:
 *         description: Passenger profile not found
 */
router.get('/me', verifyJWT, getMyProfile);

/**
 * @swagger
 * /api/passengers:
 *   post:
 *     summary: Create a passenger profile for the logged-in user
 *     tags:
 *       - Passengers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               wallet_balance:
 *                 type: number
 *                 example: 0
 *               emergency_contact:
 *                 type: string
 *                 example: "9876543210"
 *     responses:
 *       201:
 *         description: Passenger profile created
 *       401:
 *         description: Unauthorized - please login first
 *       409:
 *         description: Passenger profile already exists for this user
 */
router.post('/', verifyJWT, createPassenger);

/**
 * @swagger
 * /api/passengers/wallet:
 *   get:
 *     summary: Get logged-in user's wallet balance
 *     tags:
 *       - Passengers
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance fetched
 *       401:
 *         description: Unauthorized - please login first
 *       404:
 *         description: Passenger profile not found
 */
router.get('/wallet', verifyJWT, getWallet);

/**
 * @swagger
 * /api/passengers/wallet/add:
 *   post:
 *     summary: Add money to the logged-in user's wallet
 *     tags:
 *       - Passengers
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
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 500
 *     responses:
 *       200:
 *         description: Wallet balance updated
 *       400:
 *         description: Amount must be greater than 0
 *       401:
 *         description: Unauthorized - please login first
 *       404:
 *         description: Passenger profile not found
 */
router.post('/wallet/add', verifyJWT, addWallet);

module.exports = router;
