// ============================================
// USER MODEL
// ============================================
// Purpose: Handle all user-related database operations
// This file contains functions to create, find, update users

const pool = require('../db/db');
const bcrypt = require('bcrypt');

/**
 * User Model
 * 
 * Contains all database operations for users:
 * - Create user
 * - Find user by email
 * - Find user by ID
 * - Verify password
 * - etc
 */
class User {
    /**
     * CREATE USER
     * Registers a new user in the database
     * 
     * @param {string} name - User's name
     * @param {string} email - User's email (unique)
     * @param {string} password - Plain password (will be hashed)
     * @param {string} phone - User's phone number
     * @param {string} role - User role (passenger/driver/admin)
     * @returns {Object} - Created user object
     */
    static async create({ name, email, password, phone, role = 'passenger' }) {
        // Get connection from pool
        const connection = await pool.getConnection();
        
        try {
            // Hash the password using bcrypt
            // bcrypt.hash(password, saltRounds)
            // saltRounds = 10 means 2^10 iterations (security vs speed tradeoff)
            const hashedPassword = await bcrypt.hash(password, 3);
            
            // Insert user into database
            const query = `
                INSERT INTO users (name, email, password_hash, phone, role)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            const [result] = await connection.query(query, [
                name,
                email,
                hashedPassword,
                phone,
                role
            ]);
            
            // Return created user (without password)
            return {
                id: result.insertId,
                name,
                email,
                phone,
                role,
                created_at: new Date()
            };
            
        } finally {
            // Always release connection back to pool
            connection.release();
        }
    }
    
    /**
     * FIND USER BY EMAIL
     * Finds a user in database by their email
     * 
     * @param {string} email - Email to search for
     * @returns {Object|null} - User object if found, null if not found
     */
    static async findByEmail(email) {
        const connection = await pool.getConnection();
        
        try {
            const query = `
                SELECT id, name, email, password_hash, phone, role, created_at
                FROM users
                WHERE email = ?
            `;
            
            const [rows] = await connection.query(query, [email]);
            
            // Return first row if found, null otherwise
            return rows.length > 0 ? rows[0] : null;
            
        } finally {
            connection.release();
        }
    }
    
    /**
     * FIND USER BY ID
     * Finds a user by their ID
     * 
     * @param {number} id - User ID
     * @returns {Object|null} - User object if found
     */
    static async findById(id) {
        const connection = await pool.getConnection();
        
        try {
            const query = `
                SELECT id, name, email, phone, role, created_at, updated_at
                FROM users
                WHERE id = ?
            `;
            
            const [rows] = await connection.query(query, [id]);
            
            return rows.length > 0 ? rows[0] : null;
            
        } finally {
            connection.release();
        }
    }
    
    /**
     * VERIFY PASSWORD
     * Compares entered password with stored hashed password
     * 
     * How it works:
     * 1. User enters plain password
     * 2. Hash the entered password
     * 3. Compare hashes (bcrypt does this safely)
     * 4. Return true if match, false otherwise
     * 
     * Why bcrypt?
     * - Slow hashing (prevents brute force attacks)
     * - Salt included (same password = different hash each time)
     * - Industry standard for password hashing
     * 
     * @param {string} plainPassword - The password user entered
     * @param {string} hashedPassword - The password hash from database
     * @returns {boolean} - true if passwords match, false otherwise
     */
    static async verifyPassword(plainPassword, hashedPassword) {
        // bcrypt.compare() safely compares without reversing hash
        // This is the correct way to verify passwords
        return await bcrypt.compare(plainPassword, hashedPassword);
    }
    
    /**
     * UPDATE USER
     * Updates user's profile information
     * 
     * @param {number} id - User ID
     * @param {Object} updates - Object with fields to update
     * @returns {Object} - Updated user object
     */
    static async update(id, { name, phone, role }) {
        const connection = await pool.getConnection();
        
        try {
            const query = `
                UPDATE users
                SET name = ?, phone = ?, role = ?
                WHERE id = ?
            `;
            
            await connection.query(query, [name, phone, role, id]);
            
            // Return updated user
            return await User.findById(id);
            
        } finally {
            connection.release();
        }
    }
    
    /**
     * CHECK IF EMAIL EXISTS
     * Checks if email is already registered
     * 
     * @param {string} email - Email to check
     * @returns {boolean} - true if exists, false if not
     */
    static async emailExists(email) {
        const user = await User.findByEmail(email);
        return user !== null;
    }
}

module.exports = User;

/**
 * USAGE EXAMPLES:
 * 
 * // Create a new user
 * const newUser = await User.create({
 *     name: 'Shravani',
 *     email: 'shravani@example.com',
 *     password: 'securePassword123',
 *     phone: '9876543210',
 *     role: 'passenger'
 * });
 * 
 * // Find user by email
 * const user = await User.findByEmail('shravani@example.com');
 * 
 * // Find user by ID
 * const user = await User.findById(1);
 * 
 * // Verify password during login
 * const isPasswordCorrect = await User.verifyPassword(
 *     enteredPassword,
 *     userFromDatabase.password_hash
 * );
 * 
 * // Check if email already exists
 * const exists = await User.emailExists('shravani@example.com');
 * 
 * // Update user
 * const updated = await User.update(1, {
 *     name: 'Shravani Thorave',
 *     phone: '9876543210',
 *     role: 'driver'
 * });
 */