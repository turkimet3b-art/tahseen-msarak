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

// ✅ SAFE SETUP - بدون expose البيانات
app.post('/api/setup/init-demo', (req, res) => {
  const key = req.headers['x-setup-key'];
  
  // تحقق من المفتاح
  if (key !== process.env.DEMO_INIT_KEY) {
    return res.status(403).json({ error: 'مفتاح غير صالح' });
  }

  console.log('🌱 إنشاء مستخدمي الديمو...');

  const demoUsers = [
    { 
      name: 'مدير النظام', 
      email: process.env.ADMIN_EMAIL, 
      password: process.env.ADMIN_PASSWORD, 
      role: 'admin', 
      title: 'مدير' 
    },
    { 
      name: 'محمد العتيبي', 
      email: process.env.INSTRUCTOR_EMAIL, 
      password: process.env.INSTRUCTOR_PASSWORD, 
      role: 'instructor', 
      title: 'مدرب' 
    },
    { 
      name: 'عبدالله الفهمي', 
      email: process.env.TRAINEE_EMAIL, 
      password: process.env.TRAINEE_PASSWORD, 
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
        console.log(`⏭️  موجود: ${user.email}`);
        skipped++;
        return;
      }

      const hash = bcrypt.hashSync(user.password, 10);
      db.prepare(
        'INSERT INTO users (name, email, password_hash, role, title, phone) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(user.name, user.email, hash, user.role, user.title, '966501234567');

      console.log(`✅ تم: ${user.email}`);
      created++;
    });

    // ⚠️ لا نرجع البيانات الحساسة!
    res.json({
      success: true,
      message: `✅ تم إنشاء ${created} مستخدم (تخطي ${skipped})`,
      hint: 'استخدم بيانات الدخول من متغيرات البيئة'
    });

  } catch(error) {
    console.error('❌ خطأ:', error.message);
    res.status(500).json({ error: 'خطأ في الإنشاء' });
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
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ✅ Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
});
