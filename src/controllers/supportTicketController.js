// ============================================
// SUPPORT TICKET CONTROLLER
// ============================================
// Purpose: Handle all support-ticket HTTP requests.
// Routes are wired in src/routes/support.routes.js
// - creation: any logged-in user
// - status updates: admin only (open -> in_progress -> resolved -> closed)

const SupportTicket = require('../models/supportTicket');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/support
 * File a new support ticket (auto-classified by the AI classifier).
 * Body: { "description": "...", "rideId": 1 (optional) }
 * Auth: required.
 */
const createTicket = asyncHandler(async (req, res) => {
    const { description, rideId } = req.body || {};

    if (!description || !String(description).trim()) {
        throw new ApiError(400, 'description is required');
    }

    // Model throws 400/404 ApiError for missing description or unknown ride
    const ticket = await SupportTicket.create(req.user.id, rideId ?? null, description);

    res.status(201).json(
        new ApiResponse(201, ticket, 'Support ticket created')
    );
});

/**
 * GET /api/support/my
 * Get the logged-in user's tickets (newest first).
 * Auth: required.
 */
const getMyTickets = asyncHandler(async (req, res) => {
    const tickets = await SupportTicket.getByUserId(req.user.id);

    res.status(200).json(
        new ApiResponse(200, tickets, 'Support tickets fetched')
    );
});

/**
 * GET /api/support/:id
 * Get a single ticket. Users see their own tickets; admins see any ticket.
 * Auth: required.
 */
const getTicketById = asyncHandler(async (req, res) => {
    const ticket = await SupportTicket.findById(Number(req.params.id));

    if (req.user.role !== 'admin' && Number(ticket.user_id) !== Number(req.user.id)) {
        throw new ApiError(403, 'You are not authorized to view this ticket');
    }

    res.status(200).json(
        new ApiResponse(200, ticket, 'Support ticket fetched')
    );
});

/**
 * PUT /api/support/:id/status
 * Move a ticket through the flow: open -> in_progress -> resolved -> closed.
 * Body: { "status": "in_progress" }
 * Auth: required, admin only.
 */
const updateTicketStatus = asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
        throw new ApiError(403, 'Only admins can update ticket status');
    }

    const { status } = req.body || {};

    // Model throws 400/404 ApiError for invalid status or unknown ticket
    const ticket = await SupportTicket.updateStatus(Number(req.params.id), status);

    res.status(200).json(
        new ApiResponse(200, ticket, 'Support ticket status updated')
    );
});

module.exports = {
    createTicket,
    getMyTickets,
    getTicketById,
    updateTicketStatus,
};
