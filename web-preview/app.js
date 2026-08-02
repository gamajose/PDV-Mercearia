const products = [
  { id: 1, name: 'Arroz Tipo 1 5kg', code: '7891000100103', category: 'Mercearia', unit: 'UN', price: 24.9, stock: 42, icon: 'grocery' },
  { id: 2, name: 'Feijão Carioca 1kg', code: '7891000200209', category: 'Mercearia', unit: 'UN', price: 8.79, stock: 18, icon: 'nutrition' },
  { id: 3, name: 'Leite Integral 1L', code: '7891000300305', category: 'Bebidas', unit: 'UN', price: 5.49, stock: 63, icon: 'water_full' },
  { id: 4, name: 'Café Tradicional 500g', code: '7891000400401', category: 'Mercearia', unit: 'UN', price: 16.9, stock: 9, icon: 'coffee' },
  { id: 5, name: 'Banana Prata', code: '2000000000017', category: 'Hortifruti', unit: 'KG', price: 6.99, stock: 12.4, icon: 'nutrition' },
  { id: 6, name: 'Refrigerante Cola 2L', code: '7891000600606', category: 'Bebidas', unit: 'UN', price: 10.99, stock: 28, icon: 'local_drink' },
  { id: 7, name: 'Detergente Neutro 500ml', code: '7891000700702', category: 'Limpeza', unit: 'UN', price: 2.89, stock: 7, icon: 'cleaning_services' },
  { id: 8, name: 'Óleo de Soja 900ml', code: '7891000800808', category: 'Mercearia', unit: 'UN', price: 7.49, stock: 31, icon: 'oil_barrel' }
];

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const cart = [];

function activateView(viewName) {
  document.querySelectorAll('.nav-button').forEach(button => {
    button.classList.toggle('active', button.dataset.view === viewName);
  });
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  const target = document.getElementById(`${viewName}-view`);
  if (!target) return;
  target.classList.add('active');
  document.getElementById('page-title').textContent = target.dataset.title;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => activateView(button.dataset.view));
});
document.querySelectorAll('[data-open]').forEach(button => {
  button.addEventListener('click', () => activateView(button.dataset.open));
});

function renderChart() {
  const svg = document.getElementById('sales-chart');
  const values = [12, 18, 26, 21, 42, 58, 51, 69, 62, 84, 77, 93];
  const labels = ['08h', '09h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h', '19h'];
  const width = 800;
  const height = 260;
  const padding = { top: 20, right: 18, bottom: 34, left: 38 };
  const max = 100;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const x = index => padding.left + (innerWidth / (values.length - 1)) * index;
  const y = value => padding.top + innerHeight - (value / max) * innerHeight;
  const line = values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(value)}`).join(' ');
  const area = `${line} L ${x(values.length - 1)} ${padding.top + innerHeight} L ${x(0)} ${padding.top + innerHeight} Z`;
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const gy = padding.top + (innerHeight / 4) * i;
    grid += `<line x1="${padding.left}" y1="${gy}" x2="${width - padding.right}" y2="${gy}" stroke="#edf0f5" stroke-width="1" />`;
  }
  const dots = values.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4" fill="#fff" stroke="#2563eb" stroke-width="3"><title>${labels[index]} · ${value} vendas</title></circle>`).join('');
  const axisLabels = labels.map((label, index) => `<text x="${x(index)}" y="${height - 8}" text-anchor="middle" fill="#8b97aa" font-size="10" font-family="Inter">${label}</text>`).join('');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2563eb" stop-opacity=".18" />
        <stop offset="100%" stop-color="#2563eb" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#chart-fill)" />
    <path d="${line}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    ${dots}${axisLabels}
  `;
}

function renderProductCards(filter = '') {
  const normalized = filter.trim().toLocaleLowerCase('pt-BR');
  const visible = products.filter(product => !normalized || product.name.toLocaleLowerCase('pt-BR').includes(normalized) || product.code.includes(normalized));
  document.getElementById('product-grid').innerHTML = visible.map(product => `
    <button class="product-card" data-product-id="${product.id}">
      <div class="product-thumb"><span class="material-symbols-rounded">${product.icon}</span></div>
      <strong>${product.name}</strong>
      <small>${product.unit === 'KG' ? 'Venda por peso' : `${product.stock} em estoque`}</small>
      <b>${money.format(product.price)}${product.unit === 'KG' ? '/kg' : ''}</b>
    </button>
  `).join('');
  document.querySelectorAll('[data-product-id]').forEach(button => button.addEventListener('click', () => addToCart(Number(button.dataset.productId))));
}

function renderProductsTable() {
  document.getElementById('products-table').innerHTML = products.map(product => `
    <tr>
      <td><div class="product-name-cell"><div class="mini-thumb"><span class="material-symbols-rounded">${product.icon}</span></div><strong>${product.name}</strong></div></td>
      <td>${product.code}</td><td>${product.category}</td><td>${product.unit}</td><td>${money.format(product.price)}</td>
      <td><span class="tag success">Ativo</span></td>
      <td><button class="table-more" aria-label="Mais opções"><span class="material-symbols-rounded">more_horiz</span></button></td>
    </tr>
  `).join('');
}

function renderInventory() {
  document.getElementById('inventory-grid').innerHTML = products.map(product => {
    const max = product.unit === 'KG' ? 40 : 70;
    const percent = Math.min(100, Math.round((Number(product.stock) / max) * 100));
    const state = percent < 15 ? 'critical' : percent < 30 ? 'low' : '';
    const tag = state === 'critical' ? '<span class="tag danger">Crítico</span>' : state === 'low' ? '<span class="tag warning">Baixo</span>' : '<span class="tag success">Normal</span>';
    return `<article class="inventory-card ${state}">
      <header><div><strong>${product.name}</strong><small>${product.code}</small></div>${tag}</header>
      <div class="stock-row"><b>${String(product.stock).replace('.', ',')} ${product.unit}</b><span>Mínimo: ${product.unit === 'KG' ? '8' : '10'} ${product.unit}</span></div>
      <div class="stock-track"><span style="width:${percent}%"></span></div>
    </article>`;
  }).join('');
}

function addToCart(productId) {
  const product = products.find(item => item.id === productId);
  const existing = cart.find(item => item.id === productId);
  if (existing) existing.quantity += product.unit === 'KG' ? 0.25 : 1;
  else cart.push({ ...product, quantity: product.unit === 'KG' ? 0.5 : 1 });
  renderCart();
}

function renderCart() {
  const list = document.getElementById('cart-list');
  if (!cart.length) {
    list.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">shopping_basket</span><strong>Nenhum item</strong><small>Selecione um produto para começar</small></div>';
  } else {
    list.innerHTML = cart.map(item => `<div class="cart-item"><div><strong>${item.name}</strong><small>${String(item.quantity).replace('.', ',')} ${item.unit} × ${money.format(item.price)}</small></div><b>${money.format(item.quantity * item.price)}</b></div>`).join('');
  }
  const quantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
  document.getElementById('cart-count').textContent = `${String(quantity).replace('.', ',')} ${quantity === 1 ? 'item' : 'itens'}`;
  document.getElementById('subtotal').textContent = money.format(total);
  document.getElementById('cart-total').textContent = money.format(total);
}

function showToast(text) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-text').textContent = text;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

document.getElementById('product-search').addEventListener('input', event => renderProductCards(event.target.value));
document.getElementById('clear-cart').addEventListener('click', () => { cart.splice(0); renderCart(); });
document.getElementById('finish-sale').addEventListener('click', () => {
  if (!cart.length) return showToast('Adicione itens antes de finalizar');
  cart.splice(0);
  renderCart();
  showToast('Venda concluída · comprovante não fiscal gerado');
});

document.querySelectorAll('.category').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.category').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    const filter = button.textContent === 'Todos' ? '' : button.textContent;
    const visible = products.filter(product => !filter || product.category === filter);
    document.getElementById('product-grid').innerHTML = visible.map(product => `
      <button class="product-card" data-product-id="${product.id}"><div class="product-thumb"><span class="material-symbols-rounded">${product.icon}</span></div><strong>${product.name}</strong><small>${product.unit === 'KG' ? 'Venda por peso' : `${product.stock} em estoque`}</small><b>${money.format(product.price)}${product.unit === 'KG' ? '/kg' : ''}</b></button>
    `).join('');
    document.querySelectorAll('[data-product-id]').forEach(item => item.addEventListener('click', () => addToCart(Number(item.dataset.productId))));
  });
});

const updateDialog = document.getElementById('update-dialog');
document.getElementById('update-button').addEventListener('click', () => updateDialog.showModal());
document.getElementById('close-dialog').addEventListener('click', () => updateDialog.close());
updateDialog.addEventListener('click', event => { if (event.target === updateDialog) updateDialog.close(); });

document.addEventListener('keydown', event => {
  if (event.key === 'F2') { event.preventDefault(); activateView('sale'); document.getElementById('product-search').focus(); }
  if (event.key === 'F10') { event.preventDefault(); document.getElementById('finish-sale').click(); }
});

renderChart();
renderProductCards();
renderProductsTable();
renderInventory();
renderCart();
