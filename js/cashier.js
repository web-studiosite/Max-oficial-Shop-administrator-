/* ============================================
   CASHIER MODULE - POS (Point of Sale)
   Official Shop Administration ERP
   ============================================ */

let cart = [];
let posProducts = [];
let posCategories = [];
let currentPosCategory = 'all';
let openRegister = null;

// ── Initialize POS ─────────────────────────
async function initPOS() {
  const user = requireCashier();
  if (!user) return;

  renderPOSUser(user);
  await loadOpenRegister();
  await loadPOSProducts();
  await loadPOSCategories();
  renderPOSCart();
}

function renderPOSUser(user) {
  const container = document.getElementById('pos-user-info');
  if (!container) return;
  const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) : 'U';
  container.innerHTML = `
    <div class="pos-user-avatar">${initials}</div>
    <span>${user.name || user.email}</span>
  `;
}

// ── Cash Register Check ────────────────────
async function loadOpenRegister() {
  try {
    openRegister = await getOpenRegister();
    const statusEl = document.getElementById('cashier-status');
    const registerInfo = document.getElementById('register-info');

    if (!openRegister) {
      if (statusEl) {
        statusEl.innerHTML = '<span class="cash-status closed">Caixa Fechado</span>';
      }
      if (registerInfo) registerInfo.innerHTML = '';
      showToast('warning', 'Caixa est\u00e1 fechado. Abra o caixa primeiro.');
      openCashOpenModal();
    } else {
      if (statusEl) {
        statusEl.innerHTML = `<span class="cash-status open">Caixa Aberto</span>`;
      }
      if (registerInfo) {
        registerInfo.innerHTML = `
          <span style="font-size:12px;color:var(--pos-text-secondary);">
            Abertura: ${formatMoney(openRegister.opening_balance)} |
            Vendas: ${formatMoney(openRegister.total_sales || 0)}
          </span>
        `;
      }
    }
  } catch (e) {
    showToast('error', 'Erro ao verificar caixa');
  }
}

// ── Open Cash Register ─────────────────────
function openCashOpenModal() {
  document.getElementById('cash-open-amount').value = '';
  document.getElementById('cash-open-modal').classList.add('active');
}

function closeCashOpenModal() {
  document.getElementById('cash-open-modal').classList.remove('active');
}

async function confirmOpenCash() {
  try {
    const amount = parseFloat(document.getElementById('cash-open-amount').value);
    const user = getStoredUser();
    validatePositiveNumber(amount, 'Valor de abertura');

    await openCashRegister(amount, user.id);
    showToast('success', 'Caixa aberto com sucesso');
    closeCashOpenModal();
    await loadOpenRegister();
  } catch (e) {
    showToast('error', e.message);
  }
}

// ── Close Cash Register ────────────────────
function openCashCloseModal() {
  if (!openRegister) {
    showToast('error', 'Caixa n\u00e3o est\u00e1 aberto');
    return;
  }
  const expected = (openRegister.opening_balance || 0) + (openRegister.total_sales || 0) - (openRegister.total_expenses || 0);
  document.getElementById('cash-close-expected').textContent = formatMoney(expected);
  document.getElementById('cash-close-amount').value = '';
  document.getElementById('cash-close-modal').classList.add('active');
}

function closeCashCloseModal() {
  document.getElementById('cash-close-modal').classList.remove('active');
}

async function confirmCloseCash() {
  try {
    const amount = parseFloat(document.getElementById('cash-close-amount').value);
    const user = getStoredUser();
    validatePositiveNumber(amount, 'Valor de fecho');

    await closeCashRegister(openRegister.id, amount, user.id);
    showToast('success', 'Caixa fechado com sucesso');
    closeCashCloseModal();
    openRegister = null;
    await loadOpenRegister();
  } catch (e) {
    showToast('error', e.message);
  }
}

// ── Load Products ──────────────────────────
async function loadPOSProducts() {
  try {
    const { data } = await getSupabase()
      .from('stock')
      .select('*, products(id, name, sale_price, unit_type, category_id)')
      .gt('store_qty', 0)
      .order('created_at', { ascending: false });

    posProducts = data || [];
    renderPOSProducts();
  } catch (e) {
    showToast('error', 'Erro ao carregar produtos');
  }
}

async function loadPOSCategories() {
  try {
    const { data } = await getSupabase().from('categories').select('*').order('name');
    posCategories = data || [];
    renderPOSCategories();
  } catch (e) {
    console.error('Erro categorias:', e);
  }
}

function renderPOSCategories() {
  const container = document.getElementById('pos-categories');
  if (!container) return;

  let html = `<button class="pos-cat-btn ${currentPosCategory === 'all' ? 'active' : ''}" onclick="filterPOSCategory('all')">Tudo</button>`;
  posCategories.forEach(cat => {
    html += `<button class="pos-cat-btn ${currentPosCategory === cat.id ? 'active' : ''}" onclick="filterPOSCategory('${cat.id}')">${cat.name}</button>`;
  });
  container.innerHTML = html;
}

function filterPOSCategory(catId) {
  currentPosCategory = catId;
  renderPOSCategories();
  renderPOSProducts();
}

function renderPOSProducts() {
  const container = document.getElementById('pos-product-grid');
  if (!container) return;

  const search = (document.getElementById('pos-search')?.value || '').toLowerCase();

  const filtered = posProducts.filter(p => {
    const matchSearch = (p.products?.name || '').toLowerCase().includes(search);
    const matchCat = currentPosCategory === 'all' ? true : p.products?.category_id === currentPosCategory;
    return matchSearch && matchCat;
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="pos-cart-empty" style="grid-column:1/-1;">
        <div class="empty-icon">\u1F4E6</div>
        <h3>Sem produtos</h3>
        <p>Nenhum produto encontrado.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(p => {
    const stock = p.store_qty || 0;
    return `
      <div class="pos-product-card ${stock <= 0 ? 'out-of-stock' : ''}" onclick="addToCart('${p.product_id}', '${(p.products?.name || '').replace(/'/g, "\\'")}', ${p.products?.sale_price || 0}, ${stock}, '${p.products?.unit_type || 'unit'}')">
        <div class="prod-icon">\u1F4E6</div>
        <div class="prod-name">${p.products?.name || '?'}</div>
        <div class="prod-price">${formatMoney(p.products?.sale_price || 0)}</div>
        <div class="prod-stock">Stock: ${stock}</div>
      </div>
    `;
  }).join('');
}

// ── Cart Operations ────────────────────────
function addToCart(productId, name, price, stock, unitType) {
  if (!openRegister) {
    showToast('error', 'Abra o caixa primeiro');
    return;
  }

  const existing = cart.find(item => item.product_id === productId);
  if (existing) {
    if (existing.quantity >= stock) {
      showToast('warning', 'Stock insuficiente');
      return;
    }
    existing.quantity++;
    existing.total = existing.quantity * existing.price;
  } else {
    cart.push({ product_id: productId, name, price, quantity: 1, total: price, stock, unit_type: unitType, location: 'store' });
  }

  renderPOSCart();
  showToast('success', `${name} adicionado`);
}

function updateCartQty(productId, delta) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;

  const newQty = item.quantity + delta;
  if (newQty <= 0) {
    cart = cart.filter(i => i.product_id !== productId);
  } else if (newQty > item.stock) {
    showToast('warning', 'Stock insuficiente');
    return;
  } else {
    item.quantity = newQty;
    item.total = item.quantity * item.price;
  }

  renderPOSCart();
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.product_id !== productId);
  renderPOSCart();
}

function clearCart() {
  cart = [];
  renderPOSCart();
}

function renderPOSCart() {
  const container = document.getElementById('pos-cart-items');
  const countEl = document.getElementById('cart-count');
  if (countEl) countEl.textContent = cart.reduce((s, i) => s + i.quantity, 0);

  if (!container) return;

  if (!cart.length) {
    container.innerHTML = `
      <div class="pos-cart-empty">
        <div class="empty-icon">\u1F6D2</div>
        <h3>Carrinho vazio</h3>
        <p>Selecione produtos para iniciar</p>
      </div>
    `;
    renderCartTotals();
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="pos-cart-item">
      <div class="pos-cart-item-info">
        <div class="pos-cart-item-name">${item.name}</div>
        <div class="pos-cart-item-price">${formatMoney(item.price)} / ${item.unit_type}</div>
      </div>
      <div class="pos-cart-item-actions">
        <button class="pos-qty-btn" onclick="updateCartQty('${item.product_id}', -1)">-</button>
        <span class="pos-qty-value">${item.quantity}</span>
        <button class="pos-qty-btn" onclick="updateCartQty('${item.product_id}', 1)">+</button>
      </div>
      <div class="pos-cart-item-total">${formatMoney(item.total)}</div>
      <button class="pos-remove-item" onclick="removeFromCart('${item.product_id}')">&times;</button>
    </div>
  `).join('');

  renderCartTotals();
}

function renderCartTotals() {
  const subtotal = cart.reduce((s, i) => s + i.total, 0);

  const subtotalEl = document.getElementById('cart-subtotal');
  const totalEl = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('checkout-btn');

  if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
  if (totalEl) totalEl.textContent = formatMoney(subtotal);
  if (checkoutBtn) checkoutBtn.disabled = cart.length === 0;
}

// ── Checkout ───────────────────────────────
function openCheckout() {
  if (!cart.length) return;
  if (!openRegister) {
    showToast('error', 'Caixa fechado');
    return;
  }

  const total = cart.reduce((s, i) => s + i.total, 0);
  document.getElementById('checkout-total').textContent = formatMoney(total);
  document.getElementById('checkout-modal').classList.add('active');
}

function closeCheckout() {
  document.getElementById('checkout-modal').classList.remove('active');
}

async function confirmCheckout() {
  try {
    if (!cart.length) return;

    const user = getStoredUser();
    const results = await executeSale(cart, user.id);

    // Update register total_sales
    const totalSale = results.reduce((s, r) => s + r.totalPrice, 0);
    const newTotal = (openRegister.total_sales || 0) + totalSale;
    await getSupabase().from('cash_register').update({ total_sales: newTotal }).eq('id', openRegister.id);

    // Generate receipt
    generateReceipt(results, totalSale);

    showToast('success', `Venda finalizada! Total: ${formatMoney(totalSale)}`);
    cart = [];
    renderPOSCart();
    closeCheckout();
    await loadOpenRegister();
    await loadPOSProducts();
  } catch (e) {
    showToast('error', e.message);
  }
}

// ── Receipt ────────────────────────────────
function generateReceipt(results, total) {
  const container = document.getElementById('receipt-content');
  if (!container) return;

  const now = new Date();
  let html = `
    <div class="pos-receipt">
      <div class="pos-receipt-header">
        <div class="pos-receipt-title">OFFICIAL SHOP</div>
        <div>Comprovativo de Venda</div>
        <div>${now.toLocaleDateString('pt-MZ')} ${now.toLocaleTimeString('pt-MZ')}</div>
        <div>Operador: ${getStoredUser()?.name || '-'}</div>
      </div>
  `;

  results.forEach(r => {
    html += `
      <div class="pos-receipt-item">
        <span>${r.product.name} x${r.sale.quantity}</span>
        <span>${formatMoney(r.totalPrice)}</span>
      </div>
    `;
  });

  html += `
      <div class="pos-receipt-total">
        <span>TOTAL</span>
        <span>${formatMoney(total)}</span>
      </div>
      <div style="text-align:center;margin-top:16px;font-size:11px;color:#666;">
        Obrigado pela prefer\u00eancia!<br>
        OFFICIAL SHOP ADMINISTRATION
      </div>
    </div>
  `;

  container.innerHTML = html;
  document.getElementById('receipt-modal').classList.add('active');
}

function closeReceipt() {
  document.getElementById('receipt-modal').classList.remove('active');
}

function printReceipt() {
  const content = document.getElementById('receipt-content').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Recibo</title></head><body>${content}</body></html>`);
  win.document.close();
  win.print();
}

// ── POS Toast ──────────────────────────────
function showToast(type, message) {
  let container = document.querySelector('.pos-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'pos-toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '\u2713', error: '\u2717', warning: '\u26A0' };
  const toast = document.createElement('div');
  toast.className = `pos-toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || '\u2022'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Export ─────────────────────────────────
window.initPOS = initPOS;
window.loadOpenRegister = loadOpenRegister;
window.openCashOpenModal = openCashOpenModal;
window.closeCashOpenModal = closeCashOpenModal;
window.confirmOpenCash = confirmOpenCash;
window.openCashCloseModal = openCashCloseModal;
window.closeCashCloseModal = closeCashCloseModal;
window.confirmCloseCash = confirmCloseCash;
window.loadPOSProducts = loadPOSProducts;
window.loadPOSCategories = loadPOSCategories;
window.renderPOSCategories = renderPOSCategories;
window.filterPOSCategory = filterPOSCategory;
window.renderPOSProducts = renderPOSProducts;
window.addToCart = addToCart;
window.updateCartQty = updateCartQty;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.renderPOSCart = renderPOSCart;
window.openCheckout = openCheckout;
window.closeCheckout = closeCheckout;
window.confirmCheckout = confirmCheckout;
window.generateReceipt = generateReceipt;
window.closeReceipt = closeReceipt;
window.printReceipt = printReceipt;
