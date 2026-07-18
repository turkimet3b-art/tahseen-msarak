const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('trainee'));

router.get('/my-courses', (req, res) => {
  const rows = db.prepare(
    `SELECT enrollments.id AS enrollment_id, enrollments.progress, enrollments.status, courses.*
     FROM enrollments JOIN courses ON courses.id = enrollments.course_id
     WHERE enrollments.trainee_id = ? ORDER BY enrollments.id DESC`
  ).all(req.user.id);
  res.json({
    courses: rows.map(r => ({
      enrollmentId: r.enrollment_id,
      id: r.id,
      title: r.title,
      cat: r.category,
      progress: r.progress,
      status: r.status,
      icon: r.icon
    }))
  });
});

router.put('/my-courses/:enrollmentId/progress', (req, res) => {
  const { progress } = req.body || {};
  const enrollment = db.prepare('SELECT * FROM enrollments WHERE id = ? AND trainee_id = ?').get(req.params.enrollmentId, req.user.id);
  if (!enrollment) return res.status(404).json({ error: 'التسجيل غير موجود' });
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const status = pct >= 100 ? 'completed' : 'active';
  db.prepare('UPDATE enrollments SET progress = ?, status = ? WHERE id = ?').run(pct, status, req.params.enrollmentId);
  if (status === 'completed') {
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(enrollment.course_id);
    const already = db.prepare('SELECT id FROM certificates WHERE trainee_id = ? AND course_id = ?').get(req.user.id, enrollment.course_id);
    if (!already) {
      db.prepare('INSERT INTO certificates (trainee_id,course_id,title) VALUES (?,?,?)').run(
        req.user.id, enrollment.course_id, `شهادة إتمام دورة ${course.title}`
      );
      db.prepare('INSERT INTO notifications (user_id,icon,text) VALUES (?,?,?)').run(
        req.user.id, 'workspace_premium', `تهانينا! حصلت على شهادة إتمام دورة "${course.title}"`
      );
    }
  }
  res.json({ ok: true, progress: pct, status });
});

router.get('/certificates', (req, res) => {
  const rows = db.prepare(
    `SELECT certificates.*, courses.title AS course_title FROM certificates
     JOIN courses ON courses.id = certificates.course_id
     WHERE trainee_id = ? ORDER BY certificates.id DESC`
  ).all(req.user.id);
  res.json({ certificates: rows });
});

router.get('/notifications', (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(req.user.id);
  res.json({ notifications: rows });
});

router.get('/next-session', (req, res) => {
  const row = db.prepare(
    `SELECT sessions_live.*, courses.title AS course_title FROM sessions_live
     JOIN courses ON courses.id = sessions_live.course_id
     JOIN enrollments ON enrollments.course_id = courses.id
     WHERE enrollments.trainee_id = ? AND sessions_live.session_date >= date('now')
     ORDER BY sessions_live.session_date ASC LIMIT 1`
  ).get(req.user.id);
  res.json({ session: row || null });
});

module.exports = router;
