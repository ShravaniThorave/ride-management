const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/auth.middleware');
const { createTicket, getMyTickets, getTicketById, updateTicketStatus } = require('../controllers/supportTicketController');

/**
 * @swagger
 * /api/support:
 *   post:
 *     summary: File a new support ticket (auto-classified by AI)
 *     tags:
 *       - Support
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
 *               - description
 *             properties:
 *               description:
 *                 type: string
 *                 example: Driver was rude and overcharged me
 *               rideId:
 *                 type: integer
 *                 example: 5
 *     responses:
 *       201:
 *         description: Support ticket created (with ai_category / ai_priority)
 *       400:
 *         description: description is required
 *       401:
 *         description: Unauthorized - please login first
 *       404:
 *         description: Ride not found
 */
router.post('/', verifyJWT, createTicket);

/**
 * @swagger
 * /api/support/my:
 *   get:
 *     summary: Get the logged-in user's support tickets
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Support tickets fetched
 *       401:
 *         description: Unauthorized - please login first
 */
router.get('/my', verifyJWT, getMyTickets);

/**
 * @swagger
 * /api/support/{id}:
 *   get:
 *     summary: Get a single support ticket (owner or admin)
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Support ticket fetched
 *       401:
 *         description: Unauthorized - please login first
 *       403:
 *         description: Not authorized to view this ticket
 *       404:
 *         description: Support ticket not found
 */
router.get('/:id', verifyJWT, getTicketById);

/**
 * @swagger
 * /api/support/{id}/status:
 *   put:
 *     summary: Update ticket status (admin only; open -> in_progress -> resolved -> closed)
 *     tags:
 *       - Support
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
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
 *                 enum: [open, in_progress, resolved, closed]
 *                 example: in_progress
 *     responses:
 *       200:
 *         description: Support ticket status updated
 *       401:
 *         description: Unauthorized - please login first
 *       403:
 *         description: Only admins can update ticket status
 *       404:
 *         description: Support ticket not found
 */
router.put('/:id/status', verifyJWT, updateTicketStatus);

module.exports = router;
