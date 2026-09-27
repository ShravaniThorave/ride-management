const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/auth.middleware');
const { askAssistant, assistantHelp } = require('../controllers/assistantController');

/**
 * @swagger
 * /api/assistant/help:
 *   get:
 *     summary: Get example queries for the AI Ride Assistant
 *     tags:
 *       - Assistant
 *     responses:
 *       200:
 *         description: Example queries
 */
router.get('/help', assistantHelp);

/**
 * @swagger
 * /api/assistant/ask:
 *   post:
 *     summary: Ask the AI Ride Assistant about your rides
 *     tags:
 *       - Assistant
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
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 example: show my last 5 rides
 *     responses:
 *       200:
 *         description: Assistant answer with ride info
 *       400:
 *         description: Query missing
 *       401:
 *         description: Unauthorized
 */
router.post('/ask', verifyJWT, askAssistant);

module.exports = router;
