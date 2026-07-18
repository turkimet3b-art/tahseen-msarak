const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('instructor'));

router.get('/my-courses', (req, res) => {
  const rows = db.prepare('SELECT * FROM courses WHERE instructor_id = ? ORDER BY id DESC').all(req.user.id);
  const withCounts = rows.map(c => {
    const studentsRow = db.prepare('SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ?').get(c.id);
    return { id: c.id, title: c.title, students: studentsRow.c, icon: c.icon, cat: c.category };
  });
  res.json({ courses: withCounts });
});

router.get('/schedule', (req, res) => {
  const rows = db.prepare(
    `SELECT sessions_live.*, courses.title AS course_title FROM sessions_live
     JOIN courses ON courses.id = sessions_live.course_id
     WHERE sessions_live.instructor_id = ? ORDER BY session_date ASC`
  ).all(req.user.id);
  res.json({ sessions: rows });
});

router.post('/schedule', (req, res) => {
  const { course_id, session_date, start_time, end_time } = req.body || {};
  if (!course_id || !session_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول' });
  }
  const course = db.prepare('SELECT * FROM courses WHERE id = ? AND instructor_id = ?').get(course_id, req.user.id);
  if (!course) return res.status(403).json({ error: 'لا يمكنك جدولة دورة لا تخصك' });
  const info = db.prepare(
    'INSERT INTO sessions_live (course_id,instructor_id,session_date,start_time,end_time) VALUES (?,?,?,?,?)'
  ).run(course_id, req.user.id, session_date, start_time, end_time);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/progress-summary', (req, res) => {
  const rows = db.prepare(
    `SELECT enrollments.progress FROM enrollments
     JOIN courses ON courses.id = enrollments.course_id
     WHERE courses.instructor_id = ?`
  ).all(req.user.id);
  const buckets = { excellent: 0, good: 0, average: 0, weak: 0 };
  rows.forEach(r => {
    if (r.progress >= 80) buckets.excellent++;
    else if (r.progress >= 60) buckets.good++;
    else if (r.progress >= 30) buckets.average++;
    else buckets.weak++;
  });
  const total = rows.length || 1;
  res.json({
    overallPct: Math.round(rows.reduce((s, r) => s + r.progress, 0) / total),
    breakdown: {
      excellent: Math.round((buckets.excellent / total) * 100),
      good: Math.round((buckets.good / total) * 100),
      average: Math.round((buckets.average / total) * 100),
      weak: Math.round((buckets.weak / total) * 100)
    }
  });
});

router.get('/activity', (req, res) => {
  const rows = db.prepare(
    `SELECT enrollments.progress, enrollments.enrolled_at, users.name AS trainee_name, courses.title AS course_title
     FROM enrollments
     JOIN users ON users.id = enrollments.trainee_id
     JOIN courses ON courses.id = enrollments.course_id
     WHERE courses.instructor_id = ?
     ORDER BY enrollments.id DESC LIMIT 8`
  ).all(req.user.id);
  res.json({
    activity: rows.map(r => `${r.trainee_name} مسجل في دورة "${r.course_title}" بنسبة تقدم ${r.progress}%`)
  });
});

module.exports = router;
