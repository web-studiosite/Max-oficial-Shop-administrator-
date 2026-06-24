/* ============================================
   INVENTORY MODULE - Official Shop Administration ERP
   Physical count vs system reconciliation
   ============================================ */

let inventorySessions = [];
let currentInventoryId = null;
let inventoryStockData = [];

// ── Load Inventory Sessions ────────────────
async function loadInventory() {
  showTableLoading('inventory-table-container');

  try {
    const { data } = await getSupabase()
      .from('inventory_sessions')
      .select('*, users(name)')
      .order('created_at', { ascending: false })
      .limit(20);

    inventorySessions = data || [];
    renderInventoryTable();
  } catch (e) {
    showToast('error', 'Erro: ' + e.message);
  }
}

function renderInventoryTable() {
  renderTable('inventory-table-container',
    [
      { label: 'ID', field: 'id', format: v => v?.slice(0, 8) + '...' },
      { label: 'Data', field: 'created_at', format: v => formatDate(v) },
      { label: 'Utilizador', field: 'user', format: (_, row) => row.users?.name || '-' },
      { label: 'Estado', field: 'status', badge: {
        'in_progress': 'badge-warning', 'finalized': 'badge-success', 'cancelled': 'badge-danger',
        default: 'badge-info'
      }, badgeMap: { 'in_progress': 'Em curso', 'finalized': 'Finalizado', 'cancelled': 'Cancelado' } },
      { label: 'Diferen\u00e7as', field: 'diff_count', format: (_, row) => {
        const diffs = row.differences || {};
        let count = 0;
        Object.values(diffs).forEach(d => Object.values(d).forEach(v => { if (v !== 0) count++; }));
        return count;
      }}
    ],
    inventorySessions,
    [
      { icon: '\u1F441', title: 'Ver', handler: 'viewInventory' },
      { icon: '\u2705', title: 'Finalizar', handler: 'finalizeInventoryCheck', visible: row => row.status === 'in_progress' }
    ]
  );
}

// ── New Inventory Session ──────────────────
async function startNewInventory() {
  try {
    const user = getStoredUser();
    const session = await createInventorySession(user.id);
    currentInventoryId = session.id;

    showToast('success', 'Sess\u00e3o de invent\u00e1rio iniciada');
    openInventoryCounter(session.id);
  } catch (e) {
    showToast('error', e.message);
  }
}

async function openInventoryCounter(sessionId) {
  try {
    // Load products with stock
    const { data: stockData } = await getSupabase()
      .from('stock')
      .select('*, products(name, unit_type)')
      .order('created_at');

    inventoryStockData = stockData || [];

    const container = document.getElementById('inventory-counter-body');
    if (!container) return;

    let html = `
      <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
        <h3 style="font-size:15px;">Contagem F\u00edsica</h3>
        <span style="font-size:12px;color:var(--text-muted);">${inventoryStockData.length} produtos</span>
      </div>
      <div style="max-height:500px;overflow-y:auto;">
    `;

    inventoryStockData.forEach((s, idx) => {
      html += `
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;padding:10px;background:var(--bg-tertiary);border-radius:8px;margin-bottom:6px;align-items:center;">
          <div style="font-size:13px;font-weight:600;">${s.products?.name || '?'}</div>
          <div style="font-size:11px;color:var(--text-muted);">Arm: ${s.warehouse_qty || 0}</div>
          <div style="font-size:11px;color:var(--text-muted);">Loja: ${s.store_qty || 0}</div>
          <input type="number" class="form-input inventory-count" data-product="${s.product_id}" data-location="store"
            placeholder="Contagem" style="padding:6px 10px;font-size:13px;" min="0" step="1">
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;

    document.getElementById('inventory-session-id').value = sessionId;
    openModal('inventory-counter-modal');
  } catch (e) {
    showToast('error', e.message);
  }
}

async function submitInventoryCounts() {
  try {
    const sessionId = document.getElementById('inventory-session-id').value;
    const user = getStoredUser();

    const inputs = document.querySelectorAll('.inventory-count');
    for (const input of inputs) {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val >= 0) {
        const productId = input.dataset.product;
        const location = input.dataset.location;
        await updateInventoryCount(sessionId, productId, location, val);
      }
    }

    closeModal('inventory-counter-modal');
    showToast('success', 'Contagens registadas. Finalize o invent\u00e1rio.');
    loadInventory();
  } catch (e) {
    showToast('error', e.message);
  }
}

async function finalizeInventoryCheck(sessionId) {
  showConfirm('Finalizar Invent\u00e1rio', 'As diferen\u00e7as ser\u00e3o aplicadas ao stock. Continuar?', async () => {
    try {
      const user = getStoredUser();
      await finalizeInventory(sessionId, user.id);
      showToast('success', 'Invent\u00e1rio finalizado com sucesso');
      loadInventory();
    } catch (e) {
      showToast('error', e.message);
    }
  });
}

async function viewInventory(id) {
  try {
    const { data: session } = await getSupabase()
      .from('inventory_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (!session) return;

    const container = document.getElementById('inventory-view-body');
    if (!container) return;

    let html = '<div style="max-height:500px;overflow-y:auto;">';
    const diffs = session.differences || {};

    for (const [pid, locs] of Object.entries(diffs)) {
      for (const [loc, diff] of Object.entries(locs)) {
        if (diff !== 0) {
          const color = diff > 0 ? 'var(--success)' : 'var(--danger)';
          html += `
            <div style="padding:10px;background:var(--bg-tertiary);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:13px;font-weight:600;">Produto #${pid.slice(0,8)}</span>
              <span style="color:${color};font-weight:700;">${diff > 0 ? '+' : ''}${diff} (${loc})</span>
            </div>
          `;
        }
      }
    }

    if (html === '<div style="max-height:500px;overflow-y:auto;">') {
      html += '<div class="empty-state"><h3>Sem diferen\u00e7as registadas</h3></div>';
    }

    html += '</div>';
    container.innerHTML = html;
    openModal('inventory-view-modal');
  } catch (e) {
    showToast('error', e.message);
  }
}

// ── Export ─────────────────────────────────
window.loadInventory = loadInventory;
window.renderInventoryTable = renderInventoryTable;
window.startNewInventory = startNewInventory;
window.openInventoryCounter = openInventoryCounter;
window.submitInventoryCounts = submitInventoryCounts;
window.finalizeInventoryCheck = finalizeInventoryCheck;
window.viewInventory = viewInventory;
