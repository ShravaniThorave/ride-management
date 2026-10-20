const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/auth.middleware');
const { submitRating, getRideRatings, getMyRatings, getMyDriverRating, getMyPassengerRating } = require('../controllers/ratingController');

/**
 * @swagger
 * /api/ratings:
 *   post:
 *     summary: Submit a rating for a ride
 *     tags:
 *       - Ratings
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
 *               - rating
 *             properties:
 *               rideId:
 *                 type: integer
 *                 example: 1
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               comment:
 *                 type: string
 *                 example: Great ride!
 *     responses:
 *       201:
 *         description: Rating submitted successfully
 *       400:
 *         description: Missing rideId/rating, invalid rating, or unassigned driver
 *       401:
 *         description: Unauthorized - please login first
 *       403:
 *         description: You are not part of this ride
 *       404:
 *         description: Ride not found
 */
router.post('/', verifyJWT, submitRating);

/**
 * @swagger
 * /api/ratings/ride/{rideId}:
 *   get:
 *     summary: Get all ratings for a ride
 *     tags:
 *       - Ratings
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Ride ratings fetched
 *       400:
 *         description: rideId is required
 */
router.get('/ride/:rideId', getRideRatings);

/**
 * @swagger
 * /api/ratings/mine:
 *   get:
 *     summary: Get all ratings submitted by the logged-in user
 *     tags:
 *       - Ratings
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Ratings fetched
 *       401:
 *         description: Unauthorized - please login first
 */
router.get('/mine', verifyJWT, getMyRatings);

/**
 * @swagger
 * /api/ratings/driver:
 *   get:
 *     summary: Get the logged-in driver's average rating
 *     tags:
 *       - Ratings
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Driver rating fetched
 *       401:
 *         description: Unauthorized - please login first
 */
router.get('/driver', verifyJWT, getMyDriverRating);

/**
 * @swagger
 * /api/ratings/passenger:
 *   get:
 *     summary: Get the logged-in passenger's average rating
 *     tags:
 *       - Ratings
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Passenger rating fetched
 *       401:
 *         description: Unauthorized - please login first
 */
router.get('/passenger', verifyJWT, getMyPassengerRating);

module.exports = router;
