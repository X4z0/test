// ฟังก์ชันที่ใช้ร่วมกันทั้ง 2 หน้า
const $ = (s, el = document) => el.querySelector(s);
const baht = n => '฿' + Number(n).toLocaleString('th-TH');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const Auth = {
  get token() { return localStorage.getItem('token'); },
  get user() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  save(d) { localStorage.setItem('token', d.token); localStorage.setItem('user', JSON.stringify(d.user)); },
  clear() { localStorage.removeItem('token'); localStorage.removeItem('user'); }
};

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (Auth.token) headers.Authorization = 'Bearer ' + Auth.token;
  const res = await fetch('/api' + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { if (res.status === 401) Auth.clear(); throw new Error(data.error || 'เกิดข้อผิดพลาด'); }
  return data;
}

function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), 2600);
}
