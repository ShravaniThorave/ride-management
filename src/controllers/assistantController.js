// ============================================
// AI RIDE ASSISTANT CONTROLLER
// ============================================
// POST /api/assistant/ask  -> { query } => ride info answer

const Ride = require('../models/ride');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { parseIntent, answerQuery } = require('../services/ai.service');

/**
 * Ask the AI Ride Assistant.
 * Body: { "query": "show my last 5 rides" }
 * Auth: required (verifyJWT) so rides are scoped to the user.
 */
const askAssistant = asyncHandler(async (req, res) => {
    const { query } = req.body || {};

    if (!query || !String(query).trim()) {
        throw new ApiError(400, 'Query is required. Example: { "query": "show my recent rides" }');
    }

    const user = req.user;
    const role = user?.role || 'passenger';
    const { intent, rideId, limit } = parseIntent(query);

    let rides = [];
    let singleRide = null;
    let stats = null;

    try {
        stats = await Ride.getStatsForUser(user.id, role);

        if (rideId) {
            singleRide = await Ride.findByIdForUser(rideId, user.id, role);
            rides = singleRide ? [singleRide] : [];
        } else if (intent === 'active_rides') {
            rides = await Ride.findActiveByUser(user.id, role);
        } else if (intent === 'completed') {
            rides = (await Ride.findByUser(user.id, role, 50)).filter((r) => r.status === 'completed').slice(0, 10);
        } else if (intent === 'cancelled') {
            rides = (await Ride.findByUser(user.id, role, 50)).filter((r) => r.status === 'cancelled').slice(0, 10);
        } else {
            rides = await Ride.findByUser(user.id, role, limit || 5);
        }
    } catch (dbErr) {
        // DB unavailable -> still answer with AI/fallback, just without live data
        console.error('Assistant DB lookup failed:', dbErr.message);
    }

    const { answer, source } = await answerQuery(query, { rides, stats, singleRide });

    res.status(200).json(
        new ApiResponse(
            200,
            { query, intent, answer, source, rides, stats },
            'Assistant response generated'
        )
    );
});

/**
 * GET /api/assistant/help -> list example queries
 */
const assistantHelp = asyncHandler(async (req, res) => {
    res.status(200).json(
        new ApiResponse(
            200,
            {
                examples: [
                    'show my last 5 rides',
                    'where is my active ride?',
                    'what is the status of ride #2?',
                    'what is the fare of ride #2?',
                    'show my completed rides',
                    'show my cancelled rides',
                    'give me my ride summary',
                ],
            },
            'Assistant help'
        )
    );
});

module.exports = { askAssistant, assistantHelp };
