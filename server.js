require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const bcrypt = require('bcryptjs');

const authRoutes = require('./routes/auth');
const courseRoutes = require('./routes/courses');
const traineeRoutes = require('./routes/trainee');
const instructorRoutes = require('./routes/instructor');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Setup endpoint
app.post('/api/setup/init-demo', (req, res) => {
  const key = req.headers['x-setup-key'];

  if (key !== process.env.DEMO_INIT_KEY) {
    return res.status(403).json({ error: 'Invalid key' });
  }

  const demoUsers = [
    {
      name: 'Admin User',
      email: process.env.ADMIN_EMAIL || 'admin@tahseen.com',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      role: 'admin',
      title: 'Admin'
    },
    {
      name: 'Instructor User',
      email: process.env.INSTRUCTOR_EMAIL || 'instructor@tahseen.com',
      password: process.env.INSTRUCTOR_PASSWORD || 'instructor123',
      role: 'instructor',
      title: 'Instructor'
    },
    {
      name: 'Trainee User',
      email: process.env.TRAINEE_EMAIL || 'trainee@tahseen.com',
      password: process.env.TRAINEE_PASSWORD || 'trainee123',
      role: 'trainee',
      title: null
    }
  ];

  let created = 0;
  let skipped = 0;

  try {
    demoUsers.forEach(user => {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(user.email);

      if (existing) {
        skipped++;
        return;
      }

      const hash = bcrypt.hashSync(user.password, 10);
      db.prepare(
        'INSERT INTO users (name, email, password_hash, role, title, phone) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(user.name, user.email, hash, user.role, user.title, '966501234567');

      created++;
    });

    res.json({
      success: true,
      message: `Created ${created} users, skipped ${skipped}`
    });

  } catch(error) {
    console.error('Setup error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/trainee', traineeRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/admin', adminRoutes);

// Settings endpoint
app.get('/api/settings', (req, res) => {
    try {
      const row = db.prepare('SELECT data FROM settings WHERE id = 1').get();
      res.json({ settings: row ? JSON.parse(row.data) : {} });
    } catch(e) {
      res.json({ settings: {} });
    }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
