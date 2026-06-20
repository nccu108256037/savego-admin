const API_URL = 'https://script.google.com/macros/s/AKfycbyGU4MGrSzz6IYmXwstQ1xhBJTKtAzbczNP6AEzgwYA2BaN2iQ_2-s0b-dPabo86YAH/exec';

const state = {
  token: localStorage.getItem('shd_admin_token') || '',
  user: JSON.parse(localStorage.getItem('shd_admin_user') || 'null'),
  orders: [],
  ambassadors: [],
  referralSummary: [],
  status: '全部',
  keyword: '',
  tab: 'orders'
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

function ensureAdminTabs() {
  if ($('adminTabs')) return;

  const tabHtml = document.createElement('div');
  tabHtml.id = 'adminTabs';
  tabHtml.className = 'admin-tabs';

  tabHtml.innerHTML = `
    <button class="admin-tab active" data-tab="orders">訂單管理</button>
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

  if (tab === 'ambassadors') {
    setOrderToolsVisible(false);
    loadAmbassadors();
  }

  if (tab === 'summary') {
    setOrderToolsVisible(false);
    loadReferralSummary();
  }
}

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

      <p style="color:#82736a;font-size:14px;">
        新增後會自動建立 share 編號，並自動產生英文推薦碼，例如 XR52、XF31、AM84。
      </p>
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

  if (!name) {
    toast('請輸入分享家姓名');
    return;
  }

  if (!phone) {
    toast('請輸入電話');
    return;
  }

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

function logout() {
  localStorage.removeItem('shd_admin_token');
  localStorage.removeItem('shd_admin_user');
  state.token = '';
  state.user = null;
  showLogin();
}

function bindEvents() {
  $('loginBtn').addEventListener('click', login);

  $('password').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });

  $('refreshBtn').addEventListener('click', () => {
    if (state.tab === 'orders') loadOrders();
    if (state.tab === 'ambassadors') loadAmbassadors();
    if (state.tab === 'summary') loadReferralSummary();
  });

  $('logoutBtn').addEventListener('click', logout);

  $('searchInput').addEventListener('input', e => {
    state.keyword = e.target.value;
    if (state.tab === 'orders') renderOrders();
  });

  document.body.addEventListener('click', e => {
    const tab = e.target.dataset.tab;
    if (tab) {
      switchTab(tab);
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
