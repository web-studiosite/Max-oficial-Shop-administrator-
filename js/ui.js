/* ============================================
   UI RENDERING & UTILITIES
   Official Shop Administration ERP
   ============================================ */

// ── Toast Notifications ────────────────────
function showToast(type, message, duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: '\u2713',
    error: '\u2717',
    warning: '\u26A0',
    info: '\u2139'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || '\u2022'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Modal System ───────────────────────────
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay.active, .pos-modal-overlay.active').forEach(m => {
    m.classList.remove('active');
  });
}

// ── Confirm Dialog ─────────────────────────
function showConfirm(title, message, onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.id = 'confirm-modal';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="modal-close" onclick="closeModal('confirm-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-secondary);font-size:14px;">${message}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('confirm-modal')">Cancelar</button>
        <button class="btn btn-danger" id="confirm-btn">Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('confirm-btn').onclick = () => {
    closeModal('confirm-modal');
    setTimeout(() => overlay.remove(), 300);
    if (onConfirm) onConfirm();
  };

  overlay.querySelector('.modal-close').onclick = () => {
    closeModal('confirm-modal');
    setTimeout(() => overlay.remove(), 300);
    if (onCancel) onCancel();
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeModal('confirm-modal');
      setTimeout(() => overlay.remove(), 300);
      if (onCancel) onCancel();
    }
  };
}

// ── Section Navigation ─────────────────────
function showSection(sectionId) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const section = document.getElementById(sectionId);
  if (section) section.classList.add('active');

  const navItem = document.querySelector(`[data-section="${sectionId}"]`);
  if (navItem) navItem.classList.add('active');

  // Update page title
  const titles = {
    'dashboard-section': 'Dashboard',
    'products-section': 'Produtos',
    'stock-section': 'Stock',
    'sales-section': 'Vendas',
    'movements-section': 'Movimentos',
    'cash-section': 'Caixa',
    'fuel-section': 'Combust\u00edvel',
    'inventory-section': 'Invent\u00e1rio',
    'audit-section': 'Auditoria',
    'settings-section': 'Configura\u00e7\u00f5es'
  };

  const pageTitle = document.getElementById('page-title');
  if (pageTitle && titles[sectionId]) pageTitle.textContent = titles[sectionId];

  // Store current section
  sessionStorage.setItem('currentSection', sectionId);
}

// ── Table Rendering ────────────────────────
function renderTable(containerId, columns, rows, actions) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\u1F4CB</div>
        <h3>Sem registos</h3>
        <p>Nenhum dado encontrado para exibir.</p>
      </div>
    `;
    return;
  }

  let html = '<div class="table-container"><table><thead><tr>';
  columns.forEach(col => {
    html += `<th>${col.label}</th>`;
  });
  if (actions) html += '<th>A\u00e7\u00f5es</th>';
  html += '</tr></thead><tbody>';

  rows.forEach((row, idx) => {
    html += '<tr>';
    columns.forEach(col => {
      let value = row[col.field];
      if (col.format) value = col.format(value, row);
      if (col.badge) {
        const badgeClass = col.badge[value] || col.badge.default || 'badge-info';
        const badgeText = col.badgeMap?.[value] || value;
        html += `<td><span class="badge ${badgeClass}">${badgeText}</span></td>`;
      } else {
        html += `<td>${value !== null && value !== undefined ? value : '-'}</td>`;
      }
    });

    if (actions) {
      html += '<td><div class="actions-cell">';
      actions.forEach(action => {
        const visible = action.visible ? action.visible(row) : true;
        if (visible) {
          html += `<button class="action-btn ${action.class || ''}" onclick="${action.handler}('${row.id}')" title="${action.title}">${action.icon}</button>`;
        }
      });
      html += '</div></td>';
    }

    html += '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ── Pagination ─────────────────────────────
function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container || totalPages <= 1) return;

  let html = '<div class="pagination">';

  // Prev
  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="${onPageChange}(${currentPage - 1})">&laquo;</button>`;

  // Pages
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);

  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${onPageChange}(${i})">${i}</button>`;
  }

  // Next
  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="${onPageChange}(${currentPage + 1})">&raquo;</button>`;

  html += '</div>';
  container.innerHTML = html;
}

// ── Form Data Extractor ────────────────────
function getFormData(formId) {
  const form = document.getElementById(formId);
  if (!form) return {};

  const data = {};
  form.querySelectorAll('input, select, textarea').forEach(field => {
    if (field.name) {
      if (field.type === 'number') {
        data[field.name] = parseFloat(field.value) || 0;
      } else if (field.type === 'checkbox') {
        data[field.name] = field.checked;
      } else {
        data[field.name] = field.value;
      }
    }
  });
  return data;
}

function setFormData(formId, data) {
  const form = document.getElementById(formId);
  if (!form) return;

  Object.keys(data).forEach(key => {
    const field = form.querySelector(`[name="${key}"]`);
    if (field) {
      if (field.type === 'checkbox') {
        field.checked = !!data[key];
      } else {
        field.value = data[key] !== null && data[key] !== undefined ? data[key] : '';
      }
    }
  });
}

function clearForm(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.reset();
  form.querySelectorAll('input[type="hidden"]').forEach(h => h.value = '');
}

// ── Loading State ──────────────────────────
function showLoading(containerId, message = 'A carregar...') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="loading-spinner" style="margin:0 auto 12px;"></div>
      <p>${message}</p>
    </div>
  `;
}

function showTableLoading(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="table-container">
      <table><tbody><tr><td colspan="10" class="text-center" style="padding:40px;">
        <div class="loading-spinner" style="margin:0 auto 12px;"></div>
        <span style="color:var(--text-muted);font-size:13px;">A carregar dados...</span>
      </td></tr></tbody></table>
    </div>
  `;
}

// ── Sidebar User Card ──────────────────────
function renderUserCard() {
  const user = getStoredUser();
  if (!user) return;

  const userCard = document.getElementById('user-card');
  if (!userCard) return;

  const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U';

  userCard.innerHTML = `
    <div class="user-avatar">${initials}</div>
    <div class="user-info">
      <div class="user-name">${user.name || user.email || 'Utilizador'}</div>
      <div class="user-role">${user.role || 'cashier'}</div>
    </div>
  `;
}

// ── Stats Cards ────────────────────────────
function renderStatsCards(stats) {
  const container = document.getElementById('stats-container');
  if (!container) return;

  const cards = [
    {
      icon: '\u1F4B0', label: 'Vendas Hoje', value: formatMoney(stats.todaySales || 0),
      change: `${formatMoney(stats.todayProfit || 0)} lucro`, color: 'green'
    },
    {
      icon: '\u1F4C8', label: 'Vendas Mês', value: formatMoney(stats.monthSales || 0),
      change: 'Este mês', color: 'blue'
    },
    {
      icon: '\u1F4E6', label: 'Produtos', value: stats.productsCount || 0,
      change: `${stats.lowStockCount || 0} em alerta`, color: 'orange'
    },
    {
      icon: '\u26A0', label: 'Stock Baixo', value: stats.lowStockCount || 0,
      change: 'Necessita atenção', color: 'red'
    }
  ];

  container.innerHTML = cards.map(card => `
    <div class="stat-card">
      <div class="stat-icon ${card.color}">${card.icon}</div>
      <div class="stat-details">
        <div class="stat-label">${card.label}</div>
        <div class="stat-value">${card.value}</div>
        <div class="stat-change ${card.color === 'red' ? 'negative' : 'positive'}">${card.change}</div>
      </div>
    </div>
  `).join('');
}

// ── Fuel Gauge ─────────────────────────────
function renderFuelGauge(containerId, value, max, label) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const pct = max > 0 ? (value / max) * 100 : 0;
  const cls = pct > 50 ? 'high' : pct > 20 ? 'medium' : 'low';

  container.innerHTML = `
    <div style="margin-bottom:8px;display:flex;justify-content:space-between;font-size:12px;">
      <span style="color:var(--text-secondary);">${label}</span>
      <span style="font-weight:600;">${formatNumber(value)} L</span>
    </div>
    <div class="fuel-gauge">
      <div class="fuel-gauge-fill ${cls}" style="width:${Math.min(pct, 100)}%">${pct.toFixed(0)}%</div>
    </div>
  `;
}

// ── Export ─────────────────────────────────
window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window.showConfirm = showConfirm;
window.showSection = showSection;
window.renderTable = renderTable;
window.renderPagination = renderPagination;
window.getFormData = getFormData;
window.setFormData = setFormData;
window.clearForm = clearForm;
window.showLoading = showLoading;
window.showTableLoading = showTableLoading;
window.renderUserCard = renderUserCard;
window.renderStatsCards = renderStatsCards;
window.renderFuelGauge = renderFuelGauge;
