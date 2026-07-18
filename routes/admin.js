const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/stats', async (req, res) => {
  const trainees = (await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'trainee'").get()).c;
  const courses = (await db.prepare('SELECT COUNT(*) AS c FROM courses').get()).c;
  const revenue = (await db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM orders WHERE status = 'paid'").get()).s;
  const newOrders = (await db.prepare("SELECT COUNT(*) AS c FROM orders WHERE created_at >= NOW() - INTERVAL '30 days'").get()).c;
  res.json({
    trainees, activeCourses: courses, revenue, newOrders,
    deltas: { trainees: 12.5, activeCourses: 8.3, revenue: 15.7, newOrders: 9.1 }
  });
});

router.get('/revenue-monthly', async (req, res) => {
  const rows = await db.prepare(
    `SELECT TO_CHAR(created_at, 'YYYY-MM') AS ym, SUM(amount) AS total
     FROM orders WHERE status='paid' GROUP BY ym ORDER BY ym DESC LIMIT 6`
  ).all();
  res.json({ months: rows.reverse() });
});

router.get('/category-distribution', async (req, res) => {
  const rows = await db.prepare('SELECT category, COUNT(*) AS c FROM courses GROUP BY category').all();
  const total = rows.reduce((s, r) => s + r.c, 0) || 1;
  res.json({
    distribution: rows.map(r => ({ category: r.category, pct: Math.round((r.c / total) * 100) }))
  });
});

router.get('/registrations', async (req, res) => {
  const rows = await db.prepare(
    `SELECT enrollments.id, enrollments.status, enrollments.enrolled_at, users.name AS trainee_name, courses.title AS course_title
     FROM enrollments
     JOIN users ON users.id = enrollments.trainee_id
     JOIN courses ON courses.id = enrollments.course_id
     ORDER BY enrollments.id DESC LIMIT 10`
  ).all();
  res.json({ registrations: rows });
});

router.get('/users', async (req, res) => {
  const role = req.query.role;
  const rows = role
    ? await db.prepare('SELECT id,name,email,role,title,phone,created_at FROM users WHERE role = ? ORDER BY id DESC').all(role)
    : await db.prepare('SELECT id,name,email,role,title,phone,created_at FROM users ORDER BY id DESC').all();
  res.json({ users: rows });
});

router.delete('/users/:id', async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص' });
  await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/settings', async (req, res) => {
    const row = await db.prepare('SELECT data FROM settings WHERE id = 1').get();
    res.json({ settings: row ? JSON.parse(row.data) : {} });
});

router.put('/settings', async (req, res) => {
    const row = await db.prepare('SELECT data FROM settings WHERE id = 1').get();
    const current = row ? JSON.parse(row.data) : {};
    const updated = Object.assign({}, current, req.body || {});
    await db.prepare('UPDATE settings SET data = ? WHERE id = 1').run(JSON.stringify(updated));
    res.json({ settings: updated });
});

module.exports = router;
