/* ============================================
   PRODUCTS MODULE - Official Shop Administration ERP
   ============================================ */

let productsList = [];
let categoriesList = [];
let currentProductPage = 1;
const PRODUCTS_PER_PAGE = 15;

// ── Load Products ──────────────────────────
async function loadProducts(page = 1) {
  currentProductPage = page;
  showTableLoading('products-table-container');

  try {
    const offset = (page - 1) * PRODUCTS_PER_PAGE;
    const { data, count } = await getSupabase()
      .from('products')
      .select('*, categories(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + PRODUCTS_PER_PAGE - 1);

    productsList = data || [];

    renderProductsTable();
    const totalPages = Math.ceil((count || 0) / PRODUCTS_PER_PAGE);
    renderPagination('products-pagination', page, totalPages, 'loadProducts');
  } catch (e) {
    showToast('error', 'Erro ao carregar produtos: ' + e.message);
    document.getElementById('products-table-container').innerHTML = '';
  }
}

function renderProductsTable() {
  const search = (document.getElementById('product-search')?.value || '').toLowerCase();
  const filtered = productsList.filter(p =>
    (p.name || '').toLowerCase().includes(search) ||
    (p.categories?.name || '').toLowerCase().includes(search)
  );

  renderTable('products-table-container',
    [
      { label: 'Nome', field: 'name' },
      { label: 'Categoria', field: 'category_name', format: (_, row) => row.categories?.name || '-' },
      { label: 'Unidade', field: 'unit_type' },
      { label: 'Preço Compra', field: 'purchase_price', format: v => formatMoney(v) },
      { label: 'Preço Venda', field: 'sale_price', format: v => formatMoney(v) },
      { label: 'Margem', field: 'margin', format: (_, row) => calculateMargin(row.sale_price, row.purchase_price).toFixed(1) + '%' }
    ],
    filtered,
    [
      { icon: '\u270E', title: 'Editar', handler: 'editProduct' },
      { icon: '\u1F5D1', title: 'Eliminar', handler: 'deleteProduct', class: 'delete' }
    ]
  );
}

// ── Product CRUD ───────────────────────────
async function saveProduct() {
  try {
    const id = document.getElementById('product-id').value;
    const data = {
      name: document.getElementById('product-name').value.trim(),
      category_id: document.getElementById('product-category').value || null,
      unit_type: document.getElementById('product-unit').value,
      purchase_price: parseFloat(document.getElementById('product-purchase').value) || 0,
      sale_price: parseFloat(document.getElementById('product-sale').value) || 0,
      location: document.getElementById('product-location')?.value || 'warehouse',
      min_stock: parseFloat(document.getElementById('product-min-stock')?.value) || 5
    };

    validateRequired(data.name, 'Nome do produto');
    validatePositiveNumber(data.sale_price, 'Preço de venda');

    if (id) {
      const old = productsList.find(p => p.id === id);
      await updateRecord('products', id, data);
      await logAudit('UPDATE', 'products', old, data);
      showToast('success', 'Produto atualizado com sucesso');
    } else {
      const created = await insertRecord('products', data);
      // Create stock entry with 0
      await insertRecord('stock', { product_id: created.id, warehouse_qty: 0, store_qty: 0 });
      await logAudit('CREATE', 'products', null, created);
      showToast('success', 'Produto criado com sucesso');
    }

    closeModal('product-modal');
    loadProducts(currentProductPage);
    loadCategoriesSelect();
  } catch (e) {
    showToast('error', e.message);
  }
}

function editProduct(id) {
  const product = productsList.find(p => p.id === id);
  if (!product) return;

  document.getElementById('product-id').value = product.id;
  document.getElementById('product-name').value = product.name || '';
  document.getElementById('product-category').value = product.category_id || '';
  document.getElementById('product-unit').value = product.unit_type || 'unit';
  document.getElementById('product-purchase').value = product.purchase_price || '';
  document.getElementById('product-sale').value = product.sale_price || '';
  if (document.getElementById('product-min-stock')) {
    document.getElementById('product-min-stock').value = product.min_stock || 5;
  }

  document.getElementById('product-modal-title').textContent = 'Editar Produto';
  openModal('product-modal');
}

function newProduct() {
  document.getElementById('product-form').reset();
  document.getElementById('product-id').value = '';
  document.getElementById('product-modal-title').textContent = 'Novo Produto';
  openModal('product-modal');
}

function deleteProduct(id) {
  showConfirm('Eliminar Produto', 'Tem certeza que deseja eliminar este produto?', async () => {
    try {
      await deleteRecord('products', id);
      await logAudit('DELETE', 'products', { id }, null);
      showToast('success', 'Produto eliminado');
      loadProducts(currentProductPage);
    } catch (e) {
      showToast('error', 'Erro ao eliminar: ' + e.message);
    }
  });
}

// ── Categories ─────────────────────────────
async function loadCategories() {
  try {
    categoriesList = await fetchAll('categories', { order: { column: 'name', ascending: true } });
    renderCategoriesTable();
    loadCategoriesSelect();
  } catch (e) {
    showToast('error', 'Erro ao carregar categorias');
  }
}

function renderCategoriesTable() {
  const container = document.getElementById('categories-table-container');
  if (!container) return;

  if (!categoriesList.length) {
    container.innerHTML = '<div class="empty-state"><h3>Sem categorias</h3></div>';
    return;
  }

  let html = '<div class="table-container"><table><thead><tr><th>Nome</th><th>A\u00e7\u00f5es</th></tr></thead><tbody>';
  categoriesList.forEach(cat => {
    html += `<tr>
      <td>${cat.name}</td>
      <td><div class="actions-cell">
        <button class="action-btn" onclick="editCategory('${cat.id}')" title="Editar">\u270E</button>
        <button class="action-btn delete" onclick="deleteCategory('${cat.id}')" title="Eliminar">\u1F5D1</button>
      </div></td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

async function saveCategory() {
  try {
    const id = document.getElementById('category-id').value;
    const data = { name: document.getElementById('category-name').value.trim() };
    validateRequired(data.name, 'Nome da categoria');

    if (id) {
      await updateRecord('categories', id, data);
      showToast('success', 'Categoria atualizada');
    } else {
      await insertRecord('categories', data);
      showToast('success', 'Categoria criada');
    }

    closeModal('category-modal');
    loadCategories();
  } catch (e) {
    showToast('error', e.message);
  }
}

function newCategory() {
  document.getElementById('category-form').reset();
  document.getElementById('category-id').value = '';
  openModal('category-modal');
}

function editCategory(id) {
  const cat = categoriesList.find(c => c.id === id);
  if (!cat) return;
  document.getElementById('category-id').value = cat.id;
  document.getElementById('category-name').value = cat.name;
  openModal('category-modal');
}

function deleteCategory(id) {
  showConfirm('Eliminar Categoria', 'Deseja eliminar esta categoria?', async () => {
    try {
      await deleteRecord('categories', id);
      showToast('success', 'Categoria eliminada');
      loadCategories();
    } catch (e) {
      showToast('error', 'Erro: ' + e.message);
    }
  });
}

function loadCategoriesSelect() {
  document.querySelectorAll('.category-select').forEach(select => {
    const val = select.value;
    select.innerHTML = '<option value="">Selecionar...</option>' +
      categoriesList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    select.value = val;
  });
}

// ── Search ─────────────────────────────────
function setupProductSearch() {
  const search = document.getElementById('product-search');
  if (search) {
    search.addEventListener('input', () => {
      renderProductsTable();
    });
  }
}

// ── Export ─────────────────────────────────
window.loadProducts = loadProducts;
window.renderProductsTable = renderProductsTable;
window.saveProduct = saveProduct;
window.editProduct = editProduct;
window.newProduct = newProduct;
window.deleteProduct = deleteProduct;
window.loadCategories = loadCategories;
window.renderCategoriesTable = renderCategoriesTable;
window.saveCategory = saveCategory;
window.newCategory = newCategory;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.loadCategoriesSelect = loadCategoriesSelect;
window.setupProductSearch = setupProductSearch;
