const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');

types.setTypeParser(20, (val) => parseInt(val, 10));
types.setTypeParser(1700, (val) => parseFloat(val));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required (Postgres connection string).');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
}

function prepare(sql) {
  const isInsert = /^\s*insert\s+into/i.test(sql) && !/returning/i.test(sql);
  const text = isInsert
    ? convertPlaceholders(sql).replace(/;\s*$/, '') + ' RETURNING id'
    : convertPlaceholders(sql);

  return {
    get: async (...params) => {
      const res = await pool.query(text, params);
      return res.rows[0];
    },
    all: async (...params) => {
      const res = await pool.query(text, params);
      return res.rows;
    },
    run: async (...params) => {
      const res = await pool.query(text, params);
      return {
        lastInsertRowid: isInsert && res.rows[0] ? res.rows[0].id : undefined,
        changes: res.rowCount
      };
    }
  };
}

async function exec(sql) {
  await pool.query(sql);
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','instructor','trainee')),
  title TEXT,
  phone TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  instructor_id INTEGER REFERENCES users(id),
  level TEXT NOT NULL,
  duration_hours INTEGER NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'menu_book',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id SERIAL PRIMARY KEY,
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  progress INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
  enrolled_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(trainee_id, course_id)
);

CREATE TABLE IF NOT EXISTS sessions_live (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  instructor_id INTEGER NOT NULL REFERENCES users(id),
  session_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certificates (
  id SERIAL PRIMARY KEY,
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  issued_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  icon TEXT DEFAULT 'notifications',
  text TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','pending','failed')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  trainee_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  text TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL DEFAULT '{}'
);
`;

async function seedIfEmpty() {
  const row = (await prepare('SELECT COUNT(*) AS c FROM users').get());
  if (row.c > 0) return;

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const insertUser = prepare(
    'INSERT INTO users (name,email,password_hash,role,title,phone) VALUES (?,?,?,?,?,?)'
  );
  const admin = await insertUser.run('مدير النظام', 'admin@tahseenmsarak.com', hash('admin123'), 'admin', 'مدير المركز', '0501111111');
  const instr1 = await insertUser.run('م. محمد العتيبي', 'mohammed@tahseenmsarak.com', hash('instructor123'), 'instructor', 'مدرب معتمد', '0502222222');
  const instr2 = await insertUser.run('د. سارة القحطاني', 'sara@tahseenmsarak.com', hash('instructor123'), 'instructor', 'مدربة معتمدة', '0503333333');
  const instr3 = await insertUser.run('م. خالد الشمري', 'khalid@tahseenmsarak.com', hash('instructor123'), 'instructor', 'مدرب معتمد', '0504444444');
  const tr1 = await insertUser.run('عبدالله الفهمي', 'abdullah@example.com', hash('trainee123'), 'trainee', null, '0505555555');
  const tr2 = await insertUser.run('أحمد محمد', 'ahmed@example.com', hash('trainee123'), 'trainee', null, '0506666666');
  const tr3 = await insertUser.run('نورة سعيد', 'noura@example.com', hash('trainee123'), 'trainee', null, '0507777777');

  const insertCourse = prepare(
    'INSERT INTO courses (title,category,price,instructor_id,level,duration_hours,description,icon) VALUES (?,?,?,?,?,?,?,?)'
  );
  const courses = [
    ['الأتمتة الصناعية والتحكم PLC', 'industrial', 1200, instr1.lastInsertRowid, 'متقدم', 40, 'دورة شاملة في أنظمة التحكم المنطقي القابل للبرمجة (PLC)', 'precision_manufacturing'],
    ['إدارة المشاريع الاحترافية PMP', 'pm', 1500, instr2.lastInsertRowid, 'متوسط', 35, 'إعداد كامل لاجتياز اختبار PMP', 'assignment_turned_in'],
    ['التصميم الهندسي AutoCAD', 'science', 900, instr3.lastInsertRowid, 'مبتدئ', 30, 'تعلم أساسيات الرسم الهندسي', 'architecture'],
    ['السلامة والصحة المهنية', 'safety', 750, instr1.lastInsertRowid, 'مبتدئ', 20, 'دورة معتمدة في السلامة المهنية', 'health_and_safety'],
    ['أساسيات الروبوتات الصناعية', 'industrial', 1350, instr1.lastInsertRowid, 'متقدم', 45, 'مقدمة في الروبوتات الصناعية', 'smart_toy'],
    ['إدارة الجودة الشاملة TQM', 'pm', 1100, instr2.lastInsertRowid, 'متوسط', 25, 'منهجيات إدارة الجودة الشاملة', 'verified'],
    ['السلامة الكهربائية في المصانع', 'safety', 680, instr3.lastInsertRowid, 'مبتدئ', 18, 'قواعد السلامة الكهربائية', 'bolt'],
    ['صيانة المعدات الصناعية', 'industrial', 980, instr3.lastInsertRowid, 'متوسط', 30, 'أساليب الصيانة الوقائية', 'construction']
  ];
  const courseIds = [];
  for (const c of courses) {
    const info = await insertCourse.run(...c);
    courseIds.push(Number(info.lastInsertRowid));
  }

  const insertEnroll = prepare(
    'INSERT INTO enrollments (trainee_id,course_id,progress,status) VALUES (?,?,?,?)'
  );
  await insertEnroll.run(tr1.lastInsertRowid, courseIds[0], 75, 'active');
  await insertEnroll.run(tr1.lastInsertRowid, courseIds[1], 60, 'active');
  await insertEnroll.run(tr1.lastInsertRowid, courseIds[2], 40, 'active');
  await insertEnroll.run(tr1.lastInsertRowid, courseIds[3], 90, 'active');
  await insertEnroll.run(tr2.lastInsertRowid, courseIds[0], 55, 'active');
  await insertEnroll.run(tr3.lastInsertRowid, courseIds[3], 100, 'completed');

  const insertOrder = prepare(
    'INSERT INTO orders (trainee_id,course_id,amount,status) VALUES (?,?,?,?)'
  );
  await insertOrder.run(tr1.lastInsertRowid, courseIds[0], 1200, 'paid');
  await insertOrder.run(tr1.lastInsertRowid, courseIds[1], 1500, 'paid');
  await insertOrder.run(tr2.lastInsertRowid, courseIds[0], 1200, 'paid');
  await insertOrder.run(tr3.lastInsertRowid, courseIds[3], 750, 'paid');

  const insertCert = prepare(
    'INSERT INTO certificates (trainee_id,course_id,title) VALUES (?,?,?)'
  );
  await insertCert.run(tr3.lastInsertRowid, courseIds[3], 'شهادة أساسيات السلامة المهنية');

  const insertNotif = prepare(
    'INSERT INTO notifications (user_id,icon,text) VALUES (?,?,?)'
  );
  await insertNotif.run(tr1.lastInsertRowid, 'event_available', 'تم تأكيد تسجيلك في جلسة PLC القادمة');
  await insertNotif.run(tr1.lastInsertRowid, 'campaign', 'خصم 20% على دورات القطاع الصناعي');
  await insertNotif.run(tr3.lastInsertRowid, 'workspace_premium', 'تم إصدار شهادة جديدة لك');

  const insertSession = prepare(
    'INSERT INTO sessions_live (course_id,instructor_id,session_date,start_time,end_time) VALUES (?,?,?,?,?)'
  );
  await insertSession.run(courseIds[0], instr1.lastInsertRowid, '2026-07-21', '16:00', '18:00');
  await insertSession.run(courseIds[1], instr2.lastInsertRowid, '2026-07-23', '10:00', '12:00');

  console.log('Seed data inserted.');
}

async function seedSettingsIfEmpty() {
  const row = await prepare('SELECT COUNT(*) AS c FROM settings').get();
  if (row.c > 0) return;
  await prepare('INSERT INTO settings (id, data) VALUES (1, ?)').run('{}');
}

const ready = (async () => {
  await exec(SCHEMA_SQL);
  await seedIfEmpty();
  await seedSettingsIfEmpty();
  console.log('Database ready (Postgres).');
})();

ready.catch((err) => {
  console.error('Database initialization failed:', err);
});

module.exports = { prepare, exec, pool, ready };
