/* ============================================
   SALES MODULE - Official Shop Administration ERP
   ============================================ */

let salesList = [];
let currentSalesPage = 1;
const SALES_PER_PAGE = 15;

// ── Load Sales ─────────────────────────────
async function loadSales(page = 1, filters = {}) {
  currentSalesPage = page;
  showTableLoading('sales-table-container');

  try {
    const offset = (page - 1) * SALES_PER_PAGE;
    let query = getSupabase()
      .from('sales')
      .select('*, products(name, unit_type)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo);
    if (filters.productId) query = query.eq('product_id', filters.productId);

    const { data, count } = await query.range(offset, offset + SALES_PER_PAGE - 1);

    salesList = data || [];
    renderSalesTable();
    const totalPages = Math.ceil((count || 0) / SALES_PER_PAGE);
    renderPagination('sales-pagination', page, totalPages, 'loadSalesPage');
  } catch (e) {
    showToast('error', 'Erro ao carregar vendas: ' + e.message);
  }
}

function loadSalesPage(page) {
  loadSales(page);
}

function renderSalesTable() {
  renderTable('sales-table-container',
    [
      { label: 'Data', field: 'created_at', format: v => formatDate(v) },
      { label: 'Produto', field: 'product_name', format: (_, row) => row.products?.name || '-' },
      { label: 'Qtd', field: 'quantity' },
      { label: 'Pre\u00e7o Unit.', field: 'unit_price', format: v => formatMoney(v) },
      { label: 'Total', field: 'total_price', format: v => formatMoney(v) },
      { label: 'Lucro', field: 'profit', format: v => formatMoney(v) }
    ],
    salesList,
    null
  );
}

// ── Sales Report ───────────────────────────
async function loadSalesReport() {
  try {
    const today = new Date();
    today.setHours(0,0,0,0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Today's sales
    const { data: todaySales } = await getSupabase()
      .from('sales')
      .select('total_price, profit')
      .gte('created_at', today.toISOString());

    const todayTotal = (todaySales || []).reduce((s, x) => s + (x.total_price || 0), 0);
    const todayProfit = (todaySales || []).reduce((s, x) => s + (x.profit || 0), 0);

    // Month sales
    const { data: monthSales } = await getSupabase()
      .from('sales')
      .select('total_price, profit')
      .gte('created_at', monthStart.toISOString());

    const monthTotal = (monthSales || []).reduce((s, x) => s + (x.total_price || 0), 0);
    const monthProfit = (monthSales || []).reduce((s, x) => s + (x.profit || 0), 0);

    // Top products
    const { data: topProducts } = await getSupabase()
      .from('sales')
      .select('product_id, products(name), quantity.sum(), total_price.sum()')
      .gte('created_at', monthStart.toISOString())
      .group('product_id, products(name)')
      .order('quantity.sum()', { ascending: false })
      .limit(5);

    // Update display
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('report-today-sales', formatMoney(todayTotal));
    el('report-today-profit', formatMoney(todayProfit));
    el('report-month-sales', formatMoney(monthTotal));
    el('report-month-profit', formatMoney(monthProfit));

    // Top products table
    const topContainer = document.getElementById('top-products-container');
    if (topContainer && topProducts) {
      if (!topProducts.length) {
        topContainer.innerHTML = '<div class="empty-state"><h3>Sem dados</h3></div>';
      } else {
        let html = '<div class="table-container"><table><thead><tr><th>Produto</th><th>Qtd Vendida</th><th>Total</th></tr></thead><tbody>';
        topProducts.forEach(p => {
          html += `<tr>
            <td>${p.products?.name || '-'}</td>
            <td>${formatNumber(p.sum?.quantity || 0)}</td>
            <td>${formatMoney(p.sum?.total_price || 0)}</td>
          </tr>`;
        });
        html += '</tbody></table></div>';
        topContainer.innerHTML = html;
      }
    }
  } catch (e) {
    showToast('error', 'Erro no relat\u00f3rio: ' + e.message);
  }
}

// ── Filter Sales ───────────────────────────
function applySalesFilter() {
  const dateFrom = document.getElementById('sales-date-from')?.value;
  const dateTo = document.getElementById('sales-date-to')?.value;
  loadSales(1, { dateFrom, dateTo });
}

// ── Export ─────────────────────────────────
window.loadSales = loadSales;
window.loadSalesPage = loadSalesPage;
window.renderSalesTable = renderSalesTable;
window.loadSalesReport = loadSalesReport;
window.applySalesFilter = applySalesFilter;
