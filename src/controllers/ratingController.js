// ============================================
// RATING CONTROLLER
// ============================================
// Purpose: Handle all rating-related HTTP requests
// Routes are wired in src/routes/rating.routes.js

const Rating = require('../models/rating');
const Driver = require('../models/driver');
const Passenger = require('../models/passenger');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/ratings
 * Submit a rating for a ride (passenger rates the driver, or vice versa).
 * Body: { "rideId": 1, "rating": 5, "comment": "Great ride!" (optional) }
 * Auth: required (verifyJWT -> req.user is the rater).
 */
const submitRating = asyncHandler(async (req, res) => {
    const { rideId, rating: ratingValue, comment } = req.body || {};

    if (!rideId) {
        throw new ApiError(400, 'rideId is required');
    }

    if (ratingValue === undefined || ratingValue === null) {
        throw new ApiError(400, 'rating is required (integer 1-5)');
    }

    // Model throws 400/403/404 ApiError for invalid value, non-participant,
    // missing ride, or unassigned driver
    const created = await Rating.submitRating(
        Number(rideId),
        req.user.id,
        ratingValue,
        comment ?? null
    );

    res.status(201).json(
        new ApiResponse(201, created, 'Rating submitted successfully')
    );
});

/**
 * GET /api/ratings/ride/:rideId
 * Get all ratings for a ride (newest first).
 * Auth: not required (public).
 */
const getRideRatings = asyncHandler(async (req, res) => {
    const ratings = await Rating.getRideRatings(Number(req.params.rideId));

    res.status(200).json(
        new ApiResponse(200, ratings, 'Ride ratings fetched')
    );
});

/**
 * GET /api/ratings/mine
 * Get all ratings submitted by the logged-in user,
 * so the dashboard can flag rides that are already rated.
 * Auth: required.
 */
const getMyRatings = asyncHandler(async (req, res) => {
    const ratings = await Rating.getRatingsByRater(req.user.id);

    res.status(200).json(
        new ApiResponse(200, ratings, 'My ratings fetched')
    );
});

/**
 * GET /api/ratings/driver
 * Get the logged-in driver's average rating.
 * Auth: required.
 */
const getMyDriverRating = asyncHandler(async (req, res) => {
    // Driver model throws 404 ApiError if no profile exists
    const driver = await Driver.findByUserId(req.user.id);
    const rating = await Rating.getDriverRating(driver.id);

    res.status(200).json(
        new ApiResponse(200, rating, 'Driver rating fetched')
    );
});

/**
 * GET /api/ratings/passenger
 * Get the logged-in passenger's average rating.
 * Auth: required.
 */
const getMyPassengerRating = asyncHandler(async (req, res) => {
    // Passenger model throws 404 ApiError if no profile exists
    const passenger = await Passenger.findByUserId(req.user.id);
    const rating = await Rating.getPassengerRating(passenger.id);

    res.status(200).json(
        new ApiResponse(200, rating, 'Passenger rating fetched')
    );
});

module.exports = {
    submitRating,
    getRideRatings,
    getMyRatings,
    getMyDriverRating,
    getMyPassengerRating,
};
