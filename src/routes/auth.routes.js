const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); 
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const verifyJWT = require('../middlewares/auth.middleware');

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Shravani Thorave
 *               email:
 *                 type: string
 *                 example: shravani@example.com
 *               password:
 *                 type: string
 *                 example: Password123
 *               phone:
 *                 type: string
 *                 example: "9876543210"
 *               role:
 *                 type: string
 *                 enum: [passenger, driver, admin]
 *                 example: passenger
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Bad request
 *       409:
 *         description: Email already exists
 */
router.post('/register', asyncHandler(async (req, res) => {
    const { name, email, password, phone, role } = req.body;
    
    if (!name || !name.trim()) {
        throw new ApiError(400, "Name is required");
    }
    
    if (!email || !email.trim()) {
        throw new ApiError(400, "Email is required");
    }
    
    if (!password) {
        throw new ApiError(400, "Password is required");
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new ApiError(400, "Invalid email format");
    }
    
    if (password.length < 6) {
        throw new ApiError(400, "Password must be at least 6 characters");
    }
    
    const emailExists = await User.emailExists(email);
    if (emailExists) {
        throw new ApiError(409, "Email already registered. Please login or use different email");
    }
    
    const newUser = await User.create({
        name,
        email,
        password,
        phone,
        role
    });
    
    res.status(201).json(
        new ApiResponse(
            201,
            newUser,
            "User registered successfully. Please login."
        )
    );
}));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: shravani@example.com
 *               password:
 *                 type: string
 *                 example: Password123
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !email.trim()) {
        throw new ApiError(400, "Email is required");
    }
    
    if (!password) {
        throw new ApiError(400, "Password is required");
    }
    
    const user = await User.findByEmail(email);
    
    if (!user) {
        throw new ApiError(401, "Invalid email or password");
    }
    
    const isPasswordCorrect = await User.verifyPassword(password, user.password_hash);
    
    if (!isPasswordCorrect) {
        throw new ApiError(401, "Invalid email or password");
    }
    
    const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
    
    res.cookie('accessToken', token, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
    });
    
    const userWithoutPassword = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
    };
    
    res.status(200).json(
        new ApiResponse(
            200,
            {
                user: userWithoutPassword,
                token: token
            },
            "Login successful"
        )
    );
}));

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User profile fetched
 *       401:
 *         description: Unauthorized
 */
router.get('/me', verifyJWT, asyncHandler(async (req, res) => {
    const userWithoutPassword = {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role
    };
    
    res.status(200).json(
        new ApiResponse(200, userWithoutPassword, "User profile fetched")
    );
}));

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', verifyJWT, asyncHandler(async (req, res) => {
    res.clearCookie('accessToken');
    
    res.status(200).json(
        new ApiResponse(200, {}, "Logout successful")
    );
}));

module.exports = router;