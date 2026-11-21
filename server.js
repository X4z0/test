require('dotenv').config();
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { getDb } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'เซิร์ฟเวอร์ผิดพลาด' }); });
const toId = s => (ObjectId.isValid(s) ? new ObjectId(s) : null);

// ---------- Middleware สิทธิ์ ----------
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  next();
}
const sign = u => jwt.sign({ id: u._id, name: u.name, role: u.role }, SECRET, { expiresIn: '8h' });

// ---------- Auth ----------
app.post('/api/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'กรอกข้อมูลให้ครบ (รหัสผ่านอย่างน้อย 6 ตัว)' });
  const db = await getDb();
  if (await db.collection('users').findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  const user = { name, email: email.toLowerCase(), passwordHash: await bcrypt.hash(password, 10), role: 'customer', createdAt: new Date() }; // role ถูกกำหนดที่เซิร์ฟเวอร์เสมอ
  const r = await db.collection('users').insertOne(user);
  user._id = r.insertedId;
  res.json({ token: sign(user), user: { name: user.name, role: user.role } });
}));

app.post('/api/login', wrap(async (req, res) => {
  const { email = '', password = '' } = req.body;
  const db = await getDb();
  const user = await db.collection('users').findOne({ email: email.toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  res.json({ token: sign(user), user: { name: user.name, role: user.role } });
}));

// ---------- Products (ทุกคนอ่านได้) ----------
app.get('/api/categories', wrap(async (req, res) => {
  const db = await getDb();
  res.json(await db.collection('products').distinct('category'));
}));

app.get('/api/products', wrap(async (req, res) => {
  const { category, q, sort } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (q) { const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); filter.$or = [{ name: rx }, { description: rx }]; }
  const sorts = { 'price-asc': { price: 1 }, 'price-desc': { price: -1 }, new: { _id: -1 } };
  const db = await getDb();
  res.json(await db.collection('products').find(filter).sort(sorts[sort] || { _id: 1 }).toArray());
}));

app.get('/api/products/:id', wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'รหัสสินค้าไม่ถูกต้อง' });
  const db = await getDb();
  const p = await db.collection('products').findOne({ _id: id });
  p ? res.json(p) : res.status(404).json({ error: 'ไม่พบสินค้า' });
}));

// ---------- Products (Admin เท่านั้น) ----------
function cleanProduct(b) {
  const p = {
    name: String(b.name || '').trim(),
    category: String(b.category || '').trim(),
    price: Number(b.price),
    stock: parseInt(b.stock, 10),
    imageUrl: String(b.imageUrl || '').trim(),
    description: String(b.description || '').trim()
  };
  if (!p.name || !p.category || !(p.price >= 0) || !(p.stock >= 0)) return null;
  return p;
}

app.post('/api/products', auth, adminOnly, wrap(async (req, res) => {
  const p = cleanProduct(req.body);
  if (!p) return res.status(400).json({ error: 'ข้อมูลสินค้าไม่ครบหรือไม่ถูกต้อง' });
  const db = await getDb();
  const r = await db.collection('products').insertOne({ ...p, createdAt: new Date() });
  res.status(201).json({ _id: r.insertedId, ...p });
}));

app.put('/api/products/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id), p = cleanProduct(req.body);
  if (!id || !p) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
  const db = await getDb();
  const r = await db.collection('products').updateOne({ _id: id }, { $set: { ...p, updatedAt: new Date() } });
  r.matchedCount ? res.json({ ok: true }) : res.status(404).json({ error: 'ไม่พบสินค้า' });
}));

app.delete('/api/products/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'รหัสไม่ถูกต้อง' });
  const db = await getDb();
  const r = await db.collection('products').deleteOne({ _id: id });
  r.deletedCount ? res.json({ ok: true }) : res.status(404).json({ error: 'ไม่พบสินค้า' });
}));

// ---------- Orders ----------
// ลูกค้าสั่งซื้อ: ราคา/ชื่อสินค้าอ่านจาก DB เอง (ไม่เชื่อราคาจาก browser) และตัดสต็อกแบบ atomic
app.post('/api/orders', auth, wrap(async (req, res) => {
  const { items, shipping } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'ตะกร้าว่าง' });
  if (!shipping || !shipping.name || !shipping.phone || !shipping.address) return res.status(400).json({ error: 'กรอกที่อยู่จัดส่งให้ครบ' });

  const db = await getDb();
  const products = db.collection('products');
  const done = [];   // รายการที่ตัดสต็อกสำเร็จแล้ว (ไว้คืนสต็อกถ้าพลาด)
  const lines = [];

  try {
    for (const it of items) {
      const id = toId(it.productId), qty = parseInt(it.qty, 10);
      if (!id || !(qty > 0)) throw new Error('รายการสินค้าไม่ถูกต้อง');
      // ตัดสต็อกเฉพาะเมื่อสต็อกพอ (เงื่อนไขและการลดทำในคำสั่งเดียว กันขายเกิน)
      const p = await products.findOneAndUpdate({ _id: id, stock: { $gte: qty } }, { $inc: { stock: -qty } });
      if (!p) {
        const cur = await products.findOne({ _id: id });
        throw new Error(cur ? `สินค้า "${cur.name}" เหลือไม่พอ (เหลือ ${cur.stock})` : 'มีสินค้าที่ถูกลบออกจากร้านแล้ว');
      }
      done.push({ id, qty });
      lines.push({ productId: id, name: p.name, price: p.price, qty, imageUrl: p.imageUrl });
    }
  } catch (e) {
    for (const d of done) await products.updateOne({ _id: d.id }, { $inc: { stock: d.qty } });
    return res.status(400).json({ error: e.message });
  }

  const order = {
    userId: new ObjectId(req.user.id),
    customerName: req.user.name,
    items: lines,
    total: lines.reduce((s, l) => s + l.price * l.qty, 0),
    shipping: { name: shipping.name, phone: shipping.phone, address: shipping.address },
    status: 'pending',
    createdAt: new Date()
  };
  const r = await db.collection('orders').insertOne(order);
  res.status(201).json({ orderId: r.insertedId, total: order.total });
}));

app.get('/api/my-orders', auth, wrap(async (req, res) => {
  const db = await getDb();
  res.json(await db.collection('orders').find({ userId: new ObjectId(req.user.id) }).sort({ createdAt: -1 }).toArray());
}));

app.get('/api/orders', auth, adminOnly, wrap(async (req, res) => {
  const db = await getDb();
  res.json(await db.collection('orders').find().sort({ createdAt: -1 }).toArray());
}));

app.patch('/api/orders/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = toId(req.params.id), { status } = req.body;
  if (!id || !['pending', 'paid', 'shipped', 'cancelled'].includes(status)) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
  const db = await getDb();
  await db.collection('orders').updateOne({ _id: id }, { $set: { status } });
  res.json({ ok: true });
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('เปิดเว็บที่ http://localhost:' + PORT));
