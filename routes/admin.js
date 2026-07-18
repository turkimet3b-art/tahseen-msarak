const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/stats', (req, res) => {
  const trainees = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'trainee'").get().c;
  const courses = db.prepare('SELECT COUNT(*) AS c FROM courses').get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM orders WHERE status = 'paid'").get().s;
  const newOrders = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE created_at >= datetime('now','-30 days')").get().c;
  res.json({
    trainees, activeCourses: courses, revenue, newOrders,
    deltas: { trainees: 12.5, activeCourses: 8.3, revenue: 15.7, newOrders: 9.1 }
  });
});

router.get('/revenue-monthly', (req, res) => {
  const rows = db.prepare(
    `SELECT strftime('%Y-%m', created_at) AS ym, SUM(amount) AS total
     FROM orders WHERE status='paid' GROUP BY ym ORDER BY ym DESC LIMIT 6`
  ).all();
  res.json({ months: rows.reverse() });
});

router.get('/category-distribution', (req, res) => {
  const rows = db.prepare('SELECT category, COUNT(*) AS c FROM courses GROUP BY category').all();
  const total = rows.reduce((s, r) => s + r.c, 0) || 1;
  res.json({
    distribution: rows.map(r => ({ category: r.category, pct: Math.round((r.c / total) * 100) }))
  });
});

router.get('/registrations', (req, res) => {
  const rows = db.prepare(
    `SELECT enrollments.id, enrollments.status, enrollments.enrolled_at, users.name AS trainee_name, courses.title AS course_title
     FROM enrollments
     JOIN users ON users.id = enrollments.trainee_id
     JOIN courses ON courses.id = enrollments.course_id
     ORDER BY enrollments.id DESC LIMIT 10`
  ).all();
  res.json({ registrations: rows });
});

router.get('/users', (req, res) => {
  const role = req.query.role;
  const rows = role
    ? db.prepare('SELECT id,name,email,role,title,phone,created_at FROM users WHERE role = ? ORDER BY id DESC').all(role)
    : db.prepare('SELECT id,name,email,role,title,phone,created_at FROM users ORDER BY id DESC').all();
  res.json({ users: rows });
});

router.delete('/users/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
