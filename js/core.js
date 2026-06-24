/* ============================================
   CORE SYSTEM - Official Shop Administration ERP
   Stock update, validation, pricing, movements, cash, inventory
   ============================================ */

// ── Currency ───────────────────────────────
const CURRENCY = 'MZN';
const CURRENCY_SYMBOL = 'MT';

function formatMoney(value) {
  const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
  return `${CURRENCY_SYMBOL} ${num.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value) {
  const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
  return num.toLocaleString('pt-MZ');
}

function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Validation ─────────────────────────────
function validateRequired(value, fieldName) {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error(`${fieldName} é obrigatório`);
  }
  return true;
}

function validatePositiveNumber(value, fieldName) {
  const num = parseFloat(value);
  if (isNaN(num) || num <= 0) {
    throw new Error(`${fieldName} deve ser um número positivo`);
  }
  return num;
}

function validateNonNegative(value, fieldName) {
  const num = parseFloat(value);
  if (isNaN(num) || num < 0) {
    throw new Error(`${fieldName} não pode ser negativo`);
  }
  return num;
}

function validateStockAvailability(currentStock, requestedQty, productName) {
  if (requestedQty > currentStock) {
    throw new Error(`Stock insuficiente para "${productName}". Disponível: ${currentStock}, Solicitado: ${requestedQty}`);
  }
  return true;
}

// ── Profit Calculation ─────────────────────
function calculateProfit(salePrice, purchasePrice, quantity) {
  const sp = parseFloat(salePrice) || 0;
  const pp = parseFloat(purchasePrice) || 0;
  const qty = parseFloat(quantity) || 0;
  return (sp - pp) * qty;
}

function calculateMargin(salePrice, purchasePrice) {
  const sp = parseFloat(salePrice) || 0;
  const pp = parseFloat(purchasePrice) || 0;
  if (pp === 0) return 100;
  return ((sp - pp) / pp) * 100;
}

// ── Core Transaction: SALE ─────────────────
async function executeSale(saleItems, userId) {
  const sb = getSupabase();
  const results = [];

  // 1. Validate all items have stock
  for (const item of saleItems) {
    const { data: stock } = await sb.from('stock').select('*').eq('product_id', item.product_id).single();
    const available = item.location === 'store' ? (stock?.store_qty || 0) : (stock?.warehouse_qty || 0);
    validateStockAvailability(available, item.quantity, item.product_name);
  }

  // 2. Process each item in sequence
  for (const item of saleItems) {
    // Get product details
    const { data: product } = await sb.from('products').select('*').eq('id', item.product_id).single();
    const { data: stock } = await sb.from('stock').select('*').eq('product_id', item.product_id).single();

    const totalPrice = product.sale_price * item.quantity;
    const profit = calculateProfit(product.sale_price, product.purchase_price, item.quantity);

    // 3. Create sale record
    const { data: sale } = await sb.from('sales').insert({
      product_id: item.product_id,
      quantity: item.quantity,
      total_price: totalPrice,
      profit: profit,
      user_id: userId,
      unit_price: product.sale_price
    }).select().single();

    // 4. Update stock
    const stockField = item.location === 'store' ? 'store_qty' : 'warehouse_qty';
    const newQty = (stock[stockField] || 0) - item.quantity;
    await sb.from('stock').update({ [stockField]: newQty }).eq('id', stock.id);

    // 5. Create movement (source of truth)
    await sb.from('movements').insert({
      product_id: item.product_id,
      quantity: item.quantity,
      type: 'sale',
      from_location: item.location,
      to_location: null,
      user_id: userId,
      unit_price: product.sale_price,
      total_price: totalPrice,
      reference_id: sale.id,
      reference_type: 'sale'
    });

    // 6. Log audit
    await logAudit('CREATE', 'sales', null, sale);

    results.push({ sale, product, totalPrice, profit });
  }

  return results;
}

// ── Core Transaction: STOCK IN ─────────────
async function executeStockIn(productId, quantity, location, userId, notes = '') {
  const sb = getSupabase();

  validatePositiveNumber(quantity, 'Quantidade');

  const { data: product } = await sb.from('products').select('*').eq('id', productId).single();
  const { data: existingStock } = await sb.from('stock').select('*').eq('product_id', productId).single();

  // Update or create stock record
  const stockField = location === 'store' ? 'store_qty' : 'warehouse_qty';
  if (existingStock) {
    const newQty = (existingStock[stockField] || 0) + quantity;
    await sb.from('stock').update({ [stockField]: newQty }).eq('id', existingStock.id);
  } else {
    await sb.from('stock').insert({
      product_id: productId,
      warehouse_qty: location === 'warehouse' ? quantity : 0,
      store_qty: location === 'store' ? quantity : 0
    });
  }

  // Create movement
  const { data: movement } = await sb.from('movements').insert({
    product_id: productId,
    quantity: quantity,
    type: 'in',
    from_location: null,
    to_location: location,
    user_id: userId,
    unit_price: product.purchase_price,
    total_price: product.purchase_price * quantity,
    notes
  }).select().single();

  await logAudit('CREATE', 'movements', null, movement);

  return movement;
}

// ── Core Transaction: STOCK OUT ────────────
async function executeStockOut(productId, quantity, location, userId, reason = '') {
  const sb = getSupabase();

  validatePositiveNumber(quantity, 'Quantidade');

  const { data: product } = await sb.from('products').select('*').eq('id', productId).single();
  const { data: stock } = await sb.from('stock').select('*').eq('product_id', productId).single();

  const stockField = location === 'store' ? 'store_qty' : 'warehouse_qty';
  validateStockAvailability(stock[stockField] || 0, quantity, product.name);

  // Update stock
  const newQty = (stock[stockField] || 0) - quantity;
  await sb.from('stock').update({ [stockField]: newQty }).eq('id', stock.id);

  // Create movement
  const { data: movement } = await sb.from('movements').insert({
    product_id: productId,
    quantity: quantity,
    type: 'out',
    from_location: location,
    to_location: null,
    user_id: userId,
    unit_price: product.purchase_price,
    total_price: product.purchase_price * quantity,
    notes: reason
  }).select().single();

  await logAudit('CREATE', 'movements', null, movement);

  return movement;
}

// ── Core Transaction: TRANSFER ─────────────
async function executeTransfer(productId, quantity, fromLocation, toLocation, userId) {
  const sb = getSupabase();

  validatePositiveNumber(quantity, 'Quantidade');

  const { data: product } = await sb.from('products').select('*').eq('id', productId).single();
  const { data: stock } = await sb.from('stock').select('*').eq('product_id', productId).single();

  const fromField = fromLocation === 'store' ? 'store_qty' : 'warehouse_qty';
  validateStockAvailability(stock[fromField] || 0, quantity, product.name);

  // Update stock
  const newFromQty = (stock[fromField] || 0) - quantity;
  const toField = toLocation === 'store' ? 'store_qty' : 'warehouse_qty';
  const newToQty = (stock[toField] || 0) + quantity;

  await sb.from('stock').update({
    [fromField]: newFromQty,
    [toField]: newToQty
  }).eq('id', stock.id);

  // Create movement
  const { data: movement } = await sb.from('movements').insert({
    product_id: productId,
    quantity: quantity,
    type: 'transfer',
    from_location: fromLocation,
    to_location: toLocation,
    user_id: userId,
    unit_price: product.purchase_price,
    total_price: product.purchase_price * quantity
  }).select().single();

  await logAudit('CREATE', 'movements', null, movement);

  return movement;
}

// ── Core Transaction: ADJUSTMENT ───────────
async function executeAdjustment(productId, newQty, location, userId, reason = '') {
  const sb = getSupabase();

  const { data: product } = await sb.from('products').select('*').eq('id', productId).single();
  const { data: stock } = await sb.from('stock').select('*').eq('product_id', productId).single();

  const stockField = location === 'store' ? 'store_qty' : 'warehouse_qty';
  const oldQty = stock[stockField] || 0;
  const diff = newQty - oldQty;

  await sb.from('stock').update({ [stockField]: newQty }).eq('id', stock.id);

  // Create movement
  const { data: movement } = await sb.from('movements').insert({
    product_id: productId,
    quantity: Math.abs(diff),
    type: 'adjustment',
    from_location: diff < 0 ? location : null,
    to_location: diff > 0 ? location : null,
    user_id: userId,
    unit_price: product.purchase_price,
    notes: reason || `Ajuste: ${oldQty} -> ${newQty}`
  }).select().single();

  await logAudit('CREATE', 'movements', null, movement);

  return movement;
}

// ── Cash Register ──────────────────────────
async function openCashRegister(openingBalance, userId) {
  const sb = getSupabase();
  validatePositiveNumber(openingBalance, 'Valor de abertura');

  // Check if already open
  const { data: existing } = await sb.from('cash_register')
    .select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(1);

  if (existing && existing.length > 0) {
    throw new Error('Já existe um caixa aberto. Feche-o primeiro.');
  }

  const { data: register } = await sb.from('cash_register').insert({
    opening_balance: openingBalance,
    total_sales: 0,
    total_expenses: 0,
    closing_balance: null,
    status: 'open',
    opened_by: userId,
    opened_at: new Date().toISOString()
  }).select().single();

  sessionStorage.setItem('cashierOpen', 'true');
  await logAudit('CREATE', 'cash_register', null, register);

  return register;
}

async function closeCashRegister(registerId, closingBalance, userId) {
  const sb = getSupabase();

  const { data: register } = await sb.from('cash_register')
    .select('*').eq('id', registerId).single();

  if (!register || register.status !== 'open') {
    throw new Error('Caixa não encontrado ou já está fechado');
  }

  const difference = closingBalance - (register.opening_balance + register.total_sales - register.total_expenses);

  const { data: updated } = await sb.from('cash_register').update({
    closing_balance: closingBalance,
    status: 'closed',
    closed_by: userId,
    closed_at: new Date().toISOString(),
    difference: difference
  }).eq('id', registerId).select().single();

  sessionStorage.removeItem('cashierOpen');
  await logAudit('UPDATE', 'cash_register', register, updated);

  return updated;
}

async function getOpenRegister() {
  const sb = getSupabase();
  const { data } = await sb.from('cash_register')
    .select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(1).single();
  return data;
}

async function getTodaySalesTotal() {
  const sb = getSupabase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data } = await sb.from('sales')
    .select('total_price')
    .gte('created_at', today.toISOString());

  return (data || []).reduce((sum, s) => sum + (s.total_price || 0), 0);
}

async function addCashExpense(registerId, amount, description, userId) {
  const sb = getSupabase();

  const { data: register } = await sb.from('cash_register')
    .select('*').eq('id', registerId).single();

  if (!register || register.status !== 'open') {
    throw new Error('Caixa deve estar aberto para registar despesas');
  }

  const newExpenses = (register.total_expenses || 0) + amount;
  const { data: updated } = await sb.from('cash_register').update({
    total_expenses: newExpenses
  }).eq('id', registerId).select().single();

  // Log movement
  await sb.from('movements').insert({
    type: 'out',
    quantity: 1,
    total_price: amount,
    from_location: 'cash',
    user_id: userId,
    notes: `Despesa: ${description}`
  });

  return updated;
}

// ── Fuel Operations ────────────────────────
async function addFuelEntry(fuelType, quantity, purchasePrice, salePrice, userId) {
  const sb = getSupabase();

  validateRequired(fuelType, 'Tipo de combustível');
  validatePositiveNumber(quantity, 'Quantidade');
  validatePositiveNumber(purchasePrice, 'Preço de compra');
  validatePositiveNumber(salePrice, 'Preço de venda');

  const { data: fuel } = await sb.from('fuel').select('*').eq('fuel_type', fuelType).single();

  if (fuel) {
    const newIn = (fuel.quantity_in || 0) + quantity;
    const { data: updated } = await sb.from('fuel').update({
      quantity_in: newIn,
      purchase_price: purchasePrice,
      sale_price: salePrice
    }).eq('id', fuel.id).select().single();

    await logAudit('UPDATE', 'fuel', fuel, updated);
    return updated;
  } else {
    const { data: created } = await sb.from('fuel').insert({
      fuel_type: fuelType,
      quantity_in: quantity,
      quantity_out: 0,
      purchase_price: purchasePrice,
      sale_price: salePrice
    }).select().single();

    await logAudit('CREATE', 'fuel', null, created);
    return created;
  }
}

async function recordFuelSale(fuelType, quantity, userId) {
  const sb = getSupabase();

  validatePositiveNumber(quantity, 'Quantidade');

  const { data: fuel } = await sb.from('fuel').select('*').eq('fuel_type', fuelType).single();
  if (!fuel) throw new Error('Combustível não encontrado');

  const available = (fuel.quantity_in || 0) - (fuel.quantity_out || 0);
  validateStockAvailability(available, quantity, fuelType);

  const newOut = (fuel.quantity_out || 0) + quantity;
  const totalPrice = fuel.sale_price * quantity;

  const { data: updated } = await sb.from('fuel').update({
    quantity_out: newOut
  }).eq('id', fuel.id).select().single();

  // Create movement
  await sb.from('movements').insert({
    type: 'sale',
    quantity: quantity,
    total_price: totalPrice,
    from_location: 'fuel_station',
    user_id: userId,
    notes: `Venda combustível: ${fuelType}`
  });

  return updated;
}

// ── Inventory ──────────────────────────────
async function createInventorySession(userId) {
  const sb = getSupabase();

  // Get all current stock
  const { data: stocks } = await sb.from('stock').select('*, products(name, unit_type)');

  const warehouseStock = {};
  const storeStock = {};

  (stocks || []).forEach(s => {
    warehouseStock[s.product_id] = s.warehouse_qty || 0;
    storeStock[s.product_id] = s.store_qty || 0;
  });

  const { data: session } = await sb.from('inventory_sessions').insert({
    user_id: userId,
    warehouse_stock: warehouseStock,
    store_stock: storeStock,
    manual_stock: {},
    differences: {},
    status: 'in_progress'
  }).select().single();

  return session;
}

async function updateInventoryCount(sessionId, productId, location, manualCount) {
  const sb = getSupabase();

  const { data: session } = await sb.from('inventory_sessions')
    .select('*').eq('id', sessionId).single();

  const manualStock = { ...session.manual_stock };
  if (!manualStock[productId]) manualStock[productId] = {};
  manualStock[productId][location] = manualCount;

  const systemStock = location === 'warehouse' ? session.warehouse_stock : session.store_stock;
  const systemCount = systemStock[productId] || 0;
  const diff = manualCount - systemCount;

  const differences = { ...session.differences };
  if (!differences[productId]) differences[productId] = {};
  differences[productId][location] = diff;

  const { data: updated } = await sb.from('inventory_sessions').update({
    manual_stock: manualStock,
    differences: differences
  }).eq('id', sessionId).select().single();

  return updated;
}

async function finalizeInventory(sessionId, userId) {
  const sb = getSupabase();

  const { data: session } = await sb.from('inventory_sessions')
    .select('*').eq('id', sessionId).single();

  // Apply adjustments
  for (const [productId, locs] of Object.entries(session.differences || {})) {
    for (const [location, diff] of Object.entries(locs)) {
      if (diff !== 0) {
        const stockField = location === 'warehouse' ? 'warehouse_qty' : 'store_qty';
        const { data: stock } = await sb.from('stock')
          .select('*').eq('product_id', productId).single();

        if (stock) {
          const newQty = (stock[stockField] || 0) + diff;
          await sb.from('stock').update({ [stockField]: Math.max(0, newQty) }).eq('id', stock.id);
        }

        // Log adjustment movement
        await sb.from('movements').insert({
          product_id: productId,
          type: 'adjustment',
          quantity: Math.abs(diff),
          from_location: diff < 0 ? location : null,
          to_location: diff > 0 ? location : null,
          user_id: userId,
          notes: `Ajuste inventário: diferença de ${diff}`
        });
      }
    }
  }

  const { data: finalized } = await sb.from('inventory_sessions').update({
    status: 'finalized',
    finalized_at: new Date().toISOString()
  }).eq('id', sessionId).select().single();

  await logAudit('UPDATE', 'inventory_sessions', session, finalized);

  return finalized;
}

// ── Dashboard Stats ────────────────────────
async function getDashboardStats() {
  const sb = getSupabase();

  // Products count
  const { count: productsCount } = await sb.from('products').select('*', { count: 'exact', head: true });

  // Stock alerts (low stock)
  const { data: stockData } = await sb.from('stock').select('*, products(name)');
  const lowStock = (stockData || []).filter(s => (s.store_qty || 0) < 5 || (s.warehouse_qty || 0) < 5);

  // Today's sales
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data: todaySales } = await sb.from('sales')
    .select('total_price, profit')
    .gte('created_at', today.toISOString());
  const todayTotal = (todaySales || []).reduce((s, x) => s + (x.total_price || 0), 0);
  const todayProfit = (todaySales || []).reduce((s, x) => s + (x.profit || 0), 0);

  // Monthly sales
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: monthSales } = await sb.from('sales')
    .select('total_price')
    .gte('created_at', monthStart.toISOString());
  const monthTotal = (monthSales || []).reduce((s, x) => s + (x.total_price || 0), 0);

  // Open register
  const openRegister = await getOpenRegister();

  // Fuel status
  const { data: fuelData } = await sb.from('fuel').select('*');

  return {
    productsCount: productsCount || 0,
    lowStockCount: lowStock.length,
    lowStockItems: lowStock,
    todaySales: todayTotal,
    todayProfit: todayProfit,
    monthSales: monthTotal,
    openRegister,
    fuelData: fuelData || []
  };
}

// ── Export ─────────────────────────────────
window.CURRENCY = CURRENCY;
window.CURRENCY_SYMBOL = CURRENCY_SYMBOL;
window.formatMoney = formatMoney;
window.formatNumber = formatNumber;
window.formatDate = formatDate;
window.validateRequired = validateRequired;
window.validatePositiveNumber = validatePositiveNumber;
window.validateNonNegative = validateNonNegative;
window.validateStockAvailability = validateStockAvailability;
window.calculateProfit = calculateProfit;
window.calculateMargin = calculateMargin;
window.executeSale = executeSale;
window.executeStockIn = executeStockIn;
window.executeStockOut = executeStockOut;
window.executeTransfer = executeTransfer;
window.executeAdjustment = executeAdjustment;
window.openCashRegister = openCashRegister;
window.closeCashRegister = closeCashRegister;
window.getOpenRegister = getOpenRegister;
window.getTodaySalesTotal = getTodaySalesTotal;
window.addCashExpense = addCashExpense;
window.addFuelEntry = addFuelEntry;
window.recordFuelSale = recordFuelSale;
window.createInventorySession = createInventorySession;
window.updateInventoryCount = updateInventoryCount;
window.finalizeInventory = finalizeInventory;
window.getDashboardStats = getDashboardStats;
