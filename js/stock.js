/* ============================================
   STOCK MODULE - Official Shop Administration ERP
   ============================================ */

let stockList = [];
let stockProducts = [];

// ── Load Stock ─────────────────────────────
async function loadStock() {
  showTableLoading('stock-table-container');

  try {
    const { data } = await getSupabase()
      .from('stock')
      .select('*, products(name, unit_type, sale_price, purchase_price, category_id, categories(name))')
      .order('created_at', { ascending: false });

    stockList = data || [];
    renderStockTable();
  } catch (e) {
    showToast('error', 'Erro ao carregar stock: ' + e.message);
  }
}

function renderStockTable() {
  const search = (document.getElementById('stock-search')?.value || '').toLowerCase();
  const location = document.getElementById('stock-filter-location')?.value || 'all';

  const filtered = stockList.filter(s => {
    const matchSearch = (s.products?.name || '').toLowerCase().includes(search);
    const matchLoc = location === 'all' ? true :
      location === 'warehouse' ? (s.warehouse_qty > 0) :
      location === 'store' ? (s.store_qty > 0) : true;
    return matchSearch && matchLoc;
  });

  renderTable('stock-table-container',
    [
      { label: 'Produto', field: 'product_name', format: (_, row) => row.products?.name || '-' },
      { label: 'Categoria', field: 'category', format: (_, row) => row.products?.categories?.name || '-' },
      { label: 'Armaz\u00e9m', field: 'warehouse_qty', format: v => `<span class="${v < 5 ? 'text-danger' : ''}">${formatNumber(v || 0)}</span>` },
      { label: 'Loja', field: 'store_qty', format: v => `<span class="${v < 5 ? 'text-danger' : ''}">${formatNumber(v || 0)}</span>` },
      { label: 'Total', field: 'total', format: (_, row) => formatNumber((row.warehouse_qty || 0) + (row.store_qty || 0)) },
      { label: 'Valor', field: 'value', format: (_, row) => formatMoney((row.store_qty || 0) * (row.products?.sale_price || 0)) }
    ],
    filtered,
    [
      { icon: '\u2795', title: 'Entrada', handler: 'openStockIn' },
      { icon: '\u2796', title: 'Sa\u00edda', handler: 'openStockOut' },
      { icon: '\u21C4', title: 'Transferir', handler: 'openTransfer' }
    ]
  );
}

// ── Stock Operations ───────────────────────
async function openStockIn(productId) {
  const item = stockList.find(s => s.id === productId);
  if (!item) return;

  document.getElementById('stockin-product-id').value = item.product_id;
  document.getElementById('stockin-product-name').textContent = item.products?.name || '';
  document.getElementById('stockin-current').textContent = formatNumber(item.warehouse_qty || 0);
  document.getElementById('stockin-qty').value = '';
  document.getElementById('stockin-location').value = 'warehouse';

  openModal('stockin-modal');
}

async function confirmStockIn() {
  try {
    const productId = document.getElementById('stockin-product-id').value;
    const quantity = parseFloat(document.getElementById('stockin-qty').value);
    const location = document.getElementById('stockin-location').value;
    const user = getStoredUser();

    validatePositiveNumber(quantity, 'Quantidade');

    await executeStockIn(productId, quantity, location, user.id, 'Entrada manual de stock');
    showToast('success', `Entrada de ${formatNumber(quantity)} unidades registada`);
    closeModal('stockin-modal');
    loadStock();
  } catch (e) {
    showToast('error', e.message);
  }
}

async function openStockOut(productId) {
  const item = stockList.find(s => s.id === productId);
  if (!item) return;

  document.getElementById('stockout-product-id').value = item.product_id;
  document.getElementById('stockout-product-name').textContent = item.products?.name || '';
  document.getElementById('stockout-current').textContent = formatNumber(item.warehouse_qty || 0);
  document.getElementById('stockout-qty').value = '';
  document.getElementById('stockout-location').value = 'warehouse';

  openModal('stockout-modal');
}

async function confirmStockOut() {
  try {
    const productId = document.getElementById('stockout-product-id').value;
    const quantity = parseFloat(document.getElementById('stockout-qty').value);
    const location = document.getElementById('stockout-location').value;
    const user = getStoredUser();

    validatePositiveNumber(quantity, 'Quantidade');

    await executeStockOut(productId, quantity, location, user.id, 'Sa\u00edda manual de stock');
    showToast('success', `Sa\u00edda de ${formatNumber(quantity)} unidades registada`);
    closeModal('stockout-modal');
    loadStock();
  } catch (e) {
    showToast('error', e.message);
  }
}

async function openTransfer(productId) {
  const item = stockList.find(s => s.id === productId);
  if (!item) return;

  document.getElementById('transfer-product-id').value = item.product_id;
  document.getElementById('transfer-product-name').textContent = item.products?.name || '';
  document.getElementById('transfer-current-wh').textContent = formatNumber(item.warehouse_qty || 0);
  document.getElementById('transfer-current-store').textContent = formatNumber(item.store_qty || 0);
  document.getElementById('transfer-qty').value = '';

  openModal('transfer-modal');
}

async function confirmTransfer() {
  try {
    const productId = document.getElementById('transfer-product-id').value;
    const quantity = parseFloat(document.getElementById('transfer-qty').value);
    const from = document.getElementById('transfer-from').value;
    const to = from === 'warehouse' ? 'store' : 'warehouse';
    const user = getStoredUser();

    validatePositiveNumber(quantity, 'Quantidade');

    await executeTransfer(productId, quantity, from, to, user.id);
    showToast('success', `Transfer\u00eancia de ${formatNumber(quantity)} unidades ${from} \u2192 ${to}`);
    closeModal('transfer-modal');
    loadStock();
  } catch (e) {
    showToast('error', e.message);
  }
}

// ── Bulk Stock Entry ───────────────────────
async function loadStockProducts() {
  try {
    const { data } = await getSupabase()
      .from('products')
      .select('*, stock(warehouse_qty, store_qty)')
      .order('name');

    stockProducts = data || [];
  } catch (e) {
    showToast('error', 'Erro: ' + e.message);
  }
}

async function loadStockForSale() {
  try {
    const { data } = await getSupabase()
      .from('stock')
      .select('*, products(id, name, sale_price, unit_type)')
      .gt('store_qty', 0)
      .order('created_at', { ascending: false });

    return data || [];
  } catch (e) {
    showToast('error', 'Erro ao carregar stock: ' + e.message);
    return [];
  }
}

// ── Export ─────────────────────────────────
window.loadStock = loadStock;
window.renderStockTable = renderStockTable;
window.openStockIn = openStockIn;
window.confirmStockIn = confirmStockIn;
window.openStockOut = openStockOut;
window.confirmStockOut = confirmStockOut;
window.openTransfer = openTransfer;
window.confirmTransfer = confirmTransfer;
window.loadStockProducts = loadStockProducts;
window.loadStockForSale = loadStockForSale;
