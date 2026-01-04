-- Base de données Superhôte Pro
-- MySQL/MariaDB

CREATE DATABASE IF NOT EXISTS superhote_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE superhote_db;

-- Table des utilisateurs
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'employee') NOT NULL DEFAULT 'employee',
    phone VARCHAR(20),
    avatar VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
) ENGINE=InnoDB;

-- Table des chambres
CREATE TABLE rooms (
    id INT PRIMARY KEY AUTO_INCREMENT,
    room_number VARCHAR(10) UNIQUE NOT NULL,
    room_type ENUM('single', 'double', 'suite', 'apartment') NOT NULL,
    floor INT,
    capacity INT NOT NULL,
    status ENUM('available', 'occupied', 'cleaning', 'maintenance') DEFAULT 'available',
    amenities JSON,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_room_number (room_number),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Table des tâches
CREATE TABLE tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    room_id INT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    task_type ENUM('cleaning', 'maintenance', 'inspection', 'other') NOT NULL DEFAULT 'cleaning',
    priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
    status ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    assigned_to INT,
    created_by INT NOT NULL,
    deadline DATE,
    estimated_duration INT, -- en minutes
    notes TEXT,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_assigned (assigned_to),
    INDEX idx_deadline (deadline),
    INDEX idx_room (room_id)
) ENGINE=InnoDB;

-- Table des sous-tâches
CREATE TABLE subtasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT NOT NULL,
    description VARCHAR(255) NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    position INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    INDEX idx_task (task_id)
) ENGINE=InnoDB;

-- Table des médias (photos/vidéos)
CREATE TABLE task_media (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT NOT NULL,
    subtask_id INT,
    media_type ENUM('photo', 'video') NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_size INT, -- en bytes
    thumbnail_path VARCHAR(255),
    uploaded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (subtask_id) REFERENCES subtasks(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_task (task_id),
    INDEX idx_subtask (subtask_id)
) ENGINE=InnoDB;

-- Table des réservations
CREATE TABLE reservations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    external_id VARCHAR(100), -- ID Airbnb/Booking
    source ENUM('airbnb', 'booking', 'direct', 'other') NOT NULL,
    room_id INT,
    guest_name VARCHAR(100) NOT NULL,
    guest_email VARCHAR(100),
    guest_phone VARCHAR(20),
    guest_count INT NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    status ENUM('confirmed', 'checked_in', 'checked_out', 'cancelled') DEFAULT 'confirmed',
    price DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'EUR',
    special_requests TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    UNIQUE KEY unique_external (external_id, source),
    INDEX idx_check_in (check_in),
    INDEX idx_check_out (check_out),
    INDEX idx_room (room_id),
    INDEX idx_status (status)
) ENGINE=InnoDB;

-- Table des notifications
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('task', 'reservation', 'system', 'alert') NOT NULL,
    related_id INT, -- ID de la tâche/réservation liée
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_read (is_read)
) ENGINE=InnoDB;

-- Table d'audit/logs
CREATE TABLE activity_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT,
    details JSON,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- Table des paramètres
CREATE TABLE settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Insertion des données initiales

-- Utilisateurs par défaut
INSERT INTO users (name, email, password_hash, role, phone) VALUES
('Administrateur', 'admin@superhote.com', '$2a$10$XQh.N5YEO0L9Z7P9f6K8PeZFq8uQf3x.FJWkVsN3KiPWdH5KqEQhO', 'admin', '+33612345678'), -- password: admin123
('Marie Dubois', 'marie@superhote.com', '$2a$10$XQh.N5YEO0L9Z7P9f6K8PeZFq8uQf3x.FJWkVsN3KiPWdH5KqEQhO', 'employee', '+33612345679'), -- password: marie123
('Jean Martin', 'jean@superhote.com', '$2a$10$XQh.N5YEO0L9Z7P9f6K8PeZFq8uQf3x.FJWkVsN3KiPWdH5KqEQhO', 'employee', '+33612345680'); -- password: jean123

-- Chambres
INSERT INTO rooms (room_number, room_type, floor, capacity, status, amenities) VALUES
('101', 'double', 1, 2, 'available', '["WiFi", "TV", "Climatisation", "Mini-bar"]'),
('102', 'double', 1, 2, 'available', '["WiFi", "TV", "Climatisation", "Balcon"]'),
('201', 'suite', 2, 4, 'available', '["WiFi", "TV", "Climatisation", "Jacuzzi", "Vue mer"]'),
('202', 'suite', 2, 4, 'available', '["WiFi", "TV", "Climatisation", "Cuisine", "Terrasse"]'),
('301', 'apartment', 3, 6, 'available', '["WiFi", "TV", "Climatisation", "Cuisine complète", "Lave-linge", "2 chambres"]');

-- Paramètres
INSERT INTO settings (setting_key, setting_value, description) VALUES
('airbnb_api_key', '', 'Clé API Airbnb'),
('airbnb_listing_ids', '[]', 'IDs des annonces Airbnb (JSON array)'),
('booking_api_key', '', 'Clé API Booking.com'),
('auto_sync_enabled', 'true', 'Synchronisation automatique activée'),
('sync_interval_minutes', '30', 'Intervalle de synchronisation en minutes'),
('notification_enabled', 'true', 'Notifications push activées'),
('default_cleaning_duration', '60', 'Durée standard de nettoyage (minutes)');

-- Index supplémentaires pour performance
CREATE INDEX idx_tasks_assigned_status ON tasks(assigned_to, status);
CREATE INDEX idx_reservations_dates ON reservations(check_in, check_out);
CREATE FULLTEXT INDEX idx_tasks_search ON tasks(title, description);

-- Vues utiles

-- Vue des tâches avec détails complets
CREATE VIEW v_tasks_full AS
SELECT 
    t.*,
    r.room_number,
    r.room_type,
    u_assigned.name as assigned_name,
    u_assigned.email as assigned_email,
    u_created.name as created_by_name,
    (SELECT COUNT(*) FROM subtasks st WHERE st.task_id = t.id) as total_subtasks,
    (SELECT COUNT(*) FROM subtasks st WHERE st.task_id = t.id AND st.completed = TRUE) as completed_subtasks,
    (SELECT COUNT(*) FROM task_media tm WHERE tm.task_id = t.id) as media_count
FROM tasks t
LEFT JOIN rooms r ON t.room_id = r.id
LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.id
LEFT JOIN users u_created ON t.created_by = u_created.id;

-- Vue du planning du jour
CREATE VIEW v_daily_planning AS
SELECT 
    r.*,
    rm.room_number,
    rm.room_type,
    CASE 
        WHEN r.check_in = CURDATE() THEN 'check_in'
        WHEN r.check_out = CURDATE() THEN 'check_out'
        ELSE 'occupied'
    END as day_status
FROM reservations r
LEFT JOIN rooms rm ON r.room_id = rm.id
WHERE r.status = 'confirmed'
  AND CURDATE() BETWEEN r.check_in AND r.check_out
ORDER BY rm.room_number;

-- Triggers pour maintenir l'intégrité

-- Créer automatiquement une tâche de nettoyage au check-out
DELIMITER //
CREATE TRIGGER create_cleaning_task_on_checkout
AFTER UPDATE ON reservations
FOR EACH ROW
BEGIN
    IF NEW.status = 'checked_out' AND OLD.status != 'checked_out' THEN
        INSERT INTO tasks (room_id, title, task_type, priority, deadline, created_by, description)
        VALUES (
            NEW.room_id,
            CONCAT('Nettoyage chambre ', (SELECT room_number FROM rooms WHERE id = NEW.room_id)),
            'cleaning',
            'high',
            NEW.check_out,
            1, -- Admin
            CONCAT('Nettoyage après départ de ', NEW.guest_name)
        );
    END IF;
END//
DELIMITER ;

-- Logger les changements importants
DELIMITER //
CREATE TRIGGER log_task_completion
AFTER UPDATE ON tasks
FOR EACH ROW
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
        VALUES (
            NEW.assigned_to,
            'task_completed',
            'task',
            NEW.id,
            JSON_OBJECT('title', NEW.title, 'room_id', NEW.room_id)
        );
    END IF;
END//
DELIMITER ;

-- Permissions et sécurité
-- Créer un utilisateur pour l'application
CREATE USER IF NOT EXISTS 'superhote_app'@'localhost' IDENTIFIED BY 'votre_mot_de_passe_securise';
GRANT SELECT, INSERT, UPDATE, DELETE ON superhote_db.* TO 'superhote_app'@'localhost';
FLUSH PRIVILEGES;
