const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

async function courseWithInstructor(c) {
  const instructor = await db.prepare('SELECT name FROM users WHERE id = ?').get(c.instructor_id);
  const studentsRow = await db.prepare('SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ?').get(c.id);
  const ratingRow = await db.prepare('SELECT AVG(rating) AS avg FROM reviews WHERE course_id = ?').get(c.id);
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

router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare('SELECT * FROM courses ORDER BY id DESC').all();
    const courses = await Promise.all(rows.map(courseWithInstructor));
    res.json({ courses });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const c = await db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'الدورة غير موجودة' });
    const modules = [
      'مقدمة في الدورة والأهداف التدريبية',
      'الأساسيات النظرية والمفاهيم الرئيسية',
      'التطبيق العملي على أمثلة حقيقية',
      'دراسة حالة ومشروع تطبيقي',
      'المراجعة والاختبار النهائي'
    ];
    const reviews = await db.prepare(
      `SELECT reviews.rating, reviews.text, users.name FROM reviews
       JOIN users ON users.id = reviews.trainee_id WHERE course_id = ? ORDER BY reviews.id DESC`
    ).all(req.params.id);
    res.json({ course: await courseWithInstructor(c), modules, reviews });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireAuth, requireRole('admin', 'instructor'), async (req, res) => {
  try {
    const { title, category, price, level, duration_hours, description, icon, instructor_id } = req.body || {};
    if (!title || !category || !price || !level || !duration_hours) {
      return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول المطلوبة' });
    }
    const instructorId = req.user.role === 'instructor' ? req.user.id : (instructor_id || req.user.id);
    const info = await db.prepare(
      'INSERT INTO courses (title,category,price,instructor_id,level,duration_hours,description,icon) VALUES (?,?,?,?,?,?,?,?)'
    ).run(title, category, price, instructorId, level, duration_hours, description || '', icon || 'menu_book');
    const c = await db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ course: await courseWithInstructor(c) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireAuth, requireRole('admin', 'instructor'), async (req, res) => {
  try {
    const c = await db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'الدورة غير موجودة' });
    if (req.user.role === 'instructor' && c.instructor_id !== req.user.id) {
      return res.status(403).json({ error: 'لا يمكنك تعديل دورة لا تخصك' });
    }
    const { title, category, price, level, duration_hours, description, icon } = req.body || {};
    await db.prepare(
      `UPDATE courses SET title=?, category=?, price=?, level=?, duration_hours=?, description=?, icon=? WHERE id=?`
    ).run(
      title ?? c.title, category ?? c.category, price ?? c.price, level ?? c.level,
      duration_hours ?? c.duration_hours, description ?? c.description, icon ?? c.icon, req.params.id
    );
    const updated = await db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    res.json({ course: await courseWithInstructor(updated) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/enroll', requireAuth, requireRole('trainee'), async (req, res) => {
  try {
    const course = await db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'الدورة غير موجودة' });

    const existing = await db.prepare('SELECT * FROM enrollments WHERE trainee_id = ? AND course_id = ?').get(req.user.id, req.params.id);
    if (existing) return res.status(409).json({ error: 'أنت مسجل بالفعل في هذه الدورة' });

    await db.prepare('INSERT INTO enrollments (trainee_id,course_id,progress,status) VALUES (?,?,0,?)').run(req.user.id, req.params.id, 'active');
    await db.prepare('INSERT INTO orders (trainee_id,course_id,amount,status) VALUES (?,?,?,?)').run(req.user.id, req.params.id, course.price, 'paid');
    await db.prepare('INSERT INTO notifications (user_id,icon,text) VALUES (?,?,?)').run(
      req.user.id, 'shopping_cart', `تم تسجيلك بنجاح في دورة "${course.title}"`
    );
    res.status(201).json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/review', requireAuth, requireRole('trainee'), async (req, res) => {
  try {
    const { rating, text } = req.body || {};
    if (!rating) return res.status(400).json({ error: 'التقييم مطلوب' });
    await db.prepare('INSERT INTO reviews (course_id,trainee_id,rating,text) VALUES (?,?,?,?)').run(
      req.params.id, req.user.id, rating, text || ''
    );
    res.status(201).json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
