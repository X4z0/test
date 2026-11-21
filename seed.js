// รัน 1 ครั้ง: npm run seed  -> สร้างบัญชี Admin + index
// (ถ้า products ว่างและมีไฟล์ products.json จะนำเข้าให้ด้วย)
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

(async () => {
  const db = await getDb();

  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('products').createIndex({ category: 1 });
  await db.collection('orders').createIndex({ userId: 1, createdAt: -1 });

  const email = process.env.ADMIN_EMAIL || 'admin@itstore.test';
  const password = process.env.ADMIN_PASSWORD || 'admin1234';
  await db.collection('users').updateOne(
    { email },
    { $setOnInsert: { name: 'ผู้ดูแลร้าน', email, passwordHash: await bcrypt.hash(password, 10), role: 'admin', createdAt: new Date() } },
    { upsert: true }
  );
  console.log('Admin พร้อมใช้งาน:', email);

  if (fs.existsSync('./products.json') && (await db.collection('products').countDocuments()) === 0) {
    const items = JSON.parse(fs.readFileSync('./products.json', 'utf8')).map(p => ({ ...p, createdAt: new Date() }));
    await db.collection('products').insertMany(items);
    console.log('นำเข้าสินค้า', items.length, 'รายการ');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
