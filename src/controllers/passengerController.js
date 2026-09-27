// ============================================
// PASSENGER CONTROLLER
// ============================================
// Purpose: Handle all passenger-related HTTP requests
// Routes are wired in src/routes/passenger.routes.js
// (all routes require auth via verifyJWT -> req.user)

const Passenger = require('../models/passenger');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Shape a passenger row into the public profile format.
 * NOTE: DB column is `rating_average` (see src/db/schema.sql);
 * exposed as `rating` for API consumers, with `rating_average` kept as alias.
 */
const toProfile = (p) => ({
    id: p.id,
    user_id: p.user_id,
    wallet_balance: Number(p.wallet_balance),
    rating: Number(p.rating_average),
    rating_average: Number(p.rating_average),
    total_rides: p.total_rides,
});

/**
 * GET /api/passengers/me
 * Get the logged-in user's passenger profile.
 * Auth: required (verifyJWT attaches req.user; 401 if missing/invalid).
 */
const getMyProfile = asyncHandler(async (req, res) => {
    // Passenger model throws 404 ApiError if no profile exists
    const passenger = await Passenger.findByUserId(req.user.id);

    res.status(200).json(
        new ApiResponse(200, toProfile(passenger), 'Passenger profile fetched')
    );
});

/**
 * POST /api/passengers
 * Auto-create a passenger profile linked to the logged-in user.
 * Body: { } (optional: { "wallet_balance": 0, "emergency_contact": "..." })
 * Model throws 409 ApiError if a profile already exists for this user.
 */
const createPassenger = asyncHandler(async (req, res) => {
    const { wallet_balance, emergency_contact } = req.body || {};

    const passenger = await Passenger.create(req.user.id, {
        ...(wallet_balance !== undefined && { wallet_balance }),
        ...(emergency_contact !== undefined && { emergency_contact }),
    });

    res.status(201).json(
        new ApiResponse(201, toProfile(passenger), 'Passenger profile created')
    );
});

/**
 * POST /api/passengers/wallet/add
 * Add money to the logged-in user's passenger wallet.
 * Body: { "amount": 500 } (must be > 0)
 */
const addWallet = asyncHandler(async (req, res) => {
    const { amount } = req.body || {};
    const value = Number(amount);

    if (amount === undefined || amount === null || Number.isNaN(value)) {
        throw new ApiError(400, 'Amount is required and must be a number');
    }

    if (value <= 0) {
        throw new ApiError(400, 'Amount must be greater than 0');
    }

    const passenger = await Passenger.findByUserId(req.user.id);
    const updated = await Passenger.updateWallet(passenger.id, value);

    res.status(200).json(
        new ApiResponse(
            200,
            { wallet_balance: Number(updated.wallet_balance) },
            'Wallet balance updated'
        )
    );
});

/**
 * GET /api/passengers/wallet
 * Get the logged-in user's current wallet balance.
 * Model throws 404 ApiError if no passenger profile exists.
 */
const getWallet = asyncHandler(async (req, res) => {
    const passenger = await Passenger.findByUserId(req.user.id);

    res.status(200).json(
        new ApiResponse(
            200,
            { wallet_balance: Number(passenger.wallet_balance) },
            'Wallet balance fetched'
        )
    );
});

module.exports = {
    getMyProfile,
    createPassenger,
    addWallet,
    getWallet,
};
