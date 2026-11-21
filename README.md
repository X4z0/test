# IT Store – เว็บร้านค้าออนไลน์ + MongoDB

Node.js + Express + MongoDB Atlas (DB: `IT_Store`, คอลเลกชัน: `products`, `orders`, `users`)

## รันในเครื่อง
1. `npm install`
2. คัดลอก `.env.example` เป็น `.env` แล้วใส่ `MONGODB_URI` (Atlas → Connect → Drivers) และ `JWT_SECRET`
3. Atlas → Network Access → อนุญาต IP (ทดสอบ: 0.0.0.0/0)
4. `npm run seed`  → สร้างบัญชี Admin (ค่าเริ่มต้น admin@itstore.test / admin1234)
5. `npm start` → เปิด http://localhost:3000

## Deploy ให้ได้ URL (Render.com ฟรี)
อัปโหลดโค้ดขึ้น GitHub → Render → New Web Service → Build: `npm install`, Start: `npm start`
→ ใส่ Environment Variables เหมือนใน `.env`

## โครงสร้างเอกสาร (สำหรับสไลด์)
- products: { name, category, price, stock, imageUrl, description, createdAt }
- users:    { name, email, passwordHash, role: "admin"|"customer", createdAt }
- orders:   { userId(Reference→users), customerName,
              items[ {productId(Reference→products), name, price, qty, imageUrl} ](Embed ณ เวลาซื้อ),
              total, shipping{name,phone,address}, status, createdAt }
