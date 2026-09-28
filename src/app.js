// ============================================
// IMPORTS (in correct order)
// ============================================

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const authRoutes = require('./routes/auth.routes');
const assistantRoutes = require('./routes/assistant.routes');
const passengerRoutes = require('./routes/passenger.routes');
const driverRoutes = require('./routes/driver.routes');
const rideRoutes = require('./routes/ride.routes');

// ============================================
// CREATE EXPRESS APP
// ============================================
const app = express();

// ============================================
// MIDDLEWARES
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(cookieParser());

// ============================================
// SWAGGER DOCUMENTATION
// ============================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ============================================
// HOME ROUTE
// ============================================
app.get('/', (req, res) => {
    res.json({ 
        message: '🚀 AI Ride Management System API is running!',
        version: '1.0.0',
        docs: 'Visit http://localhost:5000/api-docs for API documentation'
    });
});

// ============================================
// AUTH ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/passengers', passengerRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/rides', rideRoutes);

// ============================================
// ERROR HANDLER (Must be LAST)
// ============================================
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(err.statusCode || 500).json({ 
        error: err.message 
    });
});

// ============================================
// EXPORT APP
// ============================================
module.exports = app;