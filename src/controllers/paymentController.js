// ============================================
// PAYMENT CONTROLLER
// ============================================
// Purpose: Handle all payment-related HTTP requests
// Routes are wired in src/routes/payment.routes.js
// (all routes require auth via verifyJWT -> req.user)

const Payment = require('../models/payment');
const Passenger = require('../models/passenger');
const Ride = require('../models/ride');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/payments/process
 * Process a wallet payment for a ride.
 * Body: { "rideId": 1, "amount": 250, "payment_method": "wallet" (optional) }
 * Auth: required. Passenger is derived from req.user; the ride must
 * belong to that passenger. Driver is taken from the ride assignment.
 */
const processPayment = asyncHandler(async (req, res) => {
    const { rideId, amount, payment_method } = req.body || {};

    if (!rideId) {
        throw new ApiError(400, 'rideId is required');
    }

    if (amount === undefined || amount === null || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
        throw new ApiError(400, 'amount must be a number greater than 0');
    }

    // Passenger profile for the logged-in user (throws 404 if none)
    const passenger = await Passenger.findByUserId(req.user.id);

    // Ride must exist (throws 404 if not) and belong to this passenger
    const ride = await Ride.findById(rideId);

    if (Number(ride.passenger_id) !== Number(passenger.id)) {
        throw new ApiError(403, 'You are not authorized to pay for this ride');
    }

    if (!ride.driver_id) {
        throw new ApiError(400, 'No driver assigned to this ride yet. Payment cannot be processed');
    }

    const payment = await Payment.processPayment(
        rideId,
        passenger.id,
        ride.driver_id,
        Number(amount),
        payment_method || 'wallet'
    );

    res.status(201).json(new ApiResponse(201, payment, 'Payment processed successfully'));
});

/**
 * GET /api/payments/history
 * Get all payments for the logged-in user
 * (passenger payments made + driver payments earned).
 * Auth: required.
 */
const getHistory = asyncHandler(async (req, res) => {
    const history = await Payment.getPaymentHistory(req.user.id);

    res.status(200).json(new ApiResponse(200, history, 'Payment history fetched'));
});

module.exports = {
    processPayment,
    getHistory,
};
