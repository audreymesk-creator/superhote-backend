const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const mysql = require('mysql2/promise');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware de sécurité
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limite par IP
});
app.use('/api/', limiter);

// Configuration de la base de données
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'superhote_user',
  password: process.env.DB_PASSWORD || 'your_password',
  database: process.env.DB_NAME || 'superhote_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Configuration Multer pour upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4', 'video/quicktime'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'));
    }
  }
});

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requis' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// =============== ROUTES AUTHENTIFICATION ===============

// Connexion
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Inscription (admin seulement)
app.post('/api/auth/register', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { name, email, password, role, phone } = req.body;
    
    // Vérifier si l'email existe déjà
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role, phone]
    );

    res.status(201).json({
      message: 'Utilisateur créé',
      userId: result.insertId
    });
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============== ROUTES TÂCHES ===============

// Récupérer toutes les tâches
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { status, assigned_to, room_id } = req.query;
    
    let query = `
      SELECT t.*, r.room_number, r.room_type, u.name as assigned_name
      FROM tasks t
      LEFT JOIN rooms r ON t.room_id = r.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }

    if (assigned_to) {
      query += ' AND t.assigned_to = ?';
      params.push(assigned_to);
    }

    if (room_id) {
      query += ' AND t.room_id = ?';
      params.push(room_id);
    }

    // Si employé, voir seulement ses tâches
    if (req.user.role === 'employee') {
      query += ' AND (t.assigned_to = ? OR t.assigned_to IS NULL)';
      params.push(req.user.id);
    }

    query += ' ORDER BY t.priority DESC, t.deadline ASC';

    const [tasks] = await pool.execute(query, params);

    // Récupérer les sous-tâches et médias pour chaque tâche
    for (let task of tasks) {
      const [subtasks] = await pool.execute(
        'SELECT * FROM subtasks WHERE task_id = ? ORDER BY position',
        [task.id]
      );
      
      const [media] = await pool.execute(
        'SELECT * FROM task_media WHERE task_id = ? ORDER BY created_at',
        [task.id]
      );

      task.subtasks = subtasks;
      task.media = media;
    }

    res.json(tasks);
  } catch (error) {
    console.error('Erreur récupération tâches:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer une tâche
app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { room_id, title, description, priority, deadline, subtasks } = req.body;

    const [result] = await pool.execute(
      'INSERT INTO tasks (room_id, title, description, priority, deadline, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [room_id, title, description, priority, deadline, 'pending', req.user.id]
    );

    const taskId = result.insertId;

    // Ajouter les sous-tâches
    if (subtasks && subtasks.length > 0) {
      for (let i = 0; i < subtasks.length; i++) {
        await pool.execute(
          'INSERT INTO subtasks (task_id, description, position) VALUES (?, ?, ?)',
          [taskId, subtasks[i], i]
        );
      }
    }

    res.status(201).json({ message: 'Tâche créée', taskId });
  } catch (error) {
    console.error('Erreur création tâche:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Assigner une tâche
app.patch('/api/tasks/:id/assign', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute(
      'UPDATE tasks SET assigned_to = ?, status = ?, updated_at = NOW() WHERE id = ?',
      [req.user.id, 'in_progress', id]
    );

    res.json({ message: 'Tâche assignée' });
  } catch (error) {
    console.error('Erreur assignation tâche:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour le statut d'une sous-tâche
app.patch('/api/subtasks/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Récupérer l'état actuel
    const [subtasks] = await pool.execute(
      'SELECT completed FROM subtasks WHERE id = ?',
      [id]
    );

    if (subtasks.length === 0) {
      return res.status(404).json({ error: 'Sous-tâche non trouvée' });
    }

    const newStatus = !subtasks[0].completed;

    await pool.execute(
      'UPDATE subtasks SET completed = ? WHERE id = ?',
      [newStatus, id]
    );

    // Vérifier si toutes les sous-tâches sont complétées
    const [task] = await pool.execute(
      'SELECT task_id FROM subtasks WHERE id = ?',
      [id]
    );

    const [allSubtasks] = await pool.execute(
      'SELECT COUNT(*) as total, SUM(completed) as completed FROM subtasks WHERE task_id = ?',
      [task[0].task_id]
    );

    if (allSubtasks[0].total === allSubtasks[0].completed) {
      await pool.execute(
        'UPDATE tasks SET status = ?, completed_at = NOW() WHERE id = ?',
        ['completed', task[0].task_id]
      );
    } else {
      await pool.execute(
        'UPDATE tasks SET status = ? WHERE id = ? AND status = ?',
        ['in_progress', task[0].task_id, 'completed']
      );
    }

    res.json({ message: 'Sous-tâche mise à jour', completed: newStatus });
  } catch (error) {
    console.error('Erreur mise à jour sous-tâche:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter des notes à une tâche
app.patch('/api/tasks/:id/notes', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    await pool.execute(
      'UPDATE tasks SET notes = ?, updated_at = NOW() WHERE id = ?',
      [notes, id]
    );

    res.json({ message: 'Notes mises à jour' });
  } catch (error) {
    console.error('Erreur mise à jour notes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Upload média (photo/vidéo)
app.post('/api/tasks/:id/media', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { subtask_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Fichier requis' });
    }

    const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'photo';
    const filePath = `/uploads/${req.file.filename}`;

    await pool.execute(
      'INSERT INTO task_media (task_id, subtask_id, media_type, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?)',
      [id, subtask_id || null, mediaType, filePath, req.user.id]
    );

    res.json({
      message: 'Média uploadé',
      file: {
        type: mediaType,
        path: filePath
      }
    });
  } catch (error) {
    console.error('Erreur upload média:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============== ROUTES PLANNING / AIRBNB ===============

// Synchroniser avec Airbnb
app.post('/api/airbnb/sync', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const airbnbApiKey = process.env.AIRBNB_API_KEY;
    const airbnbListingId = process.env.AIRBNB_LISTING_ID;

    if (!airbnbApiKey || !airbnbListingId) {
      return res.status(400).json({ error: 'Configuration Airbnb manquante' });
    }

    // Appel à l'API Airbnb
    const response = await axios.get(
      `https://api.airbnb.com/v2/calendar_days`,
      {
        headers: {
          'X-Airbnb-API-Key': airbnbApiKey
        },
        params: {
          listing_id: airbnbListingId,
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      }
    );

    const reservations = response.data.calendar_days
      .filter(day => day.reservation)
      .map(day => day.reservation);

    // Synchroniser avec la base de données
    for (const reservation of reservations) {
      // Vérifier si la réservation existe déjà
      const [existing] = await pool.execute(
        'SELECT id FROM reservations WHERE external_id = ? AND source = ?',
        [reservation.id, 'airbnb']
      );

      if (existing.length === 0) {
        // Créer la réservation
        await pool.execute(
          `INSERT INTO reservations 
          (external_id, source, room_id, guest_name, guest_count, check_in, check_out, status, price, currency)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reservation.id,
            'airbnb',
            null, // À mapper manuellement
            reservation.guest_details.name,
            reservation.guest_details.number_of_guests,
            reservation.check_in,
            reservation.check_out,
            reservation.status,
            reservation.total_price,
            reservation.currency
          ]
        );
      } else {
        // Mettre à jour
        await pool.execute(
          `UPDATE reservations 
          SET status = ?, price = ?, updated_at = NOW()
          WHERE external_id = ? AND source = ?`,
          [reservation.status, reservation.total_price, reservation.id, 'airbnb']
        );
      }
    }

    res.json({ message: 'Synchronisation réussie', count: reservations.length });
  } catch (error) {
    console.error('Erreur sync Airbnb:', error);
    res.status(500).json({ error: 'Erreur synchronisation Airbnb' });
  }
});

// Récupérer le planning
app.get('/api/planning', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const [reservations] = await pool.execute(
      `SELECT r.*, rm.room_number, rm.room_type
       FROM reservations r
       LEFT JOIN rooms rm ON r.room_id = rm.id
       WHERE r.check_in >= ? AND r.check_out <= ?
       ORDER BY r.check_in ASC`,
      [start_date || new Date().toISOString().split('T')[0], 
       end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]]
    );

    res.json(reservations);
  } catch (error) {
    console.error('Erreur récupération planning:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Check-outs du jour (pour nettoyage)
app.get('/api/planning/checkouts-today', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [checkouts] = await pool.execute(
      `SELECT r.*, rm.room_number, rm.room_type, t.id as cleaning_task_id, u.name as assigned_name
       FROM reservations r
       LEFT JOIN rooms rm ON r.room_id = rm.id
       LEFT JOIN tasks t ON t.room_id = rm.id AND t.task_type = 'cleaning' AND DATE(t.deadline) = ?
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE r.check_out = ?`,
      [today, today]
    );

    res.json(checkouts);
  } catch (error) {
    console.error('Erreur récupération check-outs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============== ROUTES CHAMBRES ===============

// Récupérer toutes les chambres
app.get('/api/rooms', authenticateToken, async (req, res) => {
  try {
    const [rooms] = await pool.execute(
      'SELECT * FROM rooms ORDER BY room_number'
    );

    res.json(rooms);
  } catch (error) {
    console.error('Erreur récupération chambres:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============== ROUTES STATISTIQUES ===============

app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Tâches de l'utilisateur
    const [myTasks] = await pool.execute(
      'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND status != ?',
      [req.user.id, 'completed']
    );

    // Tâches complétées aujourd'hui
    const [completedToday] = await pool.execute(
      'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND status = ? AND DATE(completed_at) = ?',
      [req.user.id, 'completed', today]
    );

    // Check-outs aujourd'hui
    const [checkoutsToday] = await pool.execute(
      'SELECT COUNT(*) as count FROM reservations WHERE check_out = ?',
      [today]
    );

    // Check-ins aujourd'hui
    const [checkinsToday] = await pool.execute(
      'SELECT COUNT(*) as count FROM reservations WHERE check_in = ?',
      [today]
    );

    res.json({
      my_tasks: myTasks[0].count,
      completed_today: completedToday[0].count,
      checkouts_today: checkoutsToday[0].count,
      checkins_today: checkinsToday[0].count
    });
  } catch (error) {
    console.error('Erreur récupération stats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============== ROUTE DE SANTÉ ===============

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Servir les fichiers statiques
app.use('/uploads', express.static('uploads'));

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erreur serveur' });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur Superhôte Pro démarré sur le port ${PORT}`);
});

module.exports = app;
