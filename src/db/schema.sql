-- ============================================
-- RIDE MANAGEMENT AI SYSTEM DATABASE SCHEMA
-- ============================================
-- This file contains all SQL queries to create
-- the database structure for the ride management system

-- ============================================
-- 1. USERS TABLE (Base user data)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(15),
    role ENUM('passenger', 'driver', 'admin') DEFAULT 'passenger',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. PASSENGERS TABLE (Passenger-specific data)
-- ============================================
CREATE TABLE IF NOT EXISTS passengers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    total_rides INT DEFAULT 0,
    rating_average FLOAT DEFAULT 0.0,
    wallet_balance DECIMAL(10, 2) DEFAULT 0.00,
    emergency_contact VARCHAR(15),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. DRIVERS TABLE (Driver-specific data)
-- ============================================
CREATE TABLE IF NOT EXISTS drivers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    license_number VARCHAR(50) UNIQUE NOT NULL,
    is_online BOOLEAN DEFAULT FALSE,
    rating_average FLOAT DEFAULT 0.0,
    total_rides INT DEFAULT 0,
    total_earnings DECIMAL(10, 2) DEFAULT 0.00,
    documents_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_license (license_number),
    INDEX idx_online (is_online)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. VEHICLES TABLE (Driver's vehicles)
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    driver_id INT NOT NULL,
    vehicle_type ENUM('economy', 'premium', 'xl') DEFAULT 'economy',
    license_plate VARCHAR(20) UNIQUE NOT NULL,
    color VARCHAR(50),
    capacity INT DEFAULT 4,
    status ENUM('active', 'inactive', 'maintenance') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
    INDEX idx_driver_id (driver_id),
    INDEX idx_license_plate (license_plate),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. RIDES TABLE (Core ride data)
-- ============================================
CREATE TABLE IF NOT EXISTS rides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    passenger_id INT NOT NULL,
    driver_id INT,
    vehicle_id INT,
    pickup_location VARCHAR(255) NOT NULL,
    dropoff_location VARCHAR(255) NOT NULL,
    distance_km DECIMAL(10, 2),
    pickup_time DATETIME,
    dropoff_time DATETIME,
    status ENUM('requested', 'accepted', 'started', 'completed', 'cancelled') DEFAULT 'requested',
    base_fare DECIMAL(10, 2) DEFAULT 100.00,
    surge_multiplier DECIMAL(3, 2) DEFAULT 1.00,
    final_fare DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (passenger_id) REFERENCES passengers(id) ON DELETE CASCADE,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    INDEX idx_passenger_id (passenger_id),
    INDEX idx_driver_id (driver_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. PAYMENTS TABLE (Ride payments)
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ride_id INT NOT NULL,
    passenger_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('card', 'wallet', 'upi', 'cash') DEFAULT 'card',
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
    FOREIGN KEY (passenger_id) REFERENCES passengers(id) ON DELETE CASCADE,
    INDEX idx_ride_id (ride_id),
    INDEX idx_passenger_id (passenger_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 7. RATINGS TABLE (Ride ratings)
-- ============================================
CREATE TABLE IF NOT EXISTS ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ride_id INT NOT NULL,
    rater_id INT NOT NULL,
    ratee_id INT NOT NULL,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
    FOREIGN KEY (rater_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (ratee_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_ride_id (ride_id),
    INDEX idx_ratee_id (ratee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8. SUPPORT TICKETS TABLE (Customer support)
-- ============================================
CREATE TABLE IF NOT EXISTS support_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    ride_id INT,
    complaint_text TEXT NOT NULL,
    ai_category VARCHAR(50),
    ai_priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    status ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
    resolution_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_priority (ai_priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DATABASE TRIGGERS
-- ============================================

-- Trigger 1: Auto-calculate fare when ride completes
DELIMITER //
CREATE TRIGGER IF NOT EXISTS calculate_fare_on_complete
BEFORE UPDATE ON rides
FOR EACH ROW
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        SET NEW.final_fare = NEW.base_fare * NEW.surge_multiplier;
    END IF;
END//
DELIMITER ;

-- Trigger 2: Update driver rating average
DELIMITER //
CREATE TRIGGER IF NOT EXISTS update_driver_rating
AFTER INSERT ON ratings
FOR EACH ROW
BEGIN
    UPDATE drivers 
    SET rating_average = (
        SELECT AVG(rating) FROM ratings 
        WHERE ratee_id = NEW.ratee_id
    )
    WHERE user_id = NEW.ratee_id AND NEW.ratee_id IN (
        SELECT user_id FROM drivers
    );
END//
DELIMITER ;

-- Trigger 3: Update passenger rating average
DELIMITER //
CREATE TRIGGER IF NOT EXISTS update_passenger_rating
AFTER INSERT ON ratings
FOR EACH ROW
BEGIN
    UPDATE passengers 
    SET rating_average = (
        SELECT AVG(rating) FROM ratings 
        WHERE ratee_id = NEW.ratee_id
    )
    WHERE user_id = NEW.ratee_id AND NEW.ratee_id IN (
        SELECT user_id FROM passengers
    );
END//
DELIMITER ;

-- ============================================
-- DATABASE VIEWS
-- ============================================

-- View 1: Active rides with all details
CREATE OR REPLACE VIEW active_rides AS
SELECT 
    r.id,
    r.pickup_location,
    r.dropoff_location,
    r.status,
    u_passenger.name as passenger_name,
    u_driver.name as driver_name,
    v.license_plate,
    r.created_at
FROM rides r
JOIN passengers p ON r.passenger_id = p.id
JOIN users u_passenger ON p.user_id = u_passenger.id
LEFT JOIN drivers d ON r.driver_id = d.id
LEFT JOIN users u_driver ON d.user_id = u_driver.id
LEFT JOIN vehicles v ON r.vehicle_id = v.id
WHERE r.status IN ('requested', 'accepted', 'started');

-- View 2: Driver performance (monthly)
CREATE OR REPLACE VIEW driver_performance AS
SELECT 
    d.id,
    u.name,
    COUNT(r.id) as rides_completed,
    AVG(d.rating_average) as avg_rating,
    SUM(CASE WHEN r.status = 'completed' THEN r.final_fare ELSE 0 END) as monthly_earnings,
    MONTH(r.completed_at) as month
FROM drivers d
JOIN users u ON d.user_id = u.id
LEFT JOIN rides r ON d.id = r.driver_id AND r.status = 'completed'
GROUP BY d.id, u.name
ORDER BY monthly_earnings DESC;

-- View 3: Revenue by route
CREATE OR REPLACE VIEW revenue_by_route AS
SELECT 
    r.pickup_location,
    r.dropoff_location,
    COUNT(r.id) as ride_count,
    AVG(r.final_fare) as avg_fare,
    SUM(r.final_fare) as total_revenue
FROM rides r
WHERE r.status = 'completed'
GROUP BY r.pickup_location, r.dropoff_location
ORDER BY total_revenue DESC;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Optimize common queries
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_email_password (email, password_hash);
ALTER TABLE rides ADD INDEX IF NOT EXISTS idx_passenger_status (passenger_id, status);
ALTER TABLE rides ADD INDEX IF NOT EXISTS idx_driver_status (driver_id, status);
ALTER TABLE payments ADD INDEX IF NOT EXISTS idx_ride_status (ride_id, status);

-- ============================================
-- SAMPLE DATA (FOR TESTING)
-- ============================================

-- Insert sample user
INSERT INTO users (name, email, password_hash, phone, role) 
VALUES ('Test User', 'test@example.com', '$2b$10$test', '9876543210', 'passenger')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ============================================
-- END OF SCHEMA
-- ============================================