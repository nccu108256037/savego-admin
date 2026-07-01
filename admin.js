/* ======================================================
   ASTREA Admin v2 - 省好多後台先行版
====================================================== */

const config = window.ASTREA_ADMIN_CONFIG || {};

const SUPABASE_URL = config.SUPABASE_URL;
const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;

const state = {
  page: "dashboard",
  products: [],
  orders: [],
  customers: [],
  referrers: [],
  keyword: "",
  editingProductId: null
};

const $ = (id) => document.getElementById(id);

const pageTitles = {
  dashboard: "儀表板",
  orders: "訂單管理",
  products: "商品管理",
  quickAdd: "快速上架",
  customers: "客戶管理",
  referrers: "分享家",
  codes: "推薦碼",
  rewards: "回饋金",
  delivery: "配送管理",
  reports: "報表分析",
  settings: "系統設定"
};

function money(n) {
  return `$${Number(n || 0).toLocaleString("zh-TW")}`;
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 1800);
}

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("尚未設定 Supabase 連線資料");
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || "Supabase 操作失敗");
  }

  return text ? JSON.parse(text) : null;
}

/* ======================================================
   Init
====================================================== */

function init() {
  bindEvents();
  renderPage("dashboard");
}

function bindEvents() {
  document.body.addEventListener("click", async (e) => {
    const page = e.target.dataset.page;
    if (page) {
      renderPage(page);
      document.body.classList.remove("sidebar-open");
      return;
    }

    if (e.target.id === "menuBtn") {
      document.body.classList.toggle("sidebar-open");
      return;
    }

    if (e.target.id === "refreshBtn") {
      renderPage(state.page);
      return;
    }

    if (e.target.id === "saveQuickProductBtn") {
      saveQuickProduct();
      return;
    }

    const editId = e.target.dataset.editProduct;
    if (editId) {
      state.editingProductId = editId;
      renderProductForm();
      return;
    }

    const toggleVisible = e.target.dataset.toggleVisible;
    if (toggleVisible) {
      updateProductField(toggleVisible, "is_visible", e.target.dataset.value === "true");
      return;
    }

    const toggleFeatured = e.target.dataset.toggleFeatured;
    if (toggleFeatured) {
      updateProductField(toggleFeatured, "is_featured", e.target.dataset.value === "true");
      return;
    }

    if (e.target.id === "saveProductBtn") {
      saveProduct();
      return;
    }

    if (e.target.id === "cancelProductBtn") {
      state.editingProductId = null;
      renderProducts();
      return;
    }
  });

  document.body.addEventListener("change", (e) => {
    if (e.target.id === "quickProductImage") {
      previewImage(e.target, "quickPreview");
    }

    if (e.target.id === "productImageFile") {
      previewImage(e.target, "productPreview");
    }
  });

  document.body.addEventListener("input", (e) => {
    if (e.target.id === "productSearch") {
      state.keyword = e.target.value;
      renderProductsList();
    }
  });
}

/* ======================================================
   Page Router
====================================================== */

function setActiveNav(page) {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
}

function renderPage(page) {
  state.page = page;
  setActiveNav(page);
  $("pageTitle").textContent = pageTitles[page] || "後台";
  $("pageContent").innerHTML = `<div class="loading">載入中...</div>`;

  if (page === "dashboard") renderDashboard();
  else if (page === "products") renderProducts();
  else if (page === "quickAdd") renderQuickAdd();
  else if (page === "orders") renderOrders();
  else if (page === "customers") renderCustomers();
  else if (page === "referrers") renderReferrers();
  else renderComingSoon(page);
}

/* ======================================================
   Dashboard
====================================================== */

async function renderDashboard() {
  await Promise.allSettled([
    loadProducts(),
    loadOrders(),
    loadCustomers(),
    loadReferrers()
  ]);

  const today = new Date().toISOString().slice(0, 10);

  const todayOrders = state.orders.filter(o =>
    String(o.created_at || "").slice(0, 10) === today
  );

  const todaySales = todayOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const pendingOrders = state.orders.filter(o =>
    !["已完成", "已取消"].includes(o.status)
  ).length;

  const visibleProducts = state.products.filter(p => p.is_visible).length;

  $("pageContent").innerHTML = `
    <div class="grid grid-4">
      <div class="card stat-card">
        <div class="stat-label">今日訂單</div>
        <div class="stat-value">${todayOrders.length}</div>
        <div class="stat-hint">今天新增訂單數</div>
      </div>

      <div class="card stat-card">
        <div class="stat-label">今日營收</div>
        <div class="stat-value">${money(todaySales)}</div>
        <div class="stat-hint">已建立訂單總額</div>
      </div>

      <div class="card stat-card">
        <div class="stat-label">待處理</div>
        <div class="stat-value">${pendingOrders}</div>
        <div class="stat-hint">尚未完成或取消</div>
      </div>

      <div class="card stat-card">
        <div class="stat-label">上架商品</div>
        <div class="stat-value">${visibleProducts}</div>
        <div class="stat-hint">目前商城可見商品</div>
      </div>
    </div>

    <div class="grid grid-2 mt-3">
      <div class="card card-lg">
        <h2 class="card-title">最近訂單</h2>
        <p class="card-subtitle">最新 5 筆訂單</p>
        ${recentOrdersHtml()}
      </div>

      <div class="card card-lg">
        <h2 class="card-title">快速操作</h2>
        <p class="card-subtitle">手機與電腦都能快速處理</p>
        <div class="btn-row">
          <button class="btn btn-primary" data-page="quickAdd">⚡ 快速上架</button>
          <button class="btn btn-secondary" data-page="products">🛒 商品管理</button>
          <button class="btn btn-secondary" data-page="orders">📦 訂單管理</button>
          <button class="btn btn-secondary" data-page="referrers">🤝 分享家</button>
        </div>
      </div>
    </div>
  `;
}

function recentOrdersHtml() {
  const rows = state.orders.slice(0, 5);

  if (!rows.length) {
    return `<div class="empty-state">目前還沒有訂單資料</div>`;
  }

  return `
    <div class="product-list">
      ${rows.map(o => `
        <div class="order-card">
          <div class="order-no">${o.order_no || "-"}</div>
          <div class="order-customer">${o.customer_name || "-"}</div>
          <div class="order-info">${o.customer_phone || ""}｜${o.status || "已下訂"}</div>
          <div class="order-total">${money(o.total_amount || 0)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

/* ======================================================
   Products
====================================================== */

async function loadProducts() {
  const rows = await supabaseRequest("products?select=*&order=sort.asc,name.asc");
  state.products = rows || [];
}

async function renderProducts() {
  try {
    await loadProducts();

    $("pageContent").innerHTML = `
      <div class="card card-lg mb-3">
        <div class="btn-row" style="justify-content:space-between;">
          <div>
            <h2 class="card-title">商品管理</h2>
            <p class="card-subtitle">新增、修改、上架、下架、熱門商品</p>
          </div>
          <button class="btn btn-primary" data-page="quickAdd">＋ 快速上架</button>
        </div>

        <div class="field mt-2">
          <input id="productSearch" placeholder="搜尋商品名稱、分類、條碼、標籤..." />
        </div>
      </div>

      <div id="productsList"></div>
    `;

    renderProductsList();
  } catch (err) {
    $("pageContent").innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

function renderProductsList() {
  const kw = (state.keyword || "").toLowerCase();

  const list = state.products.filter(p => {
    const text = [
      p.id,
      p.name,
      p.category,
      p.tags,
      p.barcode
    ].join(" ").toLowerCase();

    return !kw || text.includes(kw);
  });

  $("productsList").innerHTML = `
    <div class="product-list">
      ${
        list.length
          ? list.map(productCardHtml).join("")
          : `<div class="empty-state">目前沒有符合條件的商品</div>`
      }
    </div>
  `;
}

function productCardHtml(p) {
  return `
    <div class="product-card">
      <img class="product-img" src="${p.image || "https://placehold.co/300x300/fff1e7/f47c20?text=SHD"}" />

      <div>
        <div class="product-name">${p.name || "-"}</div>
        <div class="product-meta">
          <span>${p.category || "其他"}</span>
          <span>庫存 ${p.stock ?? 0}</span>
          <span>${p.unit || ""}</span>
          ${p.is_visible ? `<span class="badge badge-success">上架</span>` : `<span class="badge badge-muted">下架</span>`}
          ${p.is_featured ? `<span class="badge badge-primary">熱門</span>` : ""}
        </div>

        <div class="btn-row mt-2">
          <button class="btn btn-secondary" data-edit-product="${p.id}">編輯</button>
          <button class="btn btn-soft" data-toggle-visible="${p.id}" data-value="${!p.is_visible}">
            ${p.is_visible ? "下架" : "上架"}
          </button>
          <button class="btn btn-info" data-toggle-featured="${p.id}" data-value="${!p.is_featured}">
            ${p.is_featured ? "取消熱門" : "設熱門"}
          </button>
        </div>
      </div>

      <div class="product-price">${money(p.price)}</div>
    </div>
  `;
}

function renderProductForm() {
  const p = state.products.find(x => x.id === state.editingProductId);
  if (!p) return toast("找不到商品");

  $("pageContent").innerHTML = productFormHtml(p);
}

function productFormHtml(p = {}) {
  return `
    <div class="card card-lg">
      <h2 class="card-title">編輯商品</h2>
      <p class="card-subtitle">修改後會直接更新 Supabase 商品資料</p>

      <div class="form-grid form-grid-2">
        <div class="upload-box">
          <div id="productPreview" class="upload-preview">
            ${p.image ? `<img src="${p.image}">` : "尚未選擇圖片"}
          </div>

          <input id="productImageFile" class="file-input" type="file" accept="image/*" />

          <button class="btn btn-secondary full-width" onclick="document.getElementById('productImageFile').click()">
            選擇圖片 / 拍照
          </button>

          <p class="help">手機可選擇拍照或從相簿選擇。</p>
        </div>

        <div class="form-grid">
          <div class="field">
            <label>商品編號</label>
            <input id="productId" value="${p.id || ""}" disabled />
          </div>

          <div class="field">
            <label>商品名稱</label>
            <input id="productName" value="${p.name || ""}" />
          </div>

          <div class="field">
            <label>分類</label>
            <input id="productCategory" value="${p.category || ""}" />
          </div>

          <div class="form-grid form-grid-2">
            <div class="field">
              <label>售價</label>
              <input id="productPrice" type="number" value="${p.price || 0}" />
            </div>

            <div class="field">
              <label>成本</label>
              <input id="productCost" type="number" value="${p.cost || 0}" />
            </div>
          </div>

          <div class="form-grid form-grid-2">
            <div class="field">
              <label>庫存</label>
              <input id="productStock" type="number" value="${p.stock ?? 999}" />
            </div>

            <div class="field">
              <label>排序</label>
              <input id="productSort" type="number" value="${p.sort ?? 9999}" />
            </div>
          </div>

          <div class="field">
            <label>圖片網址</label>
            <input id="productImage" value="${p.image || ""}" />
          </div>

          <div class="field">
            <label>條碼</label>
            <input id="productBarcode" value="${p.barcode || ""}" />
          </div>

          <div class="field">
            <label>單位</label>
            <input id="productUnit" value="${p.unit || ""}" />
          </div>

          <div class="field">
            <label>標籤</label>
            <input id="productTags" value="${p.tags || ""}" />
          </div>

          <div class="field">
            <label>商品描述</label>
            <textarea id="productDescription">${p.description || ""}</textarea>
          </div>

          <div class="btn-row">
            <label class="switch-row">
              <input id="productFeatured" type="checkbox" ${p.is_featured ? "checked" : ""} />
              熱門商品
            </label>

            <label class="switch-row">
              <input id="productVisible" type="checkbox" ${p.is_visible ? "checked" : ""} />
              上架顯示
            </label>
          </div>

          <div class="btn-row">
            <button id="saveProductBtn" class="btn btn-primary">儲存商品</button>
            <button id="cancelProductBtn" class="btn btn-secondary">取消</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ======================================================
   Quick Add Product
====================================================== */

function renderQuickAdd() {
  $("pageContent").innerHTML = `
    <div class="card card-lg">
      <h2 class="card-title">快速上架商品</h2>
      <p class="card-subtitle">適合手機操作，可拍照或從相簿選擇圖片。</p>

      <div class="form-grid form-grid-2">
        <div class="upload-box">
          <div id="quickPreview" class="upload-preview">
            選擇商品圖片
          </div>

          <input id="quickProductImage" class="file-input" type="file" accept="image/*" />

          <button class="btn btn-secondary full-width" onclick="document.getElementById('quickProductImage').click()">
            選擇圖片 / 拍照
          </button>

          <p class="help">不加 capture，手機會自己跳出拍照或相簿選項。</p>
        </div>

        <div class="form-grid">
          <div class="field">
            <label>商品名稱</label>
            <input id="quickName" placeholder="例如 700ml 飲料杯" />
          </div>

          <div class="field">
            <label>售價</label>
            <input id="quickPrice" type="number" placeholder="例如 25" />
          </div>

          <div class="field">
            <label>分類</label>
            <input id="quickCategory" placeholder="例如 餐飲耗材" />
          </div>

          <div class="field">
            <label>庫存</label>
            <input id="quickStock" type="number" value="999" />
          </div>

          <div class="field">
            <label>單位</label>
            <input id="quickUnit" placeholder="例如 包、箱、組" />
          </div>

          <div class="field">
            <label>標籤</label>
            <input id="quickTags" placeholder="例如 熱賣,飲料杯" />
          </div>

          <div class="btn-row">
            <label class="switch-row">
              <input id="quickFeatured" type="checkbox" />
              設為熱門
            </label>

            <label class="switch-row">
              <input id="quickVisible" type="checkbox" checked />
              直接上架
            </label>
          </div>

          <button id="saveQuickProductBtn" class="btn btn-primary full-width">
            儲存並上架商品
          </button>
        </div>
      </div>
    </div>
  `;
}

async function saveQuickProduct() {
  try {
    const name = $("quickName").value.trim();
    const price = Number($("quickPrice").value || 0);

    if (!name) return toast("請輸入商品名稱");
    if (!price) return toast("請輸入售價");

    const imageFile = $("quickProductImage").files[0];
    let image = "";

    if (imageFile) {
      toast("圖片上傳中...");
      image = await uploadProductImage(imageFile);
    }

    const product = {
      id: "p" + Date.now(),
      name,
      category: $("quickCategory").value.trim() || "其他",
      price,
      cost: 0,
      stock: Number($("quickStock").value || 999),
      image,
      tags: $("quickTags").value.trim(),
      description: "",
      barcode: "",
      unit: $("quickUnit").value.trim(),
      is_featured: $("quickFeatured").checked,
      is_visible: $("quickVisible").checked,
      sort: 9999,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await supabaseRequest("products", {
      method: "POST",
      body: JSON.stringify(product)
    });

    toast("商品已新增");
    renderPage("products");
  } catch (err) {
    toast(err.message);
  }
}

/* ======================================================
   Upload
====================================================== */

function previewImage(input, previewId) {
  const file = input.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  $(previewId).innerHTML = `<img src="${url}">`;
}

async function uploadProductImage(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const filename = `product-${Date.now()}.${ext}`;
  const path = `products/${filename}`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": file.type || "image/jpeg",
      "x-upsert": "true"
    },
    body: file
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || "圖片上傳失敗，請確認 Supabase Storage bucket：product-images 已建立且可公開讀取");
  }

  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

/* ======================================================
   Save / Update Product
====================================================== */

async function saveProduct() {
  try {
    const id = $("productId").value;

    let image = $("productImage").value.trim();
    const file = $("productImageFile").files[0];

    if (file) {
      toast("圖片上傳中...");
      image = await uploadProductImage(file);
    }

    const product = {
      name: $("productName").value.trim(),
      category: $("productCategory").value.trim() || "其他",
      price: Number($("productPrice").value || 0),
      cost: Number($("productCost").value || 0),
      stock: Number($("productStock").value || 999),
      sort: Number($("productSort").value || 9999),
      image,
      barcode: $("productBarcode").value.trim(),
      unit: $("productUnit").value.trim(),
      tags: $("productTags").value.trim(),
      description: $("productDescription").value.trim(),
      is_featured: $("productFeatured").checked,
      is_visible: $("productVisible").checked,
      updated_at: new Date().toISOString()
    };

    if (!product.name) return toast("請輸入商品名稱");
    if (!product.price) return toast("請輸入售價");

    await supabaseRequest(`products?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(product)
    });

    toast("商品已更新");
    state.editingProductId = null;
    renderPage("products");
  } catch (err) {
    toast(err.message);
  }
}

async function updateProductField(id, field, value) {
  try {
    await supabaseRequest(`products?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        [field]: value,
        updated_at: new Date().toISOString()
      })
    });

    toast("商品已更新");
    renderPage("products");
  } catch (err) {
    toast(err.message);
  }
}

/* ======================================================
   Orders
====================================================== */

async function loadOrders() {
  try {
    const rows = await supabaseRequest("orders?select=*&order=created_at.desc");
    state.orders = rows || [];
  } catch {
    state.orders = [];
  }
}

async function renderOrders() {
  await loadOrders();

  const statuses = ["已下訂", "待聯繫", "撿貨中", "配送中", "已完成"];

  $("pageContent").innerHTML = `
    <div class="kanban">
      ${statuses.map(status => `
        <div class="kanban-column">
          <div class="kanban-title">
            <span>${status}</span>
            <span class="badge badge-muted">${state.orders.filter(o => o.status === status).length}</span>
          </div>

          ${
            state.orders.filter(o => o.status === status).map(o => `
              <div class="order-card">
                <div class="order-no">${o.order_no || "-"}</div>
                <div class="order-customer">${o.customer_name || "-"}</div>
                <div class="order-info">${o.customer_phone || ""}</div>
                <div class="order-info">${o.customer_address || ""}</div>
                <div class="order-total">${money(o.total_amount || 0)}</div>
              </div>
            `).join("") || `<div class="empty-state">無訂單</div>`
          }
        </div>
      `).join("")}
    </div>
  `;
}

/* ======================================================
   Customers / Referrers
====================================================== */

async function loadCustomers() {
  try {
    const rows = await supabaseRequest("customers?select=*&order=created_at.desc");
    state.customers = rows || [];
  } catch {
    state.customers = [];
  }
}

async function renderCustomers() {
  await loadCustomers();

  $("pageContent").innerHTML = `
    <div class="card card-lg">
      <h2 class="card-title">客戶管理</h2>
      <p class="card-subtitle">目前先讀取 Supabase customers 資料</p>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>電話</th>
              <th>地址</th>
              <th>LINE</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            ${
              state.customers.length
                ? state.customers.map(c => `
                  <tr>
                    <td><strong>${c.name || "-"}</strong></td>
                    <td>${c.phone || "-"}</td>
                    <td>${c.address || "-"}</td>
                    <td>${c.line_name || "-"}</td>
                    <td>${String(c.created_at || "").slice(0, 10)}</td>
                  </tr>
                `).join("")
                : `<tr><td colspan="5">尚無客戶資料</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadReferrers() {
  try {
    const rows = await supabaseRequest("referrers?select=*&order=created_at.desc");
    state.referrers = rows || [];
  } catch {
    state.referrers = [];
  }
}

async function renderReferrers() {
  await loadReferrers();

  $("pageContent").innerHTML = `
    <div class="card card-lg">
      <h2 class="card-title">分享家管理</h2>
      <p class="card-subtitle">推薦碼、成交、回饋金會從這裡管理</p>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>代碼</th>
              <th>姓名</th>
              <th>電話</th>
              <th>回饋比例</th>
              <th>總成交</th>
              <th>未結算</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            ${
              state.referrers.length
                ? state.referrers.map(r => `
                  <tr>
                    <td><strong>${r.code || "-"}</strong></td>
                    <td>${r.name || "-"}</td>
                    <td>${r.phone || "-"}</td>
                    <td>${Number(r.reward_rate || 0) * 100}%</td>
                    <td>${money(r.total_sales || 0)}</td>
                    <td>${money(r.unsettled_reward || 0)}</td>
                    <td>${r.active ? `<span class="badge badge-success">啟用</span>` : `<span class="badge badge-muted">停用</span>`}</td>
                  </tr>
                `).join("")
                : `<tr><td colspan="7">尚無分享家資料</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ======================================================
   Coming Soon
====================================================== */

function renderComingSoon(page) {
  $("pageContent").innerHTML = `
    <div class="empty-state">
      <h2>${pageTitles[page] || "功能"} 建置中</h2>
      <p>這個模組下一階段接上 Supabase 資料。</p>
    </div>
  `;
}

init();
