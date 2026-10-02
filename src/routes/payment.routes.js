const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/auth.middleware');
const { processPayment, getHistory } = require('../controllers/paymentController');

/**
 * @swagger
 * /api/payments/process:
 *   post:
 *     summary: Process a wallet payment for a ride
 *     tags:
 *       - Payments
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
 *               - rideId
 *               - amount
 *             properties:
 *               rideId:
 *                 type: integer
 *                 example: 1
 *               amount:
 *                 type: number
 *                 example: 250
 *               payment_method:
 *                 type: string
 *                 enum: [card, wallet, upi, cash]
 *                 example: wallet
 *     responses:
 *       201:
 *         description: Payment processed successfully (payment confirmation)
 *       400:
 *         description: rideId/amount missing, invalid, or insufficient wallet balance
 *       401:
 *         description: Unauthorized - please login first
 *       403:
 *         description: Not authorized to pay for this ride
 *       404:
 *         description: Ride or passenger profile not found
 *       409:
 *         description: Payment already completed for this ride
 */
router.post('/process', verifyJWT, processPayment);

/**
 * @swagger
 * /api/payments/history:
 *   get:
 *     summary: Get all payments for the logged-in user
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Payment history fetched
 *       401:
 *         description: Unauthorized - please login first
 */
router.get('/history', verifyJWT, getHistory);

module.exports = router;
