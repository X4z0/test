let products = [];
let category = '';
let cart = JSON.parse(localStorage.getItem('cart') || '[]'); // [{productId, qty}] เก็บเฉพาะ id+จำนวน ราคาจะอ่านจาก DB เสมอ
let authMode = 'login';
const byId = id => products.find(p => p._id === id);

/* ---------- สินค้า ---------- */
async function loadCategories() {
  const cats = await api('/categories');
  $('#chips').innerHTML = ['', ...cats].map(c =>
    `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === category}">${c ? esc(c) : 'ทั้งหมด'}</button>`).join('');
}
async function loadProducts() {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if ($('#q').value.trim()) params.set('q', $('#q').value.trim());
  if ($('#sort').value) params.set('sort', $('#sort').value);
  products = await api('/products?' + params);
  $('#empty').hidden = products.length > 0;
  $('#grid').innerHTML = products.map(p => `
    <article class="card">
      <img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" data-detail="${p._id}">
      <div class="body">
        <span class="cat">${esc(p.category)}</span>
        <h3 data-detail="${p._id}">${esc(p.name)}</h3>
        <span class="price">${baht(p.price)}</span>
        ${stockLabel(p)}
        <button class="btn primary" data-add="${p._id}" ${p.stock < 1 ? 'disabled' : ''}>${p.stock < 1 ? 'สินค้าหมด' : 'ใส่ตะกร้า'}</button>
      </div>
    </article>`).join('');
}
const stockLabel = p => p.stock < 1 ? '<span class="stock out">สินค้าหมด</span>' : p.stock <= 5 ? `<span class="stock low">เหลือ ${p.stock} ชิ้น</span>` : `<span class="stock">มีสินค้า ${p.stock} ชิ้น</span>`;

let timer;
$('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadProducts, 300); });
$('#sort').addEventListener('change', loadProducts);
$('#chips').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  category = b.dataset.cat; loadCategories(); loadProducts();
});

$('#grid').addEventListener('click', async e => {
  const add = e.target.closest('[data-add]'), det = e.target.closest('[data-detail]');
  if (add) addToCart(add.dataset.add);
  if (det) {
    const p = await api('/products/' + det.dataset.detail); // ดึงรายละเอียดทีละชิ้นจาก MongoDB
    $('#detail').innerHTML = `<button class="x" data-close aria-label="ปิด">×</button>
      <img class="hero" src="${esc(p.imageUrl)}" alt="${esc(p.name)}">
      <span class="cat">${esc(p.category)}</span><h2>${esc(p.name)}</h2>
      <p>${esc(p.description)}</p>
      <p><span class="price">${baht(p.price)}</span> ${stockLabel(p)}</p>
      <button class="btn primary" data-add="${p._id}" ${p.stock < 1 ? 'disabled' : ''}>ใส่ตะกร้า</button>`;
    $('#detailOv').classList.add('open');
  }
});
$('#detail').addEventListener('click', e => { const a = e.target.closest('[data-add]'); if (a) { addToCart(a.dataset.add); $('#detailOv').classList.remove('open'); } });

/* ---------- ปิด modal ---------- */
document.addEventListener('click', e => {
  if (e.target.matches('[data-close]')) e.target.closest('.overlay').classList.remove('open');
  if (e.target.classList.contains('overlay')) e.target.classList.remove('open');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open')); $('#drawer').classList.remove('open'); } });

/* ---------- ตะกร้า ---------- */
const saveCart = () => { localStorage.setItem('cart', JSON.stringify(cart)); renderCart(); };
function addToCart(id) {
  const p = byId(id);
  const line = cart.find(c => c.productId === id);
  const have = line ? line.qty : 0;
  if (p && have >= p.stock) return toast('เพิ่มไม่ได้ สินค้าในสต็อกมีเท่านี้', true);
  line ? line.qty++ : cart.push({ productId: id, qty: 1 });
  saveCart(); toast('เพิ่มลงตะกร้าแล้ว');
}
async function renderCart() {
  $('#cartCount').textContent = cart.reduce((s, c) => s + c.qty, 0);
  // ตะกร้าอาจมีสินค้าที่ไม่อยู่ในหน้าที่กรองอยู่ จึงดึงเพิ่มถ้ายังไม่มี
  for (const c of cart) if (!byId(c.productId)) { try { products.push(await api('/products/' + c.productId)); } catch { c.gone = true; } }
  cart = cart.filter(c => !c.gone);
  $('#cartList').innerHTML = cart.length ? cart.map(c => { const p = byId(c.productId); return `
    <div class="line"><img src="${esc(p.imageUrl)}" alt="">
      <div class="info">${esc(p.name)}<br><strong>${baht(p.price)}</strong></div>
      <div class="qty"><button data-dec="${c.productId}" aria-label="ลด">−</button><span>${c.qty}</span><button data-inc="${c.productId}" aria-label="เพิ่ม">+</button></div>
    </div>`; }).join('') : '<p class="empty">ตะกร้ายังว่าง เลือกสินค้าที่ชอบแล้วกด “ใส่ตะกร้า”</p>';
  $('#cartTotal').textContent = baht(cart.reduce((s, c) => s + (byId(c.productId)?.price || 0) * c.qty, 0));
  $('#checkoutBtn').disabled = !cart.length;
  $('#shipForm').hidden = !(Auth.user && cart.length);
}
$('#cartList').addEventListener('click', e => {
  const inc = e.target.dataset.inc, dec = e.target.dataset.dec;
  const id = inc || dec; if (!id) return;
  const line = cart.find(c => c.productId === id), p = byId(id);
  if (inc && line.qty >= p.stock) return toast('สินค้าในสต็อกมีเท่านี้', true);
  line.qty += inc ? 1 : -1;
  if (line.qty < 1) cart = cart.filter(c => c !== line);
  saveCart();
});
$('#cartBtn').onclick = () => { $('#drawer').classList.add('open'); renderCart(); };
$('#cartClose').onclick = () => $('#drawer').classList.remove('open');

$('#checkoutBtn').onclick = async () => {
  if (!Auth.user) { $('#drawer').classList.remove('open'); return openAuth('login', 'กรุณาเข้าสู่ระบบก่อนสั่งซื้อ'); }
  try {
    const r = await api('/orders', { method: 'POST', body: {
      items: cart, shipping: { name: $('#sName').value.trim(), phone: $('#sPhone').value.trim(), address: $('#sAddr').value.trim() } } });
    cart = []; saveCart(); $('#drawer').classList.remove('open');
    toast('สั่งซื้อสำเร็จ ยอดรวม ' + baht(r.total));
    loadProducts(); // อัปเดตสต็อกที่ลดลง
  } catch (e) { toast(e.message, true); }
};

/* ---------- เข้าสู่ระบบ ---------- */
function openAuth(mode, note = '') {
  authMode = mode;
  $('#authTitle').textContent = mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
  $('#authGo').textContent = mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
  $('#authSwitch').textContent = mode === 'login' ? 'ยังไม่มีบัญชี? สมัครสมาชิก' : 'มีบัญชีแล้ว? เข้าสู่ระบบ';
  $('#nameF').hidden = mode === 'login';
  $('#authMsg').textContent = note;
  $('#authOv').classList.add('open');
}
$('#authSwitch').onclick = e => { e.preventDefault(); openAuth(authMode === 'login' ? 'register' : 'login'); };
$('#authGo').onclick = async () => {
  try {
    const d = await api(authMode === 'login' ? '/login' : '/register', { method: 'POST', body: { name: $('#aName').value, email: $('#aEmail').value, password: $('#aPass').value } });
    Auth.save(d); $('#authOv').classList.remove('open');
    d.user.role === 'admin' ? (location.href = 'admin.html') : (renderUser(), toast('ยินดีต้อนรับ ' + d.user.name));
  } catch (e) { $('#authMsg').textContent = e.message; }
};
$('#authBtn').onclick = () => { if (Auth.user) { Auth.clear(); renderUser(); renderCart(); } else openAuth('login'); };

$('#ordersBtn').onclick = async () => {
  const list = await api('/my-orders');
  $('#ordersList').innerHTML = list.length ? list.map(o => `
    <div style="border-bottom:1px solid var(--line);padding:10px 0">
      <div><strong>${new Date(o.createdAt).toLocaleString('th-TH')}</strong> <span class="badge">${esc(o.status)}</span></div>
      ${o.items.map(i => `<div>${esc(i.name)} × ${i.qty}</div>`).join('')}
      <div><strong>รวม ${baht(o.total)}</strong></div>
    </div>`).join('') : '<p class="empty">ยังไม่มีคำสั่งซื้อ</p>';
  $('#ordersOv').classList.add('open');
};

function renderUser() {
  const u = Auth.user;
  $('#who').textContent = u ? 'สวัสดี ' + u.name : '';
  $('#authBtn').textContent = u ? 'ออกจากระบบ' : 'เข้าสู่ระบบ';
  $('#adminLink').hidden = !(u && u.role === 'admin');
  $('#ordersBtn').hidden = !(u && u.role === 'customer');
}

renderUser();
loadCategories().then(loadProducts).then(renderCart);
