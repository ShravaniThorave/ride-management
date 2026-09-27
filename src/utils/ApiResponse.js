// ============================================
// API RESPONSE UTILITY
// ============================================
// Purpose: Standardize all successful API responses

class ApiResponse {
    constructor(statusCode, data, message = "Success") {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = statusCode < 400;
    }
}

module.exports = ApiResponse;

/**
 * USAGE:
 * res.status(201).json(
 *     new ApiResponse(201, user, "User created successfully")
 * );
 * 
 * RESPONSE:
 * {
 *   "statusCode": 201,
 *   "data": { "id": 1, "name": "Shravani", ... },
 *   "message": "User created successfully",
 *   "success": true
 * }
 */