const config = window.SHENG_HAO_DUO_CONFIG || {};

const API_URL = config.GOOGLE_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbxRkOVGRD_7RptPkfiZOkKaCI12rh9B51dSEdJ2Lcgob_Z71X5FYdnfQ9hSqFVZGmvs/exec';

const SUPABASE_URL = config.SUPABASE_URL;
const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;

const state = {
  token: localStorage.getItem('shd_admin_token') || '',
  user: JSON.parse(localStorage.getItem('shd_admin_user') || 'null'),
  orders: [],
  products: [],
  ambassadors: [],
  referralSummary: [],
  status: '全部',
  keyword: '',
  productKeyword: '',
  tab: 'orders',
  editingProductId: ''
};

const $ = (id) => document.getElementById(id);
const money = (n) => `$${Number(n || 0).toLocaleString('zh-TW')}`;

function toast(message) {
  const el = $('toast');
  if (!el) return alert(message);
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 1800);
}

/* =========================
   Apps Script API
========================= */

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!data.ok) {
    throw new Error(data.message || '操作失敗');
  }

  return data;
}

/* =========================
   Supabase API
========================= */

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('尚未設定 Supabase 連線資料');
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || 'Supabase 操作失敗');
  }

  return text ? JSON.parse(text) : null;
}

async function uploadProductImage(file) {
  if (!file) return '';

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const fileName = `product-${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;
  const path = `products/${fileName}`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': file.type || 'image/jpeg',
      'x-upsert': 'true'
    },
    body: file
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || '圖片上傳失敗');
  }

  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

/* =========================
   Login
========================= */

function showAdmin() {
  $('loginPage').classList.add('hidden');
  $('adminPage').classList.remove('hidden');

  if (state.user) {
    $('userInfo').textContent =
      `${state.user.name || state.user.username}，即時查看與處理顧客訂單`;
  }

  ensureAdminTabs();
  switchTab('orders');
}

function showLogin() {
  $('adminPage').classList.add('hidden');
  $('loginPage').classList.remove('hidden');
}

async function login() {
  const username = $('username').value.trim();
  const password = $('password').value.trim();

  $('loginMsg').textContent = '';

  try {
    const data = await apiPost({
      action: 'adminLogin',
      username,
      password
    });

    state.token = data.token;
    state.user = data.user;

    localStorage.setItem('shd_admin_token', state.token);
    localStorage.setItem('shd_admin_user', JSON.stringify(state.user));

    showAdmin();
  } catch (err) {
    $('loginMsg').textContent = err.message;
  }
}

function logout() {
  localStorage.removeItem('shd_admin_token');
  localStorage.removeItem('shd_admin_user');
  state.token = '';
  state.user = null;
  showLogin();
}

/* =========================
   Tabs
========================= */

function ensureAdminTabs() {
  if ($('adminTabs')) return;

  const tabHtml = document.createElement('div');
  tabHtml.id = 'adminTabs';
  tabHtml.className = 'admin-tabs';

  tabHtml.innerHTML = `
    <button class="admin-tab active" data-tab="orders">訂單管理</button>
    <button class="admin-tab" data-tab="products">商品管理</button>
    <button class="admin-tab" data-tab="ambassadors">分享家管理</button>
    <button class="admin-tab" data-tab="summary">分享業績</button>
  `;

  const userInfo = $('userInfo');
  if (userInfo && userInfo.parentNode) {
    userInfo.parentNode.insertBefore(tabHtml, userInfo.nextSibling);
  } else {
    $('adminPage').prepend(tabHtml);
  }
}

function setOrderToolsVisible(visible) {
  ['searchInput', 'refreshBtn'].forEach(id => {
    const el = $(id);
    if (el) {
      const box = el.closest('.toolbar, .search-card, .filters, .topbar') || el;
      box.style.display = visible ? '' : 'none';
    }
  });

  document.querySelectorAll('.nav').forEach(btn => {
    btn.style.display = visible ? '' : 'none';
  });

  const stats = document.querySelector('.stats');
  if (stats) stats.style.display = visible ? '' : 'none';
}

function switchTab(tab) {
  state.tab = tab;

  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  if (tab === 'orders') {
    setOrderToolsVisible(true);
    loadOrders();
  }

  if (tab === 'products') {
    setOrderToolsVisible(false);
    loadProductsAdmin();
  }

  if (tab === 'ambassadors') {
    setOrderToolsVisible(false);
    loadAmbassadors();
  }

  if (tab === 'summary') {
    setOrderToolsVisible(false);
    loadReferralSummary();
  }
}

/* =========================
   Orders
========================= */

async function loadOrders() {
  try {
    const data = await apiPost({
      action: 'getOrders',
      token: state.token
    });

    state.orders = data.orders || [];
    renderStats();
    renderOrders();
  } catch (err) {
    toast(err.message);
    showLogin();
  }
}

function renderStats() {
  if (!$('statNew')) return;

  $('statNew').textContent =
    state.orders.filter(o => o.status === '已下訂').length;

  $('statContact').textContent =
    state.orders.filter(o => o.status === '已聯繫客服').length;

  $('statDelivery').textContent =
    state.orders.filter(o => o.status === '配送中').length;

  $('statDone').textContent =
    state.orders.filter(o => o.status === '已完成').length;
}

function getFilteredOrders() {
  const kw = state.keyword.toLowerCase();

  return state.orders.filter(order => {
    const matchStatus =
      state.status === '全部' ||
      order.status === state.status;

    const text = [
      order.orderId,
      order.name,
      order.phone,
      order.address,
      order.lineName,
      order.couponCode,
      order.ambassadorCode
    ].join(' ').toLowerCase();

    return matchStatus && (!kw || text.includes(kw));
  });
}

function renderOrders() {
  const orders = getFilteredOrders();

  $('ordersGrid').innerHTML = orders.length
    ? orders.map(orderCard).join('')
    : '<div class="empty">目前沒有符合條件的訂單</div>';
}

function orderCard(order) {
  const itemsHtml = (order.items || []).map(item => `
    <div class="item-row">
      <span>${item.name}</span>
      <span>× ${item.qty}</span>
      <span>${money(item.subtotal)}</span>
    </div>
  `).join('');

  const statuses = ['已下訂', '已聯繫客服', '配送中', '已完成', '已取消'];

  const buttons = statuses.map(status => `
    <button
      class="${order.status === status ? 'active' : ''}"
      data-order="${order.orderId}"
      data-status="${status}"
    >
      ${status}
    </button>
  `).join('');

  const discountHtml = order.couponCode
    ? `
      <div style="margin-top:10px;font-size:14px;color:#82736a;">
        🎟 ${order.couponCode}
        ${order.discountAmount ? `｜折扣 ${money(order.discountAmount)}` : ''}
        ${order.ambassadorCode ? `｜分享家 ${order.ambassadorCode}` : ''}
      </div>
    `
    : '';

  return `
    <article class="order-card">
      <div class="order-head">
        <div>
          <div>訂單編號</div>
          <div class="order-id">${order.orderId}</div>
        </div>
        <div>
          <div class="badge ${order.status}">${order.status}</div>
          <div style="font-size:13px;color:#82736a;margin-top:6px;text-align:right;">
            ${order.createdAt || ''}
          </div>
        </div>
      </div>

      <div class="customer">
        <div>👤 ${order.name || '-'}</div>
        <div>☎️ ${order.phone || '-'}</div>
        <div>📍 ${order.address || '-'}</div>
      </div>

      <div class="items">
        ${itemsHtml || '<div class="empty">沒有商品資料</div>'}
      </div>

      <div class="total">
        <span>總金額</span>
        <strong>${money(order.finalAmount || order.total)}</strong>
      </div>

      ${discountHtml}

      <div class="actions">
        ${buttons}
      </div>
    </article>
  `;
}

async function updateStatus(orderId, status) {
  try {
    await apiPost({
      action: 'updateOrderStatus',
      token: state.token,
      orderId,
      status
    });

    const order = state.orders.find(o => o.orderId === orderId);
    if (order) order.status = status;

    renderStats();
    renderOrders();
    toast('狀態已更新');
  } catch (err) {
    toast(err.message);
  }
}

/* =========================
   Products Admin
========================= */

async function loadProductsAdmin() {
  try {
    $('ordersGrid').innerHTML = '<div class="empty">商品載入中...</div>';

    const rows = await supabaseRequest(
      'products?select=*&order=sort.asc,name.asc'
    );

    state.products = rows || [];
    renderProductsAdmin();
  } catch (err) {
    $('ordersGrid').innerHTML = `<div class="empty">${err.message}</div>`;
  }
}

function getFilteredProductsAdmin() {
  const kw = state.productKeyword.toLowerCase();

  return state.products.filter(p => {
    const text = [
      p.id,
      p.name,
      p.category,
      p.tags,
      p.barcode
    ].join(' ').toLowerCase();

    return !kw || text.includes(kw);
  });
}

function renderProductsAdmin() {
  const products = getFilteredProductsAdmin();

  $('ordersGrid').innerHTML = `
    <div class="admin-card">
      <h2>${state.editingProductId ? '修改商品' : '新增商品'}</h2>

      <div class="admin-form">
        <input id="productId" placeholder="商品編號，可空白自動產生" />
        <input id="productName" placeholder="商品名稱" />
        <input id="productCategory" placeholder="分類，例如 清潔用品" />
        <input id="productPrice" type="number" placeholder="售價" />
        <input id="productCost" type="number" placeholder="成本，可空白" />
        <input id="productStock" type="number" placeholder="庫存，預設 999" />
        <input id="productUnit" placeholder="單位，例如 包、瓶、組" />
        <input id="productBarcode" placeholder="條碼，可空白" />
        <input id="productTags" placeholder="標籤，例如 熱賣,補貨" />
        <textarea id="productDescription" rows="3" placeholder="商品描述，可空白"></textarea>

        <input id="productImageUrl" placeholder="圖片網址，可貼圖鴨或上傳後自動填入" />

        <label style="font-weight:900;">
          商品圖片：可從手機相簿選擇或直接拍照
          <input id="productImageFile" type="file" accept="image/*" style="margin-top:8px;" />
        </label>

        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <label>
            <input id="productFeatured" type="checkbox" />
            設為熱門
          </label>

          <label>
            <input id="productVisible" type="checkbox" checked />
            上架顯示
          </label>
        </div>

        <button id="saveProductBtn">
          ${state.editingProductId ? '儲存修改' : '新增商品'}
        </button>

        ${
          state.editingProductId
            ? '<button id="cancelEditProductBtn" class="small-btn">取消修改</button>'
            : ''
        }
      </div>
    </div>

    <div class="admin-card">
      <h2>商品清單</h2>

      <div class="admin-form">
        <input id="productSearchInput" placeholder="搜尋商品名稱、分類、標籤、條碼" value="${state.productKeyword || ''}" />
      </div>

      <p style="color:#82736a;font-size:14px;">
        共 ${products.length} 件商品。圖片目前支援貼網址，也支援手機上傳到 Supabase Storage。
      </p>

      <div class="product-admin-list">
        ${products.length ? products.map(productAdminCard).join('') : '<div class="empty">尚無商品</div>'}
      </div>
    </div>
  `;

  if (state.editingProductId) {
    fillProductForm(state.products.find(p => p.id === state.editingProductId));
  }
}

function productAdminCard(p) {
  return `
    <article class="order-card">
      <div style="display:grid;grid-template-columns:72px 1fr;gap:12px;align-items:start;">
        <img
          src="${p.image || 'https://placehold.co/300x300/FFF3E8/EC7F32?text=SHD'}"
          style="width:72px;height:72px;object-fit:contain;border-radius:14px;background:#fff3e8;"
          onerror="this.src='https://placehold.co/300x300/FFF3E8/EC7F32?text=SHD'"
        />

        <div>
          <div style="display:flex;justify-content:space-between;gap:10px;">
            <strong>${p.name || '-'}</strong>
            <strong>${money(p.price || 0)}</strong>
          </div>

          <div style="font-size:13px;color:#82736a;margin-top:4px;">
            ${p.id || '-'}｜${p.category || '其他'}｜庫存 ${p.stock ?? 0}
          </div>

          <div style="font-size:13px;color:#82736a;margin-top:4px;">
            ${p.is_visible ? '✅ 上架' : '⛔ 下架'}
            ${p.is_featured ? '｜🔥 熱門' : ''}
          </div>

          <div class="actions" style="margin-top:10px;">
            <button data-edit-product="${p.id}">修改</button>
            <button data-toggle-visible="${p.id}" data-visible="${p.is_visible ? 'false' : 'true'}">
              ${p.is_visible ? '下架' : '上架'}
            </button>
            <button data-toggle-featured="${p.id}" data-featured="${p.is_featured ? 'false' : 'true'}">
              ${p.is_featured ? '取消熱門' : '設熱門'}
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function fillProductForm(p) {
  if (!p) return;

  $('productId').value = p.id || '';
  $('productId').disabled = true;

  $('productName').value = p.name || '';
  $('productCategory').value = p.category || '';
  $('productPrice').value = p.price || '';
  $('productCost').value = p.cost || '';
  $('productStock').value = p.stock ?? 999;
  $('productUnit').value = p.unit || '';
  $('productBarcode').value = p.barcode || '';
  $('productTags').value = p.tags || '';
  $('productDescription').value = p.description || '';
  $('productImageUrl').value = p.image || '';
  $('productFeatured').checked = Boolean(p.is_featured);
  $('productVisible').checked = Boolean(p.is_visible);
}

function getProductFormData() {
  let id = $('productId').value.trim();

  if (!id) {
    id = 'p' + Date.now();
  }

  return {
    id,
    name: $('productName').value.trim(),
    category: $('productCategory').value.trim() || '其他',
    price: Number($('productPrice').value || 0),
    cost: Number($('productCost').value || 0),
    stock: Number($('productStock').value || 999),
    unit: $('productUnit').value.trim(),
    barcode: $('productBarcode').value.trim(),
    tags: $('productTags').value.trim(),
    description: $('productDescription').value.trim(),
    image: $('productImageUrl').value.trim(),
    is_featured: $('productFeatured').checked,
    is_visible: $('productVisible').checked,
    updated_at: new Date().toISOString()
  };
}

async function saveProduct() {
  const btn = $('saveProductBtn');
  const file = $('productImageFile')?.files?.[0];

  try {
    btn.disabled = true;
    btn.textContent = '儲存中...';

    const product = getProductFormData();

    if (!product.name) throw new Error('請輸入商品名稱');
    if (!product.price) throw new Error('請輸入售價');

    if (file) {
      product.image = await uploadProductImage(file);
    }

    if (state.editingProductId) {
      await supabaseRequest(
        `products?id=eq.${encodeURIComponent(state.editingProductId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(product)
        }
      );

      toast('商品已修改');
    } else {
      product.created_at = new Date().toISOString();

      await supabaseRequest('products', {
        method: 'POST',
        body: JSON.stringify(product)
      });

      toast('商品已新增');
    }

    state.editingProductId = '';
    await loadProductsAdmin();

  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = state.editingProductId ? '儲存修改' : '新增商品';
  }
}

function editProduct(productId) {
  state.editingProductId = productId;
  renderProductsAdmin();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function toggleProductField(productId, field, value) {
  try {
    await supabaseRequest(
      `products?id=eq.${encodeURIComponent(productId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          [field]: value,
          updated_at: new Date().toISOString()
        })
      }
    );

    toast('商品已更新');
    await loadProductsAdmin();
  } catch (err) {
    toast(err.message);
  }
}

function cancelEditProduct() {
  state.editingProductId = '';
  renderProductsAdmin();
}

/* =========================
   Ambassadors
========================= */

async function loadAmbassadors() {
  try {
    const data = await apiPost({
      action: 'getAmbassadors',
      token: state.token
    });

    state.ambassadors = data.ambassadors || [];
    renderAmbassadors();
  } catch (err) {
    $('ordersGrid').innerHTML = `<div class="empty">${err.message}</div>`;
  }
}

function getCouponText(ambassador) {
  if (ambassador.couponCode) return ambassador.couponCode;

  if (Array.isArray(ambassador.coupons) && ambassador.coupons.length) {
    return ambassador.coupons.map(c => c.code).join('、');
  }

  return '-';
}

function renderAmbassadors() {
  const rows = state.ambassadors.map(a => `
    <tr>
      <td>${a.ambassadorCode || '-'}</td>
      <td>${a.name || '-'}</td>
      <td>${a.phone || '-'}</td>
      <td><strong>${getCouponText(a)}</strong></td>
      <td>${Number(a.rewardRate || 0.01)}</td>
      <td>${String(a.active).toUpperCase() === 'TRUE' || a.active === true ? '啟用' : '停用'}</td>
      <td>
        <button
          class="small-btn ${String(a.active).toUpperCase() === 'TRUE' || a.active === true ? 'danger' : ''}"
          data-ambassador="${a.ambassadorCode}"
          data-active="${String(a.active).toUpperCase() === 'TRUE' || a.active === true ? 'false' : 'true'}"
        >
          ${String(a.active).toUpperCase() === 'TRUE' || a.active === true ? '停用' : '啟用'}
        </button>
      </td>
    </tr>
  `).join('');

  $('ordersGrid').innerHTML = `
    <div class="admin-card">
      <h2>新增分享家</h2>

      <div class="admin-form">
        <input id="ambName" placeholder="分享家姓名，例如 張軒睿" />
        <input id="ambPhone" placeholder="電話，例如 0912345678" />
        <input id="ambReward" placeholder="回饋比例，預設 0.01" />
        <button id="createAmbBtn">新增分享家</button>
      </div>
    </div>

    <div class="admin-card">
      <h2>分享家清單</h2>

      <table class="admin-table">
        <thead>
          <tr>
            <th>系統代碼</th>
            <th>姓名</th>
            <th>電話</th>
            <th>推薦碼</th>
            <th>回饋</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="7">尚無分享家資料</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

async function createAmbassador() {
  const name = $('ambName').value.trim();
  const phone = $('ambPhone').value.trim();
  const rewardRate = $('ambReward').value.trim() || '0.01';

  if (!name) return toast('請輸入分享家姓名');
  if (!phone) return toast('請輸入電話');

  try {
    const data = await apiPost({
      action: 'createAmbassador',
      token: state.token,
      name,
      phone,
      rewardRate
    });

    toast(`已新增 ${data.name}｜推薦碼 ${data.couponCode}`);

    $('ambName').value = '';
    $('ambPhone').value = '';
    $('ambReward').value = '';

    loadAmbassadors();
  } catch (err) {
    toast(err.message);
  }
}

async function updateAmbassadorStatus(ambassadorCode, active) {
  try {
    await apiPost({
      action: 'updateAmbassadorStatus',
      token: state.token,
      ambassadorCode,
      active
    });

    toast(active ? '已啟用分享家' : '已停用分享家');
    loadAmbassadors();
  } catch (err) {
    toast(err.message);
  }
}

/* =========================
   Referral Summary
========================= */

async function loadReferralSummary() {
  try {
    const data = await apiPost({
      action: 'getReferralSummary',
      token: state.token
    });

    state.referralSummary = data.summary || [];
    renderReferralSummary();
  } catch (err) {
    $('ordersGrid').innerHTML = `<div class="empty">${err.message}</div>`;
  }
}

function renderReferralSummary() {
  const totalOrders = state.referralSummary
    .reduce((sum, row) => sum + Number(row.orderCount || 0), 0);

  const totalAmount = state.referralSummary
    .reduce((sum, row) => sum + Number(row.finalAmount || 0), 0);

  const totalReward = state.referralSummary
    .reduce((sum, row) => sum + Number(row.rewardAmount || 0), 0);

  const rows = state.referralSummary.map(row => `
    <tr>
      <td>${row.ambassadorCode || '-'}</td>
      <td>${row.name || '-'}</td>
      <td>${row.phone || '-'}</td>
      <td>${row.orderCount || 0}</td>
      <td>${money(row.finalAmount || 0)}</td>
      <td>${money(row.rewardAmount || 0)}</td>
      <td>${money(row.unsettledReward || 0)}</td>
      <td>${money(row.settledReward || 0)}</td>
    </tr>
  `).join('');

  $('ordersGrid').innerHTML = `
    <div class="admin-card">
      <h2>分享業績總覽</h2>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:12px 0;">
        <div class="admin-card">
          <div style="color:#82736a;">推薦訂單</div>
          <strong style="font-size:26px;">${totalOrders}</strong>
        </div>
        <div class="admin-card">
          <div style="color:#82736a;">推薦成交</div>
          <strong style="font-size:26px;">${money(totalAmount)}</strong>
        </div>
        <div class="admin-card">
          <div style="color:#82736a;">累積回饋</div>
          <strong style="font-size:26px;">${money(totalReward)}</strong>
        </div>
      </div>

      <table class="admin-table">
        <thead>
          <tr>
            <th>分享家代碼</th>
            <th>姓名</th>
            <th>電話</th>
            <th>訂單數</th>
            <th>成交金額</th>
            <th>總回饋</th>
            <th>未結算</th>
            <th>已結算</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="8">尚無分享業績</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

/* =========================
   Events
========================= */

function bindEvents() {
  $('loginBtn').addEventListener('click', login);

  $('password').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });

  $('refreshBtn').addEventListener('click', () => {
    if (state.tab === 'orders') loadOrders();
    if (state.tab === 'products') loadProductsAdmin();
    if (state.tab === 'ambassadors') loadAmbassadors();
    if (state.tab === 'summary') loadReferralSummary();
  });

  $('logoutBtn').addEventListener('click', logout);

  $('searchInput').addEventListener('input', e => {
    state.keyword = e.target.value;
    if (state.tab === 'orders') renderOrders();
  });

  document.body.addEventListener('input', e => {
    if (e.target.id === 'productSearchInput') {
      state.productKeyword = e.target.value;
      renderProductsAdmin();
    }
  });

  document.body.addEventListener('click', e => {
    const tab = e.target.dataset.tab;
    if (tab) {
      switchTab(tab);
      return;
    }

    if (e.target.id === 'saveProductBtn') {
      saveProduct();
      return;
    }

    if (e.target.id === 'cancelEditProductBtn') {
      cancelEditProduct();
      return;
    }

    const editProductId = e.target.dataset.editProduct;
    if (editProductId) {
      editProduct(editProductId);
      return;
    }

    const visibleProductId = e.target.dataset.toggleVisible;
    if (visibleProductId) {
      toggleProductField(
        visibleProductId,
        'is_visible',
        e.target.dataset.visible === 'true'
      );
      return;
    }

    const featuredProductId = e.target.dataset.toggleFeatured;
    if (featuredProductId) {
      toggleProductField(
        featuredProductId,
        'is_featured',
        e.target.dataset.featured === 'true'
      );
      return;
    }

    if (e.target.id === 'createAmbBtn') {
      createAmbassador();
      return;
    }

    const ambassadorCode = e.target.dataset.ambassador;
    if (ambassadorCode) {
      updateAmbassadorStatus(
        ambassadorCode,
        e.target.dataset.active === 'true'
      );
      return;
    }

    const nav = e.target.dataset.status;

    if (nav && e.target.classList.contains('nav')) {
      state.status = nav;

      document.querySelectorAll('.nav').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === nav);
      });

      renderOrders();
      return;
    }

    const orderId = e.target.dataset.order;
    const status = e.target.dataset.status;

    if (orderId && status) {
      updateStatus(orderId, status);
    }
  });
}

bindEvents();

if (state.token) {
  showAdmin();
} else {
  showLogin();
}
