/* ============================================
   MOVEMENTS MODULE - Official Shop Administration ERP
   Source of Truth for all stock operations
   ============================================ */

let movementsList = [];
let currentMovementsPage = 1;
const MOVEMENTS_PER_PAGE = 20;

// ── Load Movements ─────────────────────────
async function loadMovements(page = 1, filters = {}) {
  currentMovementsPage = page;
  showTableLoading('movements-table-container');

  try {
    const offset = (page - 1) * MOVEMENTS_PER_PAGE;
    let query = getSupabase()
      .from('movements')
      .select('*, products(name, unit_type)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters.type) query = query.eq('type', filters.type);
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo);
    if (filters.productId) query = query.eq('product_id', filters.productId);

    const { data, count } = await query.range(offset, offset + MOVEMENTS_PER_PAGE - 1);

    movementsList = data || [];
    renderMovementsTable();
    const totalPages = Math.ceil((count || 0) / MOVEMENTS_PER_PAGE);
    renderPagination('movements-pagination', page, totalPages, 'loadMovementsPage');
  } catch (e) {
    showToast('error', 'Erro ao carregar movimentos: ' + e.message);
  }
}

function loadMovementsPage(page) {
  const type = document.getElementById('movement-filter-type')?.value;
  loadMovements(page, { type });
}

function renderMovementsTable() {
  const typeMap = {
    'in': 'Entrada', 'out': 'Sa\u00edda', 'sale': 'Venda',
    'transfer': 'Transfer\u00eancia', 'loss': 'Perda', 'theft': 'Roubo', 'adjustment': 'Ajuste'
  };

  renderTable('movements-table-container',
    [
      { label: 'Data', field: 'created_at', format: v => formatDate(v) },
      { label: 'Tipo', field: 'type', badge: true, badgeMap: typeMap },
      { label: 'Produto', field: 'product_name', format: (_, row) => row.products?.name || '-' },
      { label: 'Qtd', field: 'quantity' },
      { label: 'De', field: 'from_location', format: v => v || '-' },
      { label: 'Para', field: 'to_location', format: v => v || '-' },
      { label: 'Total', field: 'total_price', format: v => formatMoney(v) }
    ],
    movementsList,
    null
  );
}

function applyMovementFilter() {
  const type = document.getElementById('movement-filter-type')?.value;
  const dateFrom = document.getElementById('movement-date-from')?.value;
  const dateTo = document.getElementById('movement-date-to')?.value;
  loadMovements(1, { type, dateFrom, dateTo });
}

// ── Export ─────────────────────────────────
window.loadMovements = loadMovements;
window.loadMovementsPage = loadMovementsPage;
window.renderMovementsTable = renderMovementsTable;
window.applyMovementFilter = applyMovementFilter;
