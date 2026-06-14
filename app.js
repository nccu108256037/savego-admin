const API_URL = '請貼上你的 Apps Script Web App URL';

const state = {
  token: localStorage.getItem('shd_admin_token') || '',
  user: JSON.parse(localStorage.getItem('shd_admin_user') || 'null'),
  orders: [],
  status: '全部',
  keyword: ''
};

const $ = (id) => document.getElementById(id);
const money = (n) => `$${Number(n || 0).toLocaleString('zh-TW')}`;

function toast(message) {
  const el = $('toast');
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
    $('userInfo').textContent = `${state.user.name || state.user.username}，即時查看與處理顧客訂單`;
  }

  loadOrders();
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
  $('statNew').textContent = state.orders.filter(o => o.status === '已下訂').length;
  $('statContact').textContent = state.orders.filter(o => o.status === '已聯繫客服').length;
  $('statDelivery').textContent = state.orders.filter(o => o.status === '配送中').length;
  $('statDone').textContent = state.orders.filter(o => o.status === '已完成').length;
}

function getFilteredOrders() {
  const kw = state.keyword.toLowerCase();

  return state.orders.filter(order => {
    const matchStatus = state.status === '全部' || order.status === state.status;

    const text = [
      order.orderId,
      order.name,
      order.phone,
      order.address,
      order.lineName
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

  const statuses = ['已下訂', '已聯繫客服', '配送中', '已完成'];

  const buttons = statuses.map(status => `
    <button
      class="${order.status === status ? 'active' : ''}"
      data-order="${order.orderId}"
      data-status="${status}"
    >
      ${status}
    </button>
  `).join('');

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
        <strong>${money(order.total)}</strong>
      </div>

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

  $('refreshBtn').addEventListener('click', loadOrders);
  $('logoutBtn').addEventListener('click', logout);

  $('searchInput').addEventListener('input', e => {
    state.keyword = e.target.value;
    renderOrders();
  });

  document.body.addEventListener('click', e => {
    const nav = e.target.dataset.status;

    if (nav && e.target.classList.contains('nav')) {
      state.status = nav;

      document.querySelectorAll('.nav').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === nav);
      });

      renderOrders();
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
