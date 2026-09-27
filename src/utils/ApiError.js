// ============================================
// API ERROR UTILITY
// ============================================
// Purpose: Standardize all error API responses

class ApiError extends Error {
    constructor(statusCode, message = "Something went wrong", errors = [], stack = "") {
        super(message);
        this.statusCode = statusCode;
        this.data = null;
        this.errors = errors;
        this.success = false;
        
        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

module.exports = ApiError;

/**
 * USAGE:
 * throw new ApiError(404, "User not found");
 * throw new ApiError(409, "Email already exists");
 * throw new ApiError(400, "Invalid email format", ["Email must contain @"]);
 * 
 * RESPONSE:
 * {
 *   "statusCode": 404,
 *   "message": "User not found",
 *   "errors": [],
 *   "success": false
 * }
 */