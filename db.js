const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','instructor','trainee')),
  title TEXT,
  phone TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('science','industrial','pm','safety')),
  price REAL NOT NULL,
  instructor_id INTEGER REFERENCES users(id),
  level TEXT NOT NULL,
  duration_hours INTEGER NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'menu_book',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  progress INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
  enrolled_at TEXT DEFAULT (datetime('now')),
  UNIQUE(trainee_id, course_id)
);

CREATE TABLE IF NOT EXISTS sessions_live (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  instructor_id INTEGER NOT NULL REFERENCES users(id),
  session_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  issued_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  icon TEXT DEFAULT 'notifications',
  text TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','pending','failed')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  text TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL DEFAULT '{}'
    );
`);

function seedIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (row.c > 0) return;

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const insertUser = db.prepare(
    'INSERT INTO users (name,email,password_hash,role,title,phone) VALUES (?,?,?,?,?,?)'
  );
  const admin = insertUser.run('مدير النظام', 'admin@tahseenmsarak.com', hash('admin123'), 'admin', 'مدير المركز', '0501111111');
  const instr1 = insertUser.run('م. محمد العتيبي', 'mohammed@tahseenmsarak.com', hash('instructor123'), 'instructor', 'مدرب معتمد', '0502222222');
  const instr2 = insertUser.run('د. سارة القحطاني', 'sara@tahseenmsarak.com', hash('instructor123'), 'instructor', 'مدربة معتمدة', '0503333333');
  const instr3 = insertUser.run('م. خالد الشمري', 'khalid@tahseenmsarak.com', hash('instructor123'), 'instructor', 'مدرب معتمد', '0504444444');
  const tr1 = insertUser.run('عبدالله الفهمي', 'abdullah@example.com', hash('trainee123'), 'trainee', null, '0505555555');
  const tr2 = insertUser.run('أحمد محمد', 'ahmed@example.com', hash('trainee123'), 'trainee', null, '0506666666');
  const tr3 = insertUser.run('نورة سعيد', 'noura@example.com', hash('trainee123'), 'trainee', null, '0507777777');

  const insertCourse = db.prepare(
    'INSERT INTO courses (title,category,price,instructor_id,level,duration_hours,description,icon) VALUES (?,?,?,?,?,?,?,?)'
  );
  const courses = [
    ['الأتمتة الصناعية والتحكم PLC', 'industrial', 1200, instr1.lastInsertRowid, 'متقدم', 40, 'دورة شاملة في أنظمة التحكم المنطقي القابل للبرمجة (PLC) تغطي التصميم والبرمجة والتشغيل لأنظمة الأتمتة الصناعية الحديثة المستخدمة في المصانع.', 'precision_manufacturing'],
    ['إدارة المشاريع الاحترافية PMP', 'pm', 1500, instr2.lastInsertRowid, 'متوسط', 35, 'إعداد كامل لاجتياز اختبار PMP يغطي مجموعة المعارف PMBOK مع تطبيقات عملية على مشاريع حقيقية في القطاع الصناعي.', 'assignment_turned_in'],
    ['التصميم الهندسي AutoCAD', 'science', 900, instr3.lastInsertRowid, 'مبتدئ', 30, 'تعلم أساسيات ومهارات الرسم الهندسي ثنائي وثلاثي الأبعاد باستخدام برنامج AutoCAD مع مشاريع تطبيقية.', 'architecture'],
    ['السلامة والصحة المهنية', 'safety', 750, instr1.lastInsertRowid, 'مبتدئ', 20, 'دورة معتمدة تغطي أسس السلامة المهنية، تقييم المخاطر، والإجراءات الوقائية في بيئات العمل الصناعية.', 'health_and_safety'],
    ['أساسيات الروبوتات الصناعية', 'industrial', 1350, instr1.lastInsertRowid, 'متقدم', 45, 'مقدمة تطبيقية في الروبوتات الصناعية وبرمجتها وتكاملها في خطوط الإنتاج الحديثة.', 'smart_toy'],
    ['إدارة الجودة الشاملة TQM', 'pm', 1100, instr2.lastInsertRowid, 'متوسط', 25, 'منهجيات إدارة الجودة الشاملة وأدوات تحسين العمليات الصناعية ورفع الكفاءة التشغيلية.', 'verified'],
    ['السلامة الكهربائية في المصانع', 'safety', 680, instr3.lastInsertRowid, 'مبتدئ', 18, 'قواعد وإجراءات السلامة الكهربائية للعاملين في البيئات الصناعية وخطوط الإنتاج.', 'bolt'],
    ['صيانة المعدات الصناعية', 'industrial', 980, instr3.lastInsertRowid, 'متوسط', 30, 'أساليب الصيانة الوقائية والتنبؤية للمعدات الصناعية لتقليل الأعطال وزيادة العمر الافتراضي.', 'construction']
  ];
  const courseIds = courses.map(c => Number(insertCourse.run(...c).lastInsertRowid));

  const insertEnroll = db.prepare(
    'INSERT INTO enrollments (trainee_id,course_id,progress,status) VALUES (?,?,?,?)'
  );
  insertEnroll.run(tr1.lastInsertRowid, courseIds[0], 75, 'active');
  insertEnroll.run(tr1.lastInsertRowid, courseIds[1], 60, 'active');
  insertEnroll.run(tr1.lastInsertRowid, courseIds[2], 40, 'active');
  insertEnroll.run(tr1.lastInsertRowid, courseIds[3], 90, 'active');
  insertEnroll.run(tr2.lastInsertRowid, courseIds[0], 55, 'active');
  insertEnroll.run(tr3.lastInsertRowid, courseIds[3], 100, 'completed');

  const insertOrder = db.prepare(
    'INSERT INTO orders (trainee_id,course_id,amount,status) VALUES (?,?,?,?)'
  );
  insertOrder.run(tr1.lastInsertRowid, courseIds[0], 1200, 'paid');
  insertOrder.run(tr1.lastInsertRowid, courseIds[1], 1500, 'paid');
  insertOrder.run(tr2.lastInsertRowid, courseIds[0], 1200, 'paid');
  insertOrder.run(tr3.lastInsertRowid, courseIds[3], 750, 'paid');

  const insertCert = db.prepare(
    'INSERT INTO certificates (trainee_id,course_id,title) VALUES (?,?,?)'
  );
  insertCert.run(tr3.lastInsertRowid, courseIds[3], 'شهادة أساسيات السلامة المهنية');

  const insertNotif = db.prepare(
    'INSERT INTO notifications (user_id,icon,text) VALUES (?,?,?)'
  );
  insertNotif.run(tr1.lastInsertRowid, 'event_available', 'تم تأكيد تسجيلك في جلسة PLC القادمة');
  insertNotif.run(tr1.lastInsertRowid, 'campaign', 'خصم 20% على دورات القطاع الصناعي هذا الأسبوع');
  insertNotif.run(tr3.lastInsertRowid, 'workspace_premium', 'تم إصدار شهادة جديدة لك');

  const insertSession = db.prepare(
    'INSERT INTO sessions_live (course_id,instructor_id,session_date,start_time,end_time) VALUES (?,?,?,?,?)'
  );
  insertSession.run(courseIds[0], instr1.lastInsertRowid, '2026-07-21', '16:00', '18:00');
  insertSession.run(courseIds[1], instr2.lastInsertRowid, '2026-07-23', '10:00', '12:00');

  console.log('Seed data inserted.');
}

seedIfEmpty();


function seedSettingsIfEmpty() {
    const row = db.prepare('SELECT COUNT(*) AS c FROM settings').get();
    if (row.c > 0) return;
    db.prepare('INSERT INTO settings (id, data) VALUES (1, ?)').run('{}');
}

seedSettingsIfEmpty();
module.exports = db;
