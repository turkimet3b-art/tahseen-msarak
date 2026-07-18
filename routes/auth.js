const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, phone: u.phone };
}

function signToken(u) {
  return jwt.sign({ id: u.id, role: u.role, name: u.name }, JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', (req, res) => {
  const { name, email, password, role, phone } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبة' });
  }
  const allowedRole = ['trainee', 'instructor'].includes(role) ? role : 'trainee';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' });

  const hash = bcrypt.hashSync(password, 10);
  const title = allowedRole === 'instructor' ? 'مدرب' : null;
  const info = db.prepare(
    'INSERT INTO users (name,email,password_hash,role,title,phone) VALUES (?,?,?,?,?,?)'
  ).run(name, email, hash, allowedRole, title, phone || null);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
  }
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ user: publicUser(user) });
});

module.exports = router;
