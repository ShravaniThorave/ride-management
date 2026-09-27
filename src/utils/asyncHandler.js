// ============================================
// ASYNC HANDLER UTILITY
// ============================================
// Purpose: Wrap async functions to catch errors automatically

const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
    };
};

module.exports = asyncHandler;

/**
 * HOW IT WORKS:
 * 
 * Without asyncHandler (repetitive):
 * app.post('/login', async (req, res) => {
 *     try {
 *         // ... code ...
 *     } catch (error) {
 *         res.status(500).json({ error: error.message });
 *     }
 * });
 * 
 * With asyncHandler (clean):
 * app.post('/login', asyncHandler(async (req, res) => {
 *     // ... code ...
 *     // Errors are caught automatically!
 * }));
 * 
 * Any error thrown or promise rejection is caught
 * and passed to error middleware automatically!
 */