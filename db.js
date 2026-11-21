// เชื่อมต่อ MongoDB (ใช้ connection เดียวทั้งแอป)
require('dotenv').config();
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function getDb() {
  if (!db) {
    await client.connect();
    db = client.db(process.env.DB_NAME || 'IT_Store');
  }
  return db;
}
module.exports = { getDb };
