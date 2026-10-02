// ============================================
// SUPPORT TICKET MODEL
// ============================================
// Purpose: Handle all support-ticket database operations
// Used by Support Ticket Classifier to store + track user complaints

const pool = require('../db/db');
const ApiError = require('../utils/ApiError');

/**
 * SupportTicket Model
 *
 * Table (see src/db/schema.sql -> support_tickets):
 *  id, user_id, ride_id, complaint_text,
 *  ai_category, ai_priority ('low','medium','high','critical'),
 *  status ('open','in_progress','resolved','closed'),
 *  resolution_text, created_at, updated_at
 *
 * NOTE: The classifier spec uses priority "urgent".
 *  The DB ENUM uses "critical" instead, so "urgent" is
 *  normalized to "critical" before writes.
 */
class SupportTicket {
    /**
     * Allowed ticket statuses (matches ENUM in schema).
     */
    static get STATUSES() {
        return ['open', 'in_progress', 'resolved', 'closed'];
    }

    /**
     * Valid forward transitions:
     * open -> in_progress -> resolved -> closed
     * closed is terminal.
     */
    static get ALLOWED_TRANSITIONS() {
        return {
            open: ['in_progress'],
            in_progress: ['resolved'],
            resolved: ['closed'],
            closed: [],
        };
    }

    /**
     * Normalize classifier priority to DB ENUM value.
     * "urgent" (spec) -> "critical" (DB).
     */
    static normalizePriority(priority) {
        if (priority === 'urgent') return 'critical';
        return priority;
    }

    /**
     * CREATE TICKET
     * Saves a new support ticket to the database.
     * Auto-classifies the description via aiClassifier
     * to fill ai_category / ai_priority.
     *
     * @param {number} userId - users.id (required)
     * @param {number|null} rideId - rides.id (optional, may be null)
     * @param {string} description - complaint text (required)
     * @returns {Object} - Created ticket object
     */
    static async create(userId, rideId, description) {
        if (!userId) {
            throw new ApiError(400, 'userId is required');
        }

        if (!description || !String(description).trim()) {
            throw new ApiError(400, 'description is required');
        }

        const cleanDescription = String(description).trim();
        const cleanRideId = rideId === undefined || rideId === null || rideId === '' ? null : Number(rideId);

        if (cleanRideId !== null && Number.isNaN(cleanRideId)) {
            throw new ApiError(400, 'rideId must be a valid number or null');
        }

        const connection = await pool.getConnection();

        try {
            // Verify user exists
            const [users] = await connection.query('SELECT id FROM users WHERE id = ?', [userId]);
            if (users.length === 0) {
                throw new ApiError(404, 'User not found. Cannot create ticket');
            }

            // Verify ride exists (if provided)
            if (cleanRideId !== null) {
                const [rides] = await connection.query('SELECT id FROM rides WHERE id = ?', [cleanRideId]);
                if (rides.length === 0) {
                    throw new ApiError(404, 'Ride not found. Cannot create ticket');
                }
            }

            // Classify issue (Gemini or regex fallback).
            // Lazy require to avoid circular deps (aiClassifier does not require this model).
            let ai_category = null;
            let ai_priority = 'medium';
            try {
                const { classifyIssue } = require('../services/aiClassifier');
                const result = await classifyIssue(cleanDescription);
                if (result) {
                    if (result.category) ai_category = result.category;
                    if (result.priority) ai_priority = SupportTicket.normalizePriority(result.priority);
                }
            } catch (err) {
                // Classification must never block ticket creation
                console.error('Ticket auto-classification failed:', err.message);
            }

            const query = `
                INSERT INTO support_tickets
                    (user_id, ride_id, complaint_text, ai_category, ai_priority, status)
                VALUES (?, ?, ?, ?, ?, 'open')
            `;

            const [result] = await connection.query(query, [
                userId,
                cleanRideId,
                cleanDescription,
                ai_category,
                ai_priority,
            ]);

            return await SupportTicket.findById(result.insertId);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to create support ticket: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * FIND TICKET BY ID
     * Gets a ticket by its support_tickets.id with user info.
     *
     * @param {number} ticketId - support_tickets.id to search for
     * @returns {Object} - Ticket object
     */
    static async findById(ticketId) {
        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT t.*,
                       u.name AS user_name,
                       u.email AS user_email
                FROM support_tickets t
                LEFT JOIN users u ON t.user_id = u.id
                WHERE t.id = ?
            `;

            const [rows] = await connection.query(query, [ticketId]);

            if (rows.length === 0) {
                throw new ApiError(404, 'Support ticket not found');
            }

            return rows[0];
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to find support ticket: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * GET TICKETS BY USER ID
     * Gets all tickets filed by a user (newest first).
     *
     * @param {number} userId - users.id to search for
     * @returns {Array} - List of ticket objects
     */
    static async getByUserId(userId) {
        if (!userId) {
            throw new ApiError(400, 'userId is required');
        }

        const connection = await pool.getConnection();

        try {
            const query = `
                SELECT *
                FROM support_tickets
                WHERE user_id = ?
                ORDER BY created_at DESC
            `;

            const [rows] = await connection.query(query, [userId]);

            return rows;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to fetch tickets for user: ${error.message}`);
        } finally {
            connection.release();
        }
    }

    /**
     * UPDATE STATUS
     * Updates the ticket status following the flow:
     * open -> in_progress -> resolved -> closed
     *
     * @param {number} ticketId - Ticket ID
     * @param {string} status - One of: open, in_progress, resolved, closed
     * @returns {Object} - Updated ticket object
     */
    static async updateStatus(ticketId, status) {
        if (!SupportTicket.STATUSES.includes(status)) {
            throw new ApiError(400, `Status must be one of: ${SupportTicket.STATUSES.join(', ')}`);
        }

        const connection = await pool.getConnection();

        try {
            // Fetch current status to validate the transition
            const [existing] = await connection.query('SELECT id, status FROM support_tickets WHERE id = ?', [
                ticketId,
            ]);

            if (existing.length === 0) {
                throw new ApiError(404, 'Support ticket not found. Status not updated');
            }

            const currentStatus = existing[0].status;

            // No-op: same status returns the ticket as-is
            if (currentStatus !== status) {
                const allowed = SupportTicket.ALLOWED_TRANSITIONS[currentStatus] || [];
                if (!allowed.includes(status)) {
                    throw new ApiError(
                        400,
                        `Invalid status transition: ${currentStatus} -> ${status}. Expected flow: open -> in_progress -> resolved -> closed`
                    );
                }

                const [result] = await connection.query('UPDATE support_tickets SET status = ? WHERE id = ?', [
                    status,
                    ticketId,
                ]);

                if (result.affectedRows === 0) {
                    throw new ApiError(404, 'Support ticket not found. Status not updated');
                }
            }

            return await SupportTicket.findById(ticketId);
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, `Failed to update ticket status: ${error.message}`);
        } finally {
            connection.release();
        }
    }
}

module.exports = SupportTicket;

/**
 * USAGE EXAMPLES:
 *
 * // Create a ticket (auto-classified)
 * const ticket = await SupportTicket.create(1, 5, 'Driver was rude and overcharged me');
 *
 * // Get ticket details
 * const ticket = await SupportTicket.findById(1);
 *
 * // Get user's tickets
 * const tickets = await SupportTicket.getByUserId(1);
 *
 * // Move ticket through the flow
 * await SupportTicket.updateStatus(1, 'in_progress');
 * await SupportTicket.updateStatus(1, 'resolved');
 * await SupportTicket.updateStatus(1, 'closed');
 */
