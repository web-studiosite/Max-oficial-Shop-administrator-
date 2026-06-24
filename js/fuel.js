/* ============================================
   FUEL MODULE - Official Shop Administration ERP
   ============================================ */

let fuelList = [];

// ── Load Fuel ──────────────────────────────
async function loadFuel() {
  showTableLoading('fuel-table-container');

  try {
    const { data } = await getSupabase()
      .from('fuel')
      .select('*')
      .order('created_at', { ascending: false });

    fuelList = data || [];
    renderFuelTable();
    renderFuelGauges();
  } catch (e) {
    showToast('error', 'Erro ao carregar combust\u00edvel: ' + e.message);
  }
}

function renderFuelTable() {
  renderTable('fuel-table-container',
    [
      { label: 'Tipo', field: 'fuel_type' },
      { label: 'Entradas', field: 'quantity_in', format: v => `${formatNumber(v || 0)} L` },
      { label: 'Sa\u00eddas', field: 'quantity_out', format: v => `${formatNumber(v || 0)} L` },
      { label: 'Stock', field: 'balance', format: (_, row) => {
        const bal = (row.quantity_in || 0) - (row.quantity_out || 0);
        const cls = bal < 500 ? 'style="color:var(--danger);font-weight:700;"' : '';
        return `<span ${cls}>${formatNumber(bal)} L</span>`;
      }},
      { label: 'Pre\u00e7o Compra', field: 'purchase_price', format: v => formatMoney(v) },
      { label: 'Pre\u00e7o Venda', field: 'sale_price', format: v => formatMoney(v) }
    ],
    fuelList,
    [
      { icon: '\u2795', title: 'Entrada', handler: 'openFuelEntry' },
      { icon: '\u2796', title: 'Venda', handler: 'openFuelSale' }
    ]
  );
}

function renderFuelGauges() {
  const container = document.getElementById('fuel-gauges-container');
  if (!container) return;

  container.innerHTML = '';
  fuelList.forEach(f => {
    const balance = (f.quantity_in || 0) - (f.quantity_out || 0);
    const maxCap = Math.max(f.quantity_in || 0, 10000);
    const div = document.createElement('div');
    div.id = `fuel-gauge-${f.id}`;
    div.style.marginBottom = '20px';
    container.appendChild(div);
    renderFuelGauge(div.id, balance, maxCap, f.fuel_type);
  });
}

// ── Fuel Entry ─────────────────────────────
function openFuelEntry(fuelId) {
  const fuel = fuelList.find(f => f.id === fuelId);
  if (!fuel) return;

  document.getElementById('fuel-entry-id').value = fuel.id;
  document.getElementById('fuel-entry-type').textContent = fuel.fuel_type;
  document.getElementById('fuel-entry-qty').value = '';
  document.getElementById('fuel-entry-purchase').value = fuel.purchase_price || '';
  document.getElementById('fuel-entry-sale').value = fuel.sale_price || '';

  openModal('fuel-entry-modal');
}

async function confirmFuelEntry() {
  try {
    const id = document.getElementById('fuel-entry-id').value;
    const fuel = fuelList.find(f => f.id === id);
    const quantity = parseFloat(document.getElementById('fuel-entry-qty').value);
    const purchasePrice = parseFloat(document.getElementById('fuel-entry-purchase').value);
    const salePrice = parseFloat(document.getElementById('fuel-entry-sale').value);
    const user = getStoredUser();

    validatePositiveNumber(quantity, 'Quantidade');
    validatePositiveNumber(purchasePrice, 'Pre\u00e7o de compra');
    validatePositiveNumber(salePrice, 'Pre\u00e7o de venda');

    await addFuelEntry(fuel.fuel_type, quantity, purchasePrice, salePrice, user.id);
    showToast('success', `Entrada de ${formatNumber(quantity)}L de ${fuel.fuel_type} registada`);
    closeModal('fuel-entry-modal');
    loadFuel();
  } catch (e) {
    showToast('error', e.message);
  }
}

// ── Fuel Sale ──────────────────────────────
function openFuelSale(fuelId) {
  const fuel = fuelList.find(f => f.id === fuelId);
  if (!fuel) return;

  const balance = (fuel.quantity_in || 0) - (fuel.quantity_out || 0);

  document.getElementById('fuel-sale-id').value = fuel.id;
  document.getElementById('fuel-sale-type').textContent = fuel.fuel_type;
  document.getElementById('fuel-sale-available').textContent = formatNumber(balance) + ' L';
  document.getElementById('fuel-sale-price').textContent = formatMoney(fuel.sale_price);
  document.getElementById('fuel-sale-qty').value = '';

  openModal('fuel-sale-modal');
}

async function confirmFuelSale() {
  try {
    const id = document.getElementById('fuel-sale-id').value;
    const fuel = fuelList.find(f => f.id === id);
    const quantity = parseFloat(document.getElementById('fuel-sale-qty').value);
    const user = getStoredUser();

    validatePositiveNumber(quantity, 'Quantidade');

    await recordFuelSale(fuel.fuel_type, quantity, user.id);
    showToast('success', `Venda de ${formatNumber(quantity)}L de ${fuel.fuel_type} registada`);
    closeModal('fuel-sale-modal');
    loadFuel();
  } catch (e) {
    showToast('error', e.message);
  }
}

// ── New Fuel Type ──────────────────────────
async function saveFuelType() {
  try {
    const type = document.getElementById('new-fuel-type').value.trim();
    const purchasePrice = parseFloat(document.getElementById('new-fuel-purchase').value);
    const salePrice = parseFloat(document.getElementById('new-fuel-sale').value);
    const user = getStoredUser();

    validateRequired(type, 'Tipo de combust\u00edvel');
    validatePositiveNumber(purchasePrice, 'Pre\u00e7o de compra');
    validatePositiveNumber(salePrice, 'Pre\u00e7o de venda');

    await addFuelEntry(type, 0, purchasePrice, salePrice, user.id);
    showToast('success', `Tipo de combust\u00edvel "${type}" criado`);
    closeModal('fuel-type-modal');
    loadFuel();
  } catch (e) {
    showToast('error', e.message);
  }
}

// ── Export ─────────────────────────────────
window.loadFuel = loadFuel;
window.renderFuelTable = renderFuelTable;
window.renderFuelGauges = renderFuelGauges;
window.openFuelEntry = openFuelEntry;
window.confirmFuelEntry = confirmFuelEntry;
window.openFuelSale = openFuelSale;
window.confirmFuelSale = confirmFuelSale;
window.saveFuelType = saveFuelType;
