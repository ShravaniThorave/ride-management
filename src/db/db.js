const mysql = require('mysql2/promise');

require('dotenv').config();
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_password,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

});

    const testConnection = async () => {

    try {
        const connection = await pool.getConnection();
        await connection.query('SELECT 1');
        connection.release();
        console.log('Database connected successfully!');
    } 
    catch (error) {
        console.log('Database connection FAILED!');
        console.log('Error:', error.message);
        process.exit(1);
    }
};

testConnection();  
module.exports = pool;