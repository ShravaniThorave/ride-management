const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/auth.middleware');
const {
    bookRide,
    acceptRide,
    startRide,
    completeRide,
    getRideById,
    getMyRides,
    getRidesByStatus,
} = require('../controllers/rideController');

/**
 * @swagger
 * /api/rides/book:
 *   post:
 *     summary: Book a new ride (status = requested)
 *     tags:
 *       - Rides
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
 *               - pickup_location
 *               - dropoff_location
 *             properties:
 *               pickup_location:
 *                 type: string
 *                 example: "Andheri"
 *               dropoff_location:
 *                 type: string
 *                 example: "Bandra"
 *               distance_km:
 *                 type: number
 *                 example: 12.5
 *     responses:
 *       201:
 *         description: Ride booked successfully
 *       400:
 *         description: pickup_location / dropoff_location is required
 *       401:
 *         description: Unauthorized - please login first
 *       404:
 *         description: Passenger profile not found
 */
router.post('/book', verifyJWT, bookRide);

/**
 * @swagger
 * /api/rides/{id}/accept:
 *   put:
 *     summary: Driver accepts a requested ride (requested -> accepted)
 *     tags:
 *       - Rides
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
 *         description: Ride accepted
 *       400:
 *         description: Ride cannot be accepted (already accepted or invalid status)
 *       401:
 *         description: Unauthorized - please login first
 *       404:
 *         description: Ride not found
 */
router.put('/:id/accept', verifyJWT, acceptRide);

/**
 * @swagger
 * /api/rides/{id}/start:
 *   put:
 *     summary: Driver starts an accepted ride (accepted -> started)
 *     tags:
 *       - Rides
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
 *         description: Ride started
 *       400:
 *         description: Ride cannot be started (ride not accepted)
 *       401:
 *         description: Unauthorized - please login first
 *       404:
 *         description: Ride not found
 */
router.put('/:id/start', verifyJWT, startRide);

/**
 * @swagger
 * /api/rides/{id}/complete:
 *   put:
 *     summary: Complete a started ride (started -> completed)
 *     tags:
 *       - Rides
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
 *               - distance_km
 *             properties:
 *               distance_km:
 *                 type: number
 *                 example: 12.5
 *     responses:
 *       200:
 *         description: Ride completed
 *       400:
 *         description: Ride cannot be completed or distance_km is invalid
 *       401:
 *         description: Unauthorized - please login first
 *       404:
 *         description: Ride not found
 */
router.put('/:id/complete', verifyJWT, completeRide);

/**
 * @swagger
 * /api/rides/my:
 *   get:
 *     summary: Get all rides for the logged-in user
 *     tags:
 *       - Rides
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Rides fetched
 *       401:
 *         description: Unauthorized - please login first
 */
router.get('/my', verifyJWT, getMyRides);

/**
 * @swagger
 * /api/rides/status/{status}:
 *   get:
 *     summary: Get rides with a specific status (public)
 *     tags:
 *       - Rides
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [requested, accepted, started, completed, cancelled]
 *         example: requested
 *     responses:
 *       200:
 *         description: Rides fetched
 *       400:
 *         description: Invalid status
 */
router.get('/status/:status', getRidesByStatus);

/**
 * @swagger
 * /api/rides/{id}:
 *   get:
 *     summary: Get a single ride by id (scoped to the logged-in user)
 *     tags:
 *       - Rides
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
 *         description: Ride fetched
 *       401:
 *         description: Unauthorized - please login first
 *       403:
 *         description: Forbidden - not authorized to view this ride
 *       404:
 *         description: Ride not found or unauthorized
 */
router.get('/:id', verifyJWT, getRideById);

module.exports = router;
