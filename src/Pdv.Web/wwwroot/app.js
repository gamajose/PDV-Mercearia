const root = document.querySelector('#app');

// Utilitários de API
const api = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Erro na requisição');
  return data;
};

// Estado da Aplicação
const state = {
  currentRoute: 'admin',
  products: [],
  customers: [],
  dashboard: null,
  cart: [],
  discount: 0,
  scaleWeight: 0,
  lastItem: null,
  selectedLabelProduct: null,
  labelLayout: 'gondola'
};

// Roteador baseado em URL e Navegação
function getRouteFromPath(path) {
  const clean = path.toLowerCase().replace(/^\/+|\/+$/g, '');
  if (clean === 'pdv' || clean === 'caixa') return 'pdv';
  if (clean === 'etiquetas' || clean === 'labels') return 'etiquetas';
  return 'admin';
}

function navigateTo(route) {
  state.currentRoute = route;
  const path = route === 'admin' ? '/' : `/${route}`;
  if (window.location.pathname !== path) {
    history.pushState(null, '', path);
  }
  render();
}

window.addEventListener('popstate', () => {
  state.currentRoute = getRouteFromPath(window.location.pathname);
  render();
});

// Inicialização
async function boot() {
  state.currentRoute = getRouteFromPath(window.location.pathname);
  try {
    const appState = await api('/api/state');
    const [prods, custs, dash] = await Promise.all([
      api('/api/products').catch(() => []),
      api('/api/customers').catch(() => []),
      api('/api/dashboard').catch(() => null)
    ]);
    state.products = prods || [];
    state.customers = custs || [];
    state.dashboard = dash;
    if (state.products.length > 0) {
      state.selectedLabelProduct = state.products[0];
    }
  } catch (err) {
    console.error('Boot error:', err);
  }
  render();
}

function render() {
  root.innerHTML = `
    <!-- Barra Superior Fixa de Navegação -->
    <header class="top-navbar">
      <div class="brand">
        <div class="logo-box">G</div>
        <div>
          <div class="brand-title">PDV Gama - Ecossistema Varejo</div>
          <div class="brand-sub">${state.dashboard?.companyName || 'Supermercado & Magazine Modelo'}</div>
        </div>
      </div>

      <nav class="nav-links">
        <button class="nav-btn ${state.currentRoute === 'admin' ? 'active' : ''}" onclick="navigateTo('admin')">
          🏢 Retaguarda Geral
        </button>
        <button class="nav-btn ${state.currentRoute === 'pdv' ? 'active' : ''}" onclick="navigateTo('pdv')">
          🛒 Frente de Caixa (PDV)
        </button>
        <button class="nav-btn ${state.currentRoute === 'etiquetas' ? 'active' : ''}" onclick="navigateTo('etiquetas')">
          🏷️ Terminal de Etiquetas
        </button>
      </nav>

      <div class="user-status">
        <span class="status-pill">● Nó Online</span>
        <span>Operador: <b>admin</b></span>
      </div>
    </header>

    <!-- Área de Conteúdo Conforme a Rota -->
    <main id="view-container">
      ${state.currentRoute === 'pdv' ? renderPdvView() : state.currentRoute === 'etiquetas' ? renderLabelsView() : renderAdminView()}
    </main>
  `;

  if (state.currentRoute === 'pdv') {
    attachPdvEvents();
  }
}

// =====================================================================
// 1. TELA DE RETAGUARDA GERAL (/ ou /admin)
// =====================================================================
function renderAdminView() {
  const d = state.dashboard || { salesTotal: 0, sales: 0, products: 0, customers: 0 };
  return `
    <div class="container">
      <div class="metrics-grid">
        <div class="metric-card">
          <span>Total Vendas Hoje</span>
          <strong>R$ ${Number(d.salesTotal).toFixed(2).replace('.', ',')}</strong>
          <small>${d.sales} vendas concluídas</small>
        </div>
        <div class="metric-card">
          <span>Produtos no Catálogo</span>
          <strong>${state.products.length}</strong>
          <small>Supermercado e Roupas</small>
        </div>
        <div class="metric-card">
          <span>Clientes Cadastrados</span>
          <strong>${state.customers.length}</strong>
          <small>Crediário / Fiado ativo</small>
        </div>
        <div class="metric-card">
          <span>Sincronização Matriz/Filial</span>
          <strong>100%</strong>
          <small>Outbox Operacional</small>
        </div>
      </div>

      <!-- Tabela de Produtos Multi-Segmento -->
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Catálogo Multi-Segmento (Supermercado, Roupas, Hortifruti)</h2>
          <button class="nav-btn active" onclick="navigateTo('pdv')">Abrir no Caixa</button>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Código de Barras</th>
                <th>Descrição do Produto</th>
                <th>Categoria</th>
                <th>Grade / Variação</th>
                <th>Preço Venda</th>
                <th>Estoque</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              ${state.products.map(p => `
                <tr>
                  <td><b>${p.sku}</b></td>
                  <td>${p.barcode || (p.pluCode ? `PLU: ${p.pluCode}` : '-')}</td>
                  <td><b>${p.name}</b></td>
                  <td>${p.category || 'Geral'}</td>
                  <td>${p.size ? `Tam: ${p.size} | Cor: ${p.color}` : '-'}</td>
                  <td style="color:#4ade80;font-weight:700;">R$ ${Number(p.salePrice).toFixed(2).replace('.', ',')}</td>
                  <td>${p.quantity} ${p.unit}</td>
                  <td>
                    ${p.isWeighable ? '<span class="badge badge-amber">Balança (Kg)</span>' : p.size ? '<span class="badge badge-blue">Vestuário</span>' : '<span class="badge badge-green">Padrão</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tabela de Clientes e Crediário Próprio -->
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Clientes & Crediário Próprio (Caderneta / Fiado)</h2>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nome do Cliente</th>
                <th>CPF / CNPJ</th>
                <th>Telefone</th>
                <th>Limite de Crédito</th>
                <th>Dívida Atual</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${state.customers.map(c => `
                <tr>
                  <td><b>${c.name}</b></td>
                  <td>${c.cpfCnpj || '-'}</td>
                  <td>${c.phone || '-'}</td>
                  <td>R$ ${Number(c.creditLimit).toFixed(2).replace('.', ',')}</td>
                  <td style="color:${c.currentDebt > 0 ? '#ef4444' : '#22c55e'};font-weight:700;">
                    R$ ${Number(c.currentDebt).toFixed(2).replace('.', ',')}
                  </td>
                  <td>
                    ${c.currentDebt > 0 ? `<button class="nav-btn" style="padding:4px 10px;font-size:12px;background:#16a34a;color:white;" onclick="settleCustomerPrompt('${c.id}', '${c.name}', ${c.currentDebt})">Quitar Dívida</button>` : '<span style="color:#94a3b8;font-size:12px;">Em dia</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// =====================================================================
// 2. TELA DE FRENTE DE CAIXA / CHECKOUT (/pdv ou /caixa)
// =====================================================================
function renderPdvView() {
  const subtotal = state.cart.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const total = Math.max(0, subtotal - state.discount);

  return `
    <div class="pdv-screen">
      <div class="pdv-header">
        <div>
          <span style="font-weight:800;color:#38bdf8;font-size:18px;">CAIXA 01 LIVRE</span>
          <span style="color:#94a3b8;margin-left:14px;font-size:14px;">Supermercado Modelo | Loja Matriz</span>
        </div>
        <div class="pdv-scale-widget">
          <span style="font-size:12px;color:#94a3b8;">BALANÇA CHECKOUT:</span>
          <span class="scale-display">${state.scaleWeight.toFixed(3)} kg</span>
          <button class="nav-btn" style="padding:2px 8px;font-size:11px;" onclick="simulateScale()">Simular Prato</button>
        </div>
      </div>

      <div class="pdv-main">
        <!-- Tabela do Cupom -->
        <div class="pdv-receipt">
          <h3 style="font-size:15px;color:#94a3b8;margin-bottom:12px;font-weight:700;">CUPOM FISCAL / NÃO FISCAL</h3>
          <div class="receipt-items">
            <table class="receipt-table">
              <thead>
                <tr>
                  <th style="width:30px;">#</th>
                  <th>Cód</th>
                  <th>Descrição</th>
                  <th style="text-align:right;">Qtd</th>
                  <th style="text-align:right;">Unitário</th>
                  <th style="text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${state.cart.length === 0 ? `
                  <tr><td colspan="6" style="text-align:center;color:#64748b;padding:40px;">Nenhum item adicionado. Bipe um produto ou use os atalhos abaixo.</td></tr>
                ` : state.cart.map((item, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td><b>${item.sku}</b></td>
                    <td>${item.name}</td>
                    <td style="text-align:right;">${item.quantity.toFixed(3)} ${item.unit}</td>
                    <td style="text-align:right;">R$ ${item.unitPrice.toFixed(2).replace('.', ',')}</td>
                    <td style="text-align:right;font-weight:700;color:#38bdf8;">R$ ${(item.quantity * item.unitPrice).toFixed(2).replace('.', ',')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Painel Lateral: Item Atual e Total Gigante -->
        <div class="pdv-sidebar">
          <div class="pdv-active-item">
            <div class="label">ÚLTIMO ITEM BIPADO</div>
            <div class="name">${state.lastItem ? state.lastItem.name.toUpperCase() : 'AGUARDANDO ITEM'}</div>
            <div class="details">
              <div>
                <span class="label">QUANTIDADE</span>
                <p style="font-size:20px;font-weight:800;color:#38bdf8;">${state.lastItem ? state.lastItem.quantity.toFixed(3) : '1,000'} ${state.lastItem ? state.lastItem.unit : 'UN'}</p>
              </div>
              <div>
                <span class="label">VALOR UNITÁRIO</span>
                <p style="font-size:20px;font-weight:800;color:#38bdf8;">R$ ${state.lastItem ? state.lastItem.unitPrice.toFixed(2).replace('.', ',') : '0,00'}</p>
              </div>
            </div>
          </div>

          <div class="pdv-total-box">
            <div class="row">
              <span>SUBTOTAL:</span>
              <span>R$ ${subtotal.toFixed(2).replace('.', ',')}</span>
            </div>
            <div class="row">
              <span>DESCONTO:</span>
              <span style="color:#ef4444;">- R$ ${state.discount.toFixed(2).replace('.', ',')}</span>
            </div>
            <hr style="border:0;border-top:1px solid #334155;margin:10px 0;" />
            <div style="font-weight:800;color:#38bdf8;font-size:16px;">TOTAL A PAGAR:</div>
            <div class="total-giant">R$ ${total.toFixed(2).replace('.', ',')}</div>
          </div>
        </div>
      </div>

      <!-- Barra de Leitura: Código de Barras / PLU -->
      <div class="pdv-input-bar">
        <label for="barcode-field">CÓDIGO DE BARRAS / SKU / PLU:</label>
        <input id="barcode-field" class="pdv-input" placeholder="Ex: 101, 102, 301, 7891000100103 ou 2001230015505 (Balança)" autofocus autocomplete="off" />
        <button class="nav-btn active" style="padding:12px 24px;font-size:16px;" onclick="handleBarcodeSubmit()">Adicionar</button>
      </div>

      <!-- Atalhos de Teclado F1-F10 -->
      <div class="pdv-shortcuts">
        <button class="shortcut-btn" onclick="openSearchModal()">[F2] Buscar Prod</button>
        <button class="shortcut-btn" onclick="applyScaleToCart()">[F3] Pesar Balança</button>
        <button class="shortcut-btn" onclick="applyDiscountPrompt()">[F4] Desconto</button>
        <button class="shortcut-btn" onclick="cancelLastItem()">[F5] Cancelar Item</button>
        <button class="shortcut-btn btn-cancel" onclick="cancelEntireSale()">[F6] Cancelar Venda</button>
        <button class="shortcut-btn btn-pay" onclick="openPaymentModal()">[F10] Pagamento</button>
        <button class="shortcut-btn" onclick="navigateTo('admin')">[ESC] Voltar</button>
      </div>
    </div>
  `;
}

function attachPdvEvents() {
  const input = document.getElementById('barcode-field');
  if (input) {
    input.focus();
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        handleBarcodeSubmit();
      }
    };
  }

  window.onkeydown = (e) => {
    if (state.currentRoute !== 'pdv') return;
    if (e.key === 'F2') { e.preventDefault(); openSearchModal(); }
    if (e.key === 'F3') { e.preventDefault(); applyScaleToCart(); }
    if (e.key === 'F4') { e.preventDefault(); applyDiscountPrompt(); }
    if (e.key === 'F5') { e.preventDefault(); cancelLastItem(); }
    if (e.key === 'F6') { e.preventDefault(); cancelEntireSale(); }
    if (e.key === 'F10') { e.preventDefault(); openPaymentModal(); }
    if (e.key === 'Escape') { e.preventDefault(); navigateTo('admin'); }
  };
}

function handleBarcodeSubmit() {
  const input = document.getElementById('barcode-field');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;

  addItemByCode(raw);
  input.value = '';
  input.focus();
}

function addItemByCode(raw) {
  let product = null;
  let quantity = 1.0;
  let unitPrice = 0;

  // Lógica de decodificação EAN-13 com flag 2 para balanças de supermercado
  if (raw.length === 13 && raw.startsWith('2')) {
    const plu = String(parseInt(raw.substring(1, 6), 10)); // Ex: 00123 -> 123
    const valRaw = parseInt(raw.substring(6, 12), 10);
    const embeddedPrice = valRaw / 100.0; // Ex: 001550 -> R$ 15,50

    product = state.products.find(p => p.pluCode === plu || p.sku === plu);
    if (product) {
      unitPrice = product.salePrice;
      quantity = unitPrice > 0 ? (embeddedPrice / unitPrice) : 1;
    }
  } else {
    product = state.products.find(p =>
      p.sku.toLowerCase() === raw.toLowerCase() ||
      (p.barcode && p.barcode === raw) ||
      (p.pluCode && p.pluCode === raw)
    );
    if (product) {
      unitPrice = product.salePrice;
      if (product.isWeighable && state.scaleWeight > 0) {
        quantity = state.scaleWeight;
      }
    }
  }

  if (!product) {
    alert(`Produto não encontrado para o código: ${raw}\nDica: Tente 101 (Arroz), 102 (Feijão), 201 (Picanha), 301 (Camisa Polo) ou 2001230015505 (Etiqueta Balança).`);
    return;
  }

  const cartItem = {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    unit: product.unit,
    quantity: quantity,
    unitPrice: unitPrice
  };

  state.cart.push(cartItem);
  state.lastItem = cartItem;
  render();
}

function simulateScale() {
  const weights = [0.0, 0.450, 1.250, 2.500, 3.820];
  const next = weights[(weights.indexOf(state.scaleWeight) + 1) % weights.length];
  state.scaleWeight = next;
  render();
}

function applyScaleToCart() {
  if (state.scaleWeight <= 0) {
    simulateScale();
  }
  alert(`Peso capturado da Balança: ${state.scaleWeight.toFixed(3)} kg.`);
}

function applyDiscountPrompt() {
  const val = prompt('Informe o valor do desconto (R$):', state.discount || '5.00');
  if (val !== null) {
    state.discount = parseFloat(val) || 0;
    render();
  }
}

function cancelLastItem() {
  if (state.cart.length > 0) {
    state.cart.pop();
    state.lastItem = state.cart[state.cart.length - 1] || null;
    render();
  }
}

function cancelEntireSale() {
  if (confirm('Deseja realmente cancelar a venda inteira?')) {
    state.cart = [];
    state.discount = 0;
    state.lastItem = null;
    render();
  }
}

function openSearchModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:700px;">
      <h3 class="modal-title">Busca Rápida de Produtos [F2]</h3>
      <div style="max-height:380px;overflow-y:auto;">
        <table class="data-table">
          <thead>
            <tr><th>SKU</th><th>Descrição</th><th>Preço</th><th>Ação</th></tr>
          </thead>
          <tbody>
            ${state.products.map(p => `
              <tr>
                <td><b>${p.sku}</b></td>
                <td>${p.name} ${p.size ? `(${p.size})` : ''}</td>
                <td style="color:#22c55e;font-weight:700;">R$ ${Number(p.salePrice).toFixed(2).replace('.', ',')}</td>
                <td>
                  <button class="nav-btn active" style="padding:4px 10px;font-size:12px;" onclick="addItemByCode('${p.sku}'); document.body.removeChild(this.closest('.modal-overlay'));">Adicionar</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <button class="nav-btn" style="margin-top:14px;width:100%;" onclick="document.body.removeChild(this.closest('.modal-overlay'))">Fechar</button>
    </div>
  `;
  document.body.appendChild(modal);
}

function openPaymentModal() {
  if (state.cart.length === 0) {
    alert('Nenhum item na venda.');
    return;
  }

  const subtotal = state.cart.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0);
  const total = Math.max(0, subtotal - state.discount);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <h3 class="modal-title">Finalização de Venda [F10]</h3>
      <div style="font-size:24px;font-weight:900;color:#22c55e;margin-bottom:18px;">Total: R$ ${total.toFixed(2).replace('.', ',')}</div>

      <div class="form-group">
        <label>Forma de Pagamento:</label>
        <select id="pay-method" class="form-control" onchange="handlePaymentMethodChange(this.value, ${total})">
          <option value="Dinheiro">Dinheiro</option>
          <option value="Pix">PIX Dinâmico</option>
          <option value="CartaoDebito">Cartão de Débito</option>
          <option value="CartaoCredito">Cartão de Crédito</option>
          <option value="Crediario">Crediário Próprio (Fiado)</option>
        </select>
      </div>

      <div id="dinheiro-panel" class="form-group">
        <label>Valor Recebido em Dinheiro (R$):</label>
        <input id="received-amount" class="form-control" type="number" step="0.50" value="${Math.ceil(total)}" oninput="calcChange(${total})" />
        <div style="font-size:18px;font-weight:700;color:#38bdf8;margin-top:8px;">
          Troco: <span id="change-display">R$ ${(Math.ceil(total) - total).toFixed(2).replace('.', ',')}</span>
        </div>
      </div>

      <div id="pix-panel" class="form-group" style="display:none;text-align:center;">
        <div style="background:white;color:black;padding:12px;border-radius:8px;display:inline-block;margin:6px 0;">
          <div style="font-family:monospace;font-size:11px;">[QR CODE PIX DINÂMICO]</div>
          <div style="width:140px;height:140px;background:#000;margin:6px auto;display:flex;align-items:center;justify-content:center;color:#fff;">QR CODE</div>
          <div style="font-size:12px;font-weight:700;">Chave: 12.345.678/0001-90</div>
        </div>
      </div>

      <div id="crediario-panel" class="form-group" style="display:none;">
        <label>Vincular Cliente (Crediário Próprio):</label>
        <select id="customer-select" class="form-control">
          ${state.customers.map(c => `
            <option value="${c.id}">${c.name} (Limite: R$ ${c.creditLimit.toFixed(2)} | Dívida: R$ ${c.currentDebt.toFixed(2)})</option>
          `).join('')}
        </select>
      </div>

      <div style="display:flex;gap:10px;margin-top:20px;">
        <button class="btn-primary" onclick="confirmPayment(${total})">Confirmar Pagamento</button>
        <button class="nav-btn" onclick="document.body.removeChild(this.closest('.modal-overlay'))">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.handlePaymentMethodChange = (val, total) => {
  document.getElementById('dinheiro-panel').style.display = val === 'Dinheiro' ? 'block' : 'none';
  document.getElementById('pix-panel').style.display = val === 'Pix' ? 'block' : 'none';
  document.getElementById('crediario-panel').style.display = val === 'Crediario' ? 'block' : 'none';
};

window.calcChange = (total) => {
  const rec = parseFloat(document.getElementById('received-amount').value) || 0;
  const change = Math.max(0, rec - total);
  document.getElementById('change-display').textContent = `R$ ${change.toFixed(2).replace('.', ',')}`;
};

async function confirmPayment(total) {
  const method = document.getElementById('pay-method').value;
  let customerId = null;
  let customerName = null;

  if (method === 'Crediario') {
    const custSel = document.getElementById('customer-select');
    customerId = custSel.value;
    customerName = custSel.options[custSel.selectedIndex].text.split('(')[0].trim();
  }

  const rec = parseFloat(document.getElementById('received-amount')?.value) || total;
  const change = Math.max(0, rec - total);

  try {
    const payload = {
      total: total,
      discount: state.discount,
      change: change,
      paymentMethod: method,
      operatorName: 'Caixa 01',
      customerId: customerId,
      customerName: customerName,
      items: state.cart.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice
      }))
    };

    const res = await api('/api/sales/complete', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    // Remove o modal
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) document.body.removeChild(overlay);

    // Emite comprovante
    showReceiptModal(res, state.cart, total, state.discount, change, method);

    // Limpa carrinho
    state.cart = [];
    state.discount = 0;
    state.lastItem = null;

    // Atualiza dados
    const prods = await api('/api/products');
    const custs = await api('/api/customers');
    const dash = await api('/api/dashboard');
    state.products = prods;
    state.customers = custs;
    state.dashboard = dash;
    render();

  } catch (err) {
    alert(`Erro ao finalizar: ${err.message}`);
  }
}

function showReceiptModal(saleResult, items, total, discount, change, method) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="background:#fff;color:#000;font-family:monospace;max-width:440px;">
      <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:10px;">
        <h3 style="margin:0;font-size:16px;">SUPERMERCADO & MAGAZINE MODELO</h3>
        <p style="margin:2px 0;font-size:12px;">CNPJ: 12.345.678/0001-90</p>
        <p style="margin:2px 0;font-size:12px;">Av. Brasil, 1000 - Centro</p>
        <h4 style="margin:8px 0 0 0;font-size:14px;">COMPROVANTE NÃO FISCAL</h4>
        <p style="margin:2px 0;font-size:11px;">Venda #${saleResult.number} - ${new Date().toLocaleString('pt-BR')}</p>
      </div>

      <div style="padding:10px 0;border-bottom:1px dashed #000;font-size:12px;">
        ${items.map((item, idx) => `
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>#${idx+1} ${item.name.substring(0, 20)}</span>
            <span>${item.quantity.toFixed(3)} x ${item.unitPrice.toFixed(2)}</span>
            <span style="font-weight:bold;">${(item.quantity * item.unitPrice).toFixed(2)}</span>
          </div>
        `).join('')}
      </div>

      <div style="padding:10px 0;border-bottom:1px dashed #000;font-size:13px;">
        ${discount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Desconto:</span><span>- R$ ${discount.toFixed(2)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:bold;">
          <span>TOTAL:</span>
          <span>R$ ${total.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;">
          <span>Forma: ${method}</span>
          <span>Troco: R$ ${change.toFixed(2)}</span>
        </div>
      </div>

      <div style="text-align:center;padding-top:10px;font-size:11px;">
        <p>Obrigado pela preferência! Volte sempre.</p>
        <p>PDV Gama - Automação Comercial</p>
        <button class="nav-btn active" style="margin-top:12px;width:100%;background:#0f172a;" onclick="document.body.removeChild(this.closest('.modal-overlay'))">Fechar e Continuar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// =====================================================================
// 3. TELA DE TERMINAL DE ETIQUETAS & BALCÃO (/etiquetas ou /labels)
// =====================================================================
function renderLabelsView() {
  const p = state.selectedLabelProduct || state.products[0] || {
    name: 'Produto Exemplo',
    sku: '101',
    barcode: '7891000100103',
    salePrice: 29.90,
    unit: 'UN',
    size: 'M',
    color: 'Azul'
  };

  const zplCode = `^XA
^CI28
^FO30,25^A0N,28,26^FD${p.name}^FS
^FO30,65^A0N,20,18^FDCod: ${p.sku} (${p.unit})^FS
^FO420,55^A0N,60,55^FDR$ ${Number(p.salePrice).toFixed(2).replace('.', ',')}^FS
^BY2,3,55^FO30,105^BCN,55,Y,N,N^FD${p.barcode || p.sku}^FS
^FO30,190^A0N,16,14^FDImpresso em: ${new Date().toLocaleDateString('pt-BR')}^FS
^XZ`;

  return `
    <div class="labels-screen">
      <div class="panel">
        <h2 class="panel-title" style="margin-bottom:6px;">Terminal de Etiquetas & Consulta de Preços</h2>
        <p style="color:#94a3b8;font-size:13px;">Geração instantânea de etiquetas para gôndolas de supermercado, vestuário/confecção e código de barras.</p>
      </div>

      <div class="labels-grid">
        <!-- Lista de Produtos para Seleção -->
        <div class="panel">
          <h3 style="font-size:15px;margin-bottom:12px;color:#38bdf8;">1. Selecione o Produto no Catálogo:</h3>
          <div class="table-responsive" style="max-height:450px;">
            <table class="data-table">
              <thead>
                <tr><th>SKU</th><th>Descrição</th><th>Preço</th><th>Ação</th></tr>
              </thead>
              <tbody>
                ${state.products.map(prod => `
                  <tr style="${state.selectedLabelProduct?.id === prod.id ? 'background:rgba(37,99,235,0.2);' : ''}">
                    <td><b>${prod.sku}</b></td>
                    <td>${prod.name} ${prod.size ? `(${prod.size})` : ''}</td>
                    <td style="color:#22c55e;font-weight:700;">R$ ${Number(prod.salePrice).toFixed(2).replace('.', ',')}</td>
                    <td>
                      <button class="nav-btn ${state.selectedLabelProduct?.id === prod.id ? 'active' : ''}" style="padding:4px 10px;font-size:12px;" onclick="selectLabelProduct('${prod.id}')">Selecionar</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Painel de Preview e Configuração da Etiqueta -->
        <div class="panel">
          <h3 style="font-size:15px;margin-bottom:12px;color:#38bdf8;">2. Formato e Pré-visualização:</h3>
          
          <div class="form-group">
            <label>Modelo da Etiqueta:</label>
            <select class="form-control" onchange="changeLabelLayout(this.value)">
              <option value="gondola" ${state.labelLayout === 'gondola' ? 'selected' : ''}>Gôndola Supermercado (100x30mm)</option>
              <option value="vestuario" ${state.labelLayout === 'vestuario' ? 'selected' : ''}>Vestuário / Grade (Tamanho & Cor)</option>
              <option value="padrao" ${state.labelLayout === 'padrao' ? 'selected' : ''}>Produto com Código de Barras Padrão</option>
            </select>
          </div>

          <!-- Preview Real da Etiqueta -->
          <div style="font-size:12px;color:#94a3b8;margin-top:14px;">PREVIEW EM TEMPO REAL:</div>
          <div class="label-preview-card ${state.labelLayout}">
            <div>
              <div class="p-title">${p.name}</div>
              ${state.labelLayout === 'vestuario' ? `
                <div style="font-size:13px;font-weight:700;color:#2563eb;margin-top:4px;">
                  TAMANHO: ${p.size || 'M'} | COR: ${p.color || 'ÚNICA'}
                </div>
              ` : `
                <div style="font-size:12px;color:#555;margin-top:2px;">Cód: ${p.sku} (${p.unit})</div>
              `}
            </div>
            
            <div class="label-barcode-mock"></div>
            
            <div style="display:flex;justify-content:space-between;align-items:flex-end;">
              <span style="font-size:11px;color:#555;">${p.barcode || p.sku}</span>
              <div class="p-price">R$ ${Number(p.salePrice).toFixed(2).replace('.', ',')}</div>
            </div>
          </div>

          <!-- Código Nativo Zebra ZPL / EPL -->
          <details style="margin-top:16px;">
            <summary style="cursor:pointer;color:#38bdf8;font-size:13px;font-weight:600;">Ver Código Nativo ZPL II / EPL2</summary>
            <textarea class="form-control" style="font-family:monospace;font-size:12px;height:120px;margin-top:8px;" readonly>${zplCode}</textarea>
          </details>

          <button class="btn-primary" style="margin-top:16px;" onclick="alert('Comando de impressão enviado com sucesso para a impressora de etiquetas!')">
            Imprimir Etiqueta
          </button>
        </div>
      </div>
    </div>
  `;
}

window.selectLabelProduct = (id) => {
  state.selectedLabelProduct = state.products.find(p => p.id === id);
  render();
};

window.changeLabelLayout = (layout) => {
  state.labelLayout = layout;
  render();
};

window.settleCustomerPrompt = async (id, name, debt) => {
  const val = prompt(`Quitar dívida de ${name} (Atual: R$ ${debt.toFixed(2)}):`, debt.toFixed(2));
  if (val) {
    const amt = parseFloat(val);
    if (amt > 0) {
      await api(`/api/customers/${id}/settle`, {
        method: 'POST',
        body: JSON.stringify({ amount: amt })
      });
      alert('Quitação registrada com sucesso no crediário!');
      state.customers = await api('/api/customers');
      render();
    }
  }
};

window.navigateTo = navigateTo;
boot();
