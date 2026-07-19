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

// ✅ SETUP ENDPOINT - إنشاء مستخدمي الديمو
app.post('/api/setup/init-demo-users', (req, res) => {
  console.log('🌱 جاري إنشاء مستخدمي الديمو...');

  const demoUsers = [
    { name: 'مدير النظام', email: 'admin@tahseen.com', password: 'admin123', role: 'admin', title: 'مدير' },
    { name: 'محمد العتيبي', email: 'instructor@tahseen.com', password: 'instructor123', role: 'instructor', title: 'مدرب' },
    { name: 'عبدالله الفهمي', email: 'trainee@tahseen.com', password: 'trainee123', role: 'trainee', title: null }
  ];

  let created = 0;
  let skipped = 0;

  try {
    demoUsers.forEach(user => {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(user.email);

      if (existing) {
        console.log(`⏭️  تخطي: ${user.email}`);
        skipped++;
        return;
      }

      const hash = bcrypt.hashSync(user.password, 10);
      db.prepare(
        'INSERT INTO users (name, email, password_hash, role, title, phone) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(user.name, user.email, hash, user.role, user.title, '966501234567');

      console.log(`✅ تم إنشاء: ${user.email}`);
      created++;
    });

    res.json({
      success: true,
      message: `✅ تم إنشاء ${created} مستخدم، تخطي ${skipped}`,
      credentials: {
        admin: { email: 'admin@tahseen.com', password: 'admin123' },
        instructor: { email: 'instructor@tahseen.com', password: 'instructor123' },
        trainee: { email: 'trainee@tahseen.com', password: 'trainee123' }
      }
    });

  } catch(error) {
    console.error('❌ خطأ:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ✅ API Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/trainee', traineeRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/admin', adminRoutes);

// ✅ Settings
app.get('/api/settings', (req, res) => {
    const row = db.prepare('SELECT data FROM settings WHERE id = 1').get();
    res.json({ settings: row ? JSON.parse(row.data) : {} });
});

// ✅ Health Check
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ✅ Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 URL: ${process.env.FRONTEND_URL || 'http://localhost:' + PORT}`);
});
