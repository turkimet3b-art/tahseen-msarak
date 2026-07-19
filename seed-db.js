require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const demoUsers = [
  { name: 'مدير النظام', email: 'admin@tahseen.com', password: 'admin123', role: 'admin', title: 'مدير' },
  { name: 'محمد العتيبي', email: 'instructor@tahseen.com', password: 'instructor123', role: 'instructor', title: 'مدرب' },
  { name: 'عبدالله الفهمي', email: 'trainee@tahseen.com', password: 'trainee123', role: 'trainee', title: null }
];

async function seedDatabase() {
  console.log('🌱 بدء إنشاء بيانات الديموندو...');

  try {
    demoUsers.forEach(user => {
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(user.email);
      if (existing) {
        console.log(`✅ المستخدم ${user.email} موجود بالفعل`);
        return;
      }

      const hash = bcrypt.hashSync(user.password, 10);
      const result = db.prepare(
        'INSERT INTO users (name, email, password_hash, role, title, phone) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(user.name, user.email, hash, user.role, user.title, '966501234567');

      console.log(`✅ تم إنشاء المستخدم: ${user.email}`);
      console.log(`   • البريد: ${user.email}`);
      console.log(`   • كلمة المرور: ${user.password}`);
      console.log(`   • الدور: ${user.role}\n`);
    });

    console.log('✅ اكتمل إنشاء بيانات الديموندو بنجاح!\n');
    console.log('📝 بيانات تسجيل الدخول:');
    console.log('─'.repeat(50));
    demoUsers.forEach(u => {
      console.log(`\n${u.role.toUpperCase()}:`);
      console.log(`  البريد: ${u.email}`);
      console.log(`  كلمة المرور: ${u.password}`);
    });
    console.log('\n─'.repeat(50));

  } catch (error) {
    console.error('❌ خطأ:', error.message);
    process.exit(1);
  }
}

seedDatabase();
