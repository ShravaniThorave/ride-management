// ============================================
// AUTH MIDDLEWARE
// ============================================
// Purpose: Verify JWT tokens on protected routes
// Only logged-in users can access protected routes

const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const User = require('../models/user');

/**
 * WHAT IS JWT?
 * 
 * JWT = JSON Web Token
 * 
 * Structure: header.payload.signature
 * Example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoic2hyYXZhbmlAZXhhbXBsZS5jb20ifQ.xyz...
 * 
 * How login works:
 * 1. User sends email & password
 * 2. Server verifies password
 * 3. Server creates JWT with user's ID
 * 4. JWT sent to browser (in cookie or header)
 * 5. Browser stores JWT
 * 
 * How JWT protects routes:
 * 1. User tries to access /api/profile
 * 2. Browser sends JWT in request
 * 3. Middleware verifies JWT signature
 * 4. If valid: Attach user to request, allow access
 * 5. If invalid: Reject with 401 Unauthorized
 */

/**
 * verifyJWT Middleware
 * 
 * Checks if request has valid JWT token
 * If valid: Attaches user info to req.user
 * If invalid: Throws error
 * 
 * Usage in routes:
 * router.get('/profile', verifyJWT, async (req, res) => {
 *     // req.user is now available!
 *     res.json(req.user);
 * });
 */
const verifyJWT = async (req, res, next) => {
    try {
        // Get token from cookie or authorization header
        let token;
        
        // Try to get from cookie first
        if (req.cookies && req.cookies.accessToken) {
            token = req.cookies.accessToken;
        }
        // Or from Authorization header (Bearer token)
        else if (req.headers.authorization) {
            token = req.headers.authorization.replace("Bearer ", "");
        }
        
        // If no token found
        if (!token) {
            throw new ApiError(401, "No token provided. Please login first");
        }
        
        // Verify token signature using JWT_SECRET
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            throw new ApiError(401, "User not found. Invalid token");
        }
        
        // Attach user to request object
        // Now route handlers can access req.user
        req.user = user;
        
        // Pass to next middleware/route handler
        next();
        
    } catch (error) {
        if (error instanceof ApiError) {
            return res.status(error.statusCode).json({
                statusCode: error.statusCode,
                message: error.message,
                success: false
            });
        }
        
        // JWT verification error
        res.status(401).json({
            statusCode: 401,
            message: "Invalid or expired token",
            success: false
        });
    }
};

module.exports = verifyJWT;

/**
 * FLOW DIAGRAM:
 * 
 * REQUEST COMES IN
 *     ↓
 * Is there a token in cookie or header?
 *     ├─ NO → Throw error 401 (not logged in)
 *     └─ YES → Continue
 *     ↓
 * Is token valid? (check signature with JWT_SECRET)
 *     ├─ NO → Throw error 401 (invalid/expired)
 *     └─ YES → Continue
 *     ↓
 * Extract userId from token
 *     ↓
 * Find user in database by userId
 *     ├─ NOT FOUND → Throw error 401
 *     └─ FOUND → Continue
 *     ↓
 * Attach user to req.user
 *     ↓
 * Pass to route handler (next())
 *     ↓
 * Route handler has access to req.user
 * 
 * EXAMPLE USAGE:
 * 
 * // Protected route (needs login)
 * router.get('/profile', verifyJWT, async (req, res) => {
 *     // req.user is available here!
 *     // Contains: id, name, email, role, etc
 *     res.json({
 *         message: "User profile",
 *         user: req.user
 *     });
 * });
 * 
 * // Public route (no login needed)
 * router.get('/public', async (req, res) => {
 *     // req.user is NOT available here
 *     res.json({ message: "Public data" });
 * });
 * 
 * FLOW WITH REQUESTS:
 * 
 * Request 1 (Logged out):
 * GET /profile
 * Headers: (no token)
 * Response: 401 "No token provided"
 * 
 * Request 2 (Invalid token):
 * GET /profile
 * Headers: Authorization: "invalid.token.here"
 * Response: 401 "Invalid or expired token"
 * 
 * Request 3 (Valid token):
 * GET /profile
 * Headers: Cookie: accessToken=eyJhbGc...
 * Middleware verifies token
 * Middleware finds user in database
 * Middleware does: req.user = { id: 1, name: 'Shravani', ... }
 * Route handler executes with req.user available
 * Response: 200 { user: { id: 1, name: 'Shravani', ... } }
 */