const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function courseWithInstructor(c) {
  const instructor = db.prepare('SELECT name FROM users WHERE id = ?').get(c.instructor_id);
  const studentsRow = db.prepare('SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ?').get(c.id);
  const ratingRow = db.prepare('SELECT AVG(rating) AS avg FROM reviews WHERE course_id = ?').get(c.id);
  return {
    id: c.id,
    title: c.title,
    cat: c.category,
    price: c.price,
    instructor: instructor ? instructor.name : 'غير محدد',
    instructorId: c.instructor_id,
    level: c.level,
    duration: c.duration_hours + ' ساعة',
    students: studentsRow.c,
    rating: ratingRow.avg ? Math.round(ratingRow.avg * 10) / 10 : 4.7,
    icon: c.icon,
    desc: c.description
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM courses ORDER BY id DESC').all();
  res.json({ courses: rows.map(courseWithInstructor) });
});

router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'الدورة غير موجودة' });
  const modules = [
    'مقدمة في الدورة والأهداف التدريبية',
    'الأساسيات النظرية والمفاهيم الرئيسية',
    'التطبيق العملي على أمثلة حقيقية',
    'دراسة حالة ومشروع تطبيقي',
    'المراجعة والاختبار النهائي'
  ];
  const reviews = db.prepare(
    `SELECT reviews.rating, reviews.text, users.name FROM reviews
     JOIN users ON users.id = reviews.trainee_id WHERE course_id = ? ORDER BY reviews.id DESC`
  ).all(req.params.id);
  res.json({ course: courseWithInstructor(c), modules, reviews });
});

router.post('/', requireAuth, requireRole('admin', 'instructor'), (req, res) => {
  const { title, category, price, level, duration_hours, description, icon, instructor_id } = req.body || {};
  if (!title || !category || !price || !level || !duration_hours) {
    return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول المطلوبة' });
  }
  const instructorId = req.user.role === 'instructor' ? req.user.id : (instructor_id || req.user.id);
  const info = db.prepare(
    'INSERT INTO courses (title,category,price,instructor_id,level,duration_hours,description,icon) VALUES (?,?,?,?,?,?,?,?)'
  ).run(title, category, price, instructorId, level, duration_hours, description || '', icon || 'menu_book');
  const c = db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ course: courseWithInstructor(c) });
});

router.put('/:id', requireAuth, requireRole('admin', 'instructor'), (req, res) => {
  const c = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'الدورة غير موجودة' });
  if (req.user.role === 'instructor' && c.instructor_id !== req.user.id) {
    return res.status(403).json({ error: 'لا يمكنك تعديل دورة لا تخصك' });
  }
  const { title, category, price, level, duration_hours, description, icon } = req.body || {};
  db.prepare(
    `UPDATE courses SET title=?, category=?, price=?, level=?, duration_hours=?, description=?, icon=? WHERE id=?`
  ).run(
    title ?? c.title, category ?? c.category, price ?? c.price, level ?? c.level,
    duration_hours ?? c.duration_hours, description ?? c.description, icon ?? c.icon, req.params.id
  );
  const updated = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  res.json({ course: courseWithInstructor(updated) });
});

router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/enroll', requireAuth, requireRole('trainee'), (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'الدورة غير موجودة' });

  const existing = db.prepare('SELECT * FROM enrollments WHERE trainee_id = ? AND course_id = ?').get(req.user.id, req.params.id);
  if (existing) return res.status(409).json({ error: 'أنت مسجل بالفعل في هذه الدورة' });

  db.prepare('INSERT INTO enrollments (trainee_id,course_id,progress,status) VALUES (?,?,0,?)').run(req.user.id, req.params.id, 'active');
  db.prepare('INSERT INTO orders (trainee_id,course_id,amount,status) VALUES (?,?,?,?)').run(req.user.id, req.params.id, course.price, 'paid');
  db.prepare('INSERT INTO notifications (user_id,icon,text) VALUES (?,?,?)').run(
    req.user.id, 'shopping_cart', `تم تسجيلك بنجاح في دورة "${course.title}"`
  );
  res.status(201).json({ ok: true });
});

router.post('/:id/review', requireAuth, requireRole('trainee'), (req, res) => {
  const { rating, text } = req.body || {};
  if (!rating) return res.status(400).json({ error: 'التقييم مطلوب' });
  db.prepare('INSERT INTO reviews (course_id,trainee_id,rating,text) VALUES (?,?,?,?)').run(
    req.params.id, req.user.id, rating, text || ''
  );
  res.status(201).json({ ok: true });
});

module.exports = router;
