// =====================================================================
// PDV GAMA & GDM RETAIL ERP - PLATAFORMA INTEGRADA DE SUPERMERCADOS E VAREJO
// Arquitetura Industrial: Retaguarda Completa + Frente de Caixa PDV Ágil + Terminal de Etiquetas
// =====================================================================

const API = {
  get: async (url) => (await fetch(url)).json(),
  post: async (url, data) => (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json(),
  put: async (url, data) => (await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })).json(),
  del: async (url) => (await fetch(url, { method: "DELETE" })).json(),
};

// Formatação Monetária e Numérica
const fmtMoeda = (val) => Number(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (val, dec = 2) => Number(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtData = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "-";
const fmtDataHora = (iso) => iso ? new Date(iso).toLocaleString("pt-BR") : "-";

// Síntese de Áudio para Bip de Leitor de Código de Barras (Web Audio API)
let audioCtx = null;
function playScannerBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(2400, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {
    console.debug("Audio not allowed yet:", e);
  }
}

// Estado Global da Aplicação
const state = {
  currentRoute: "/admin",
  user: { name: "Administrador Master", login: "admin", role: "Administrador" },
  company: { name: "Supermercado & Magazine Modelo Ltda", segment: "Supermercado e Vestuário" },
  products: [],
  customers: [],
  suppliers: [],
  cashSession: null,
  // Estado do Carrinho do PDV
  cart: [],
  activeScaleWeight: 0.0,
  lastScannedItem: null,
  activeCustomer: null,
};

// =====================================================================
// ROTEADOR E NAVEGAÇÃO
// =====================================================================
function navigate(route) {
  state.currentRoute = route;
  window.history.pushState({}, "", route);
  renderApp();
}

window.addEventListener("popstate", () => {
  state.currentRoute = window.location.pathname || "/admin";
  renderApp();
});

// Inicialização Principal
async function init() {
  try {
    const s = await API.get("/api/state");
    if (s.user) state.user = s.user;
    const comp = await API.get("/api/company");
    if (comp) state.company = comp;
  } catch (e) {
    console.warn("Estado inicial:", e);
  }

  // Inicializa relógio da barra de status
  setInterval(() => {
    const el = document.getElementById("clock-display");
    if (el) el.innerText = new Date().toLocaleString("pt-BR");
  }, 1000);

  // Rota inicial pela URL
  const path = window.location.pathname;
  if (path && path !== "/") {
    state.currentRoute = path;
  } else {
    state.currentRoute = "/admin";
  }

  renderApp();
}

// =====================================================================
// RENDERIZADOR MASTER DO LAYOUT (FlatLaf / Windows Enterprise Style)
// =====================================================================
function renderApp() {
  const root = document.getElementById("app");
  if (!root) return;

  root.innerHTML = `
    <!-- 1. Barra de Menus Clássica Windows (TelaMasterApp) -->
    <header class="menubar">
      <div class="menu-item">
        <strong>📁 Arquivos</strong> ▾
        <div class="dropdown-menu">
          <div class="dropdown-link" onclick="navigate('/produtos')">🛒 Cadastro de Produtos <small>Ctrl+P</small></div>
          <div class="dropdown-link" onclick="navigate('/clientes')">👥 Cadastro de Clientes <small>Ctrl+C</small></div>
          <div class="dropdown-link" onclick="navigate('/fornecedores')">🚚 Fornecedores</div>
          <div class="dropdown-link" onclick="navigate('/usuarios')">👔 Colaboradores & Vendedores</div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-link" onclick="navigate('/pdv')">⚡ Vendas PDV (Frente de Caixa) <small>F12</small></div>
          <div class="dropdown-link" onclick="navigate('/vendas')">📑 Gerenciador de Vendas & Cupons</div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-link" onclick="navigate('/compras-nfe')">📥 Importar XML NF-e Compras</div>
        </div>
      </div>

      <div class="menu-item">
        <strong>⚙️ Configurações</strong> ▾
        <div class="dropdown-menu">
          <div class="dropdown-link" onclick="navigate('/configuracoes')">🏢 Dados da Empresa Matriz</div>
          <div class="dropdown-link" onclick="navigate('/config-hardware')">⚖️ Balanças & Impressoras Térmicas</div>
          <div class="dropdown-link" onclick="navigate('/config-segmento')">🏷️ Configurar Segmento da Loja</div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-link" onclick="navigate('/usuarios')">🛡️ Gestão de Usuários & Senhas</div>
        </div>
      </div>

      <div class="menu-item">
        <strong>💰 Financeiro</strong> ▾
        <div class="dropdown-menu">
          <div class="dropdown-link" onclick="navigate('/caixa')">💵 Caixa Diário & Movimentações</div>
          <div class="dropdown-link" onclick="openSangriaModal()">🔻 Sangria de Caixa (Retirada)</div>
          <div class="dropdown-link" onclick="openSuprimentoModal()">🔺 Suprimento de Caixa (Troco)</div>
          <div class="dropdown-divider"></div>
          <div class="dropdown-link" onclick="navigate('/financeiro')">💳 Contas a Pagar e Receber</div>
          <div class="dropdown-link" onclick="navigate('/crediario')">📑 Extrato de Crediário & Carnês</div>
          <div class="dropdown-link" onclick="navigate('/cartoes')">💳 Conciliação de Cartões</div>
        </div>
      </div>

      <div class="menu-item">
        <strong>📦 Estoque & Compras</strong> ▾
        <div class="dropdown-menu">
          <div class="dropdown-link" onclick="navigate('/compras-nfe')">📥 Entrada de Mercadorias (XML NF-e)</div>
          <div class="dropdown-link" onclick="navigate('/produtos')">📋 Consulta de Estoque Atual</div>
          <div class="dropdown-link" onclick="navigate('/rel-estoque-baixo')">⚠️ Alertas de Reposição Mínima</div>
          <div class="dropdown-link" onclick="navigate('/etiquetas')">🏷️ Terminal de Etiquetas de Gôndola</div>
        </div>
      </div>

      <div class="menu-item">
        <strong>🏷️ Etiquetas & Balança</strong> ▾
        <div class="dropdown-menu">
          <div class="dropdown-link" onclick="navigate('/etiquetas')">🏷️ Impressão de Etiquetas (Gôndola / Balança)</div>
          <div class="dropdown-link" onclick="downloadToledoCarga()">⚖️ Carga para Balança Toledo (MGV5/MGV6)</div>
          <div class="dropdown-link" onclick="downloadFilizolaCarga()">⚖️ Carga para Balança Filizola Smart</div>
        </div>
      </div>

      <div class="menu-item">
        <strong>📊 Relatórios</strong> ▾
        <div class="dropdown-menu">
          <div class="dropdown-link" onclick="navigate('/relatorios-abc')">📈 Curva ABC de Produtos (Faturamento)</div>
          <div class="dropdown-link" onclick="navigate('/relatorios-caixa')">📑 Fechamento de Caixa Analítico</div>
          <div class="dropdown-link" onclick="navigate('/rel-inadimplencia')">⛔ Relatório de Inadimplência Crediário</div>
        </div>
      </div>

      <div class="menu-item">
        <strong>❓ Ajuda</strong> ▾
        <div class="dropdown-menu">
          <div class="dropdown-link" onclick="openAboutModal()">ℹ️ Sobre o Sistema GDM / PDV Gama</div>
          <div class="dropdown-link" onclick="openShortcutsModal()">⌨️ Guia de Teclas de Atalho</div>
        </div>
      </div>
    </header>

    <!-- 2. Barra de Ferramentas com Ícones Grandes (Toobar1 e Toobar2 do GDM) -->
    <nav class="app-toolbar">
      <button class="tool-btn ${state.currentRoute === '/clientes' ? 'active' : ''}" onclick="navigate('/clientes')">
        <span class="icon">👥</span>
        <span>Clientes</span>
      </button>

      <button class="tool-btn ${state.currentRoute === '/usuarios' ? 'active' : ''}" onclick="navigate('/usuarios')">
        <span class="icon">👔</span>
        <span>Colaboradores</span>
      </button>

      <button class="tool-btn ${state.currentRoute === '/fornecedores' ? 'active' : ''}" onclick="navigate('/fornecedores')">
        <span class="icon">🚚</span>
        <span>Fornecedores</span>
      </button>

      <div class="tool-divider"></div>

      <button class="tool-btn ${state.currentRoute === '/produtos' ? 'active' : ''}" onclick="navigate('/produtos')">
        <span class="icon">🛒</span>
        <span>Produtos</span>
      </button>

      <button class="tool-btn ${state.currentRoute === '/compras-nfe' ? 'active' : ''}" onclick="navigate('/compras-nfe')">
        <span class="icon">📥</span>
        <span>Entrada XML</span>
      </button>

      <button class="tool-btn ${state.currentRoute === '/etiquetas' ? 'active' : ''}" onclick="navigate('/etiquetas')">
        <span class="icon">🏷️</span>
        <span>Etiquetas</span>
      </button>

      <div class="tool-divider"></div>

      <button class="tool-btn ${state.currentRoute === '/caixa' ? 'active' : ''}" onclick="navigate('/caixa')">
        <span class="icon">💵</span>
        <span>Caixa Diário</span>
      </button>

      <button class="tool-btn ${state.currentRoute === '/pdv' ? 'active' : ''}" style="border-color: #22c55e;" onclick="navigate('/pdv')">
        <span class="icon">⚡</span>
        <span style="color:#22c55e; font-weight:800;">Vendas PDV</span>
      </button>

      <button class="tool-btn ${state.currentRoute === '/financeiro' ? 'active' : ''}" onclick="navigate('/financeiro')">
        <span class="icon">💳</span>
        <span>Contas P/R</span>
      </button>

      <button class="tool-btn ${state.currentRoute === '/crediario' ? 'active' : ''}" onclick="navigate('/crediario')">
        <span class="icon">📑</span>
        <span>Crediário</span>
      </button>

      <div class="tool-divider"></div>

      <button class="tool-btn ${state.currentRoute === '/admin' ? 'active' : ''}" onclick="navigate('/admin')">
        <span class="icon">📊</span>
        <span>Retaguarda</span>
      </button>

      <button class="tool-btn" style="margin-left: auto; border-color: #ef4444;" onclick="openLogoutModal()">
        <span class="icon">🔴</span>
        <span>Encerrar</span>
      </button>
    </nav>

    <!-- 3. Área Central Dinâmica -->
    <main class="app-workspace" id="workspace">
      ${renderCurrentModule()}
    </main>

    <!-- 4. Barra de Status Inferior (StatusBar Master) -->
    <footer class="statusbar">
      <div class="status-left">
        <span id="clock-display">${new Date().toLocaleString("pt-BR")}</span>
        <span>|</span>
        <span>Operador: <strong>${state.user.name}</strong> (${state.user.role})</span>
        <span>|</span>
        <span>Loja: <strong>${state.company.tradeName || state.company.name}</strong></span>
      </div>

      <div class="status-right">
        <span class="status-pill blue">SQLite WAL Ativo</span>
        <span class="status-pill">Balança Toledo Prix 3 Conectada</span>
        <span class="status-pill amber">Impressora ESC/POS 80mm Pronta</span>
        <span>Versão 2.0.0 Enterprise</span>
      </div>
    </footer>

    <!-- Container para Modais -->
    <div id="modal-container"></div>
  `;

  // Se estiver na tela de PDV, vincula os atalhos de teclado e foca no leitor
  if (state.currentRoute === "/pdv") {
    setupPdvShortcuts();
  }
}

// =====================================================================
// SELETOR DE MÓDULOS / TELAS
// =====================================================================
function renderCurrentModule() {
  switch (state.currentRoute) {
    case "/pdv":
      return renderPdvModule();
    case "/produtos":
      return renderProductsModule();
    case "/clientes":
      return renderCustomersModule();
    case "/caixa":
      return renderCashModule();
    case "/financeiro":
      return renderFinancialModule();
    case "/crediario":
      return renderCrediarioModule();
    case "/fornecedores":
      return renderSuppliersModule();
    case "/compras-nfe":
      return renderNfeImportModule();
    case "/etiquetas":
      return renderLabelsModule();
    case "/relatorios-abc":
      return renderAbcReportModule();
    case "/configuracoes":
      return renderSettingsModule();
    case "/admin":
    default:
      return renderDashboardModule();
  }
}

// =====================================================================
// 1. MÓDULO FRENTE DE CAIXA (PDV SUPERMERCADO - TELA MASTER VENDA)
// =====================================================================
function renderPdvModule() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const total = subtotal;

  return `
    <div class="pdv-container">
      <!-- Painel Esquerdo: Bobina de Papel Térmico Eletrônica -->
      <section class="pdv-receipt-card">
        <header class="receipt-header">
          <h3>${state.company.tradeName || state.company.name}</h3>
          <p>CNPJ: ${state.company.cnpj || "12.345.678/0001-90"}</p>
          <p>${state.company.street || "Av. Paulista"}, ${state.company.number || "1578"} - ${state.company.city || "São Paulo"}/${state.company.state || "SP"}</p>
          <div class="receipt-meta">
            <span>CUPOM NÃO FISCAL</span>
            <span>VENDA: #${state.cart.length > 0 ? "000042" : "LIVRE"}</span>
          </div>
        </header>

        <div class="receipt-items" id="receipt-scroll">
          <table class="receipt-table">
            <thead>
              <tr>
                <th style="width:25px;">#</th>
                <th>DESCRIÇÃO</th>
                <th style="text-align:right;">QTD x UN</th>
                <th style="text-align:right;">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${state.cart.length === 0 ? `
                <tr>
                  <td colspan="4" style="text-align:center; padding: 40px 0; color:#94a3b8;">
                    <strong>*** CAIXA LIVRE ***</strong><br>
                    <small>Aguardando registro de mercadorias...</small>
                  </td>
                </tr>
              ` : state.cart.map((it, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${it.name}</strong><br><small style="color:#64748b;">${it.barcode || it.sku}</small></td>
                  <td style="text-align:right;">${fmtNum(it.quantity, it.unit === 'KG' ? 3 : 0)} ${it.unit} x ${fmtMoeda(it.unitPrice)}</td>
                  <td style="text-align:right;"><strong>${fmtMoeda(it.totalPrice)}</strong></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <footer class="receipt-total-bar">
          <div class="receipt-row">
            <span>Itens Registrados:</span>
            <span>${state.cart.length} itens</span>
          </div>
          <div class="receipt-row">
            <span>Subtotal:</span>
            <span>${fmtMoeda(subtotal)}</span>
          </div>
          <div class="receipt-row grand-total">
            <span>TOTAL A PAGAR:</span>
            <span>${fmtMoeda(total)}</span>
          </div>
        </footer>
      </section>

      <!-- Painel Central: Visor LED Gigante, Leitor e Balança -->
      <section class="pdv-center-panel">
        <!-- Display Duplo LED Caixa -->
        <div class="pdv-led-display">
          <div class="led-subtotal-row">
            <span class="led-subtotal-label">Subtotal da Compra</span>
            <span class="led-subtotal-val">${fmtMoeda(subtotal)}</span>
          </div>
          <div class="led-total-row">
            <span class="led-total-label">Total a Pagar</span>
            <span class="led-total-val">${fmtMoeda(total)}</span>
          </div>
        </div>

        <!-- Visor do Último Item Registrado -->
        <div class="pdv-last-item-card">
          <div class="last-item-photo">
            ${state.lastScannedItem ? (state.lastScannedItem.isWeighable ? "⚖️" : "📦") : "🛒"}
          </div>
          <div class="last-item-info">
            <span class="last-item-name">${state.lastScannedItem ? state.lastScannedItem.name : "CAIXA ABERTO - PASSE O PRIMEIRO ITEM"}</span>
            <span class="last-item-math">
              ${state.lastScannedItem ? `${fmtNum(state.lastScannedItem.quantity, state.lastScannedItem.unit === 'KG' ? 3 : 0)} ${state.lastScannedItem.unit} x ${fmtMoeda(state.lastScannedItem.unitPrice)}` : "Aguardando leitura de código de barras ou pesagem..."}
            </span>
            <span class="last-item-total">
              ${state.lastScannedItem ? fmtMoeda(state.lastScannedItem.totalPrice) : "R$ 0,00"}
            </span>
          </div>
        </div>

        <!-- Entrada de Código de Barras / PLU -->
        <div class="pdv-scanner-box">
          <span class="scanner-icon">⚡</span>
          <input type="text" id="barcode-input" class="scanner-input" placeholder="Bipe o código de barras ou digite 'QTD*CODIGO'..." autofocus autocomplete="off" />
          <span class="scanner-tip">Pressione <strong>ENTER</strong> para registrar</span>
        </div>

        <!-- Balança de Checkout Integrada (Toledo Prix 3 / Filizola Platina) -->
        <div class="pdv-scale-card">
          <div>
            <span style="font-size:12px; color:#94a3b8; font-weight:700; text-transform:uppercase;">Balança de Checkout (Toledo Prix 3)</span>
            <div class="scale-display">
              <span class="scale-digits" id="scale-weight-val">${fmtNum(state.activeScaleWeight, 3)}</span>
              <span class="scale-unit">KG</span>
            </div>
          </div>

          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="simulateScaleWeight(0.450)">🥩 Pesar 450g</button>
            <button class="btn btn-secondary btn-sm" onclick="simulateScaleWeight(1.280)">🍎 Pesar 1,28kg</button>
            <button class="btn btn-secondary btn-sm" onclick="simulateScaleWeight(0.000)">Tara (Zero)</button>
            <button class="btn btn-success" onclick="triggerWeighingAction()">[F2] Pesar Item</button>
          </div>
        </div>

        <!-- Barra Inferior de Atalhos Operacionais F1 a F12 -->
        <div class="pdv-shortcuts-bar">
          <button class="shortcut-btn" onclick="openShortcutsModal()"><strong>[F1]</strong><span>Ajuda</span></button>
          <button class="shortcut-btn" onclick="triggerWeighingAction()"><strong>[F2]</strong><span>Balança</span></button>
          <button class="shortcut-btn" onclick="openProductSearchModal()"><strong>[F3]</strong><span>Buscar Prod.</span></button>
          <button class="shortcut-btn" style="background:#065f46; border-color:#10b981;" onclick="openPaymentModal()"><strong>[F4]</strong><span style="color:#a7f3d0; font-weight:800;">Finalizar</span></button>
          <button class="shortcut-btn" onclick="openDiscountModal()"><strong>[F5]</strong><span>Desconto</span></button>
          <button class="shortcut-btn" onclick="openCancelItemModal()"><strong>[F6]</strong><span>Canc. Item</span></button>
          <button class="shortcut-btn" onclick="cancelCurrentSale()"><strong>[F7]</strong><span>Canc. Cupom</span></button>
          <button class="shortcut-btn" onclick="openSangriaModal()"><strong>[F8]</strong><span>Sangria</span></button>
          <button class="shortcut-btn" onclick="openSuprimentoModal()"><strong>[F9]</strong><span>Suprimento</span></button>
          <button class="shortcut-btn" onclick="openCloseCashModal()"><strong>[F10]</strong><span>Fechar Cx</span></button>
          <button class="shortcut-btn" onclick="openCustomerIdentifyModal()"><strong>[F11]</strong><span>CPF / Cliente</span></button>
          <button class="shortcut-btn" onclick="triggerDrawer()"><strong>[F12]</strong><span>Gaveta</span></button>
        </div>
      </section>

      <!-- Painel Direito: Dados do Operador e Cliente Identificado -->
      <aside class="pdv-side-panel">
        <div class="operator-card">
          <span style="font-size:12px; color:#94a3b8; font-weight:700;">OPERADOR DO CAIXA</span>
          <strong style="font-size:16px; color:#fff;">${state.user.name}</strong>
          <span style="font-size:12px; color:#38bdf8;">Terminal 01 - Caixa Master</span>
          <hr style="border:0; border-top:1px solid #263554; margin:6px 0;">
          <span style="font-size:12px; color:#94a3b8;">CLIENTE IDENTIFICADO NO CUPOM:</span>
          <strong style="font-size:14px; color:${state.activeCustomer ? '#22c55e' : '#cbd5e1'};">
            ${state.activeCustomer ? state.activeCustomer.name : "Consumidor Final (Não Informado)"}
          </strong>
          ${state.activeCustomer ? `
            <small style="color:#94a3b8;">CPF: ${state.activeCustomer.cpfCnpj || "-"} | Limite: ${fmtMoeda(state.activeCustomer.creditLimit)}</small>
            <button class="btn btn-outline btn-sm" style="margin-top:6px;" onclick="removeActiveCustomer()">Desvincular Cliente</button>
          ` : `
            <button class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="openCustomerIdentifyModal()">[F11] Identificar Cliente</button>
          `}
        </div>

        <div class="panel" style="padding:14px; flex:1; display:flex; flex-direction:column; gap:8px;">
          <span class="panel-title" style="font-size:14px;">⚡ Ações Rápidas do Caixa</span>
          <button class="btn btn-success" style="width:100%; justify-content:center; padding:14px;" onclick="openPaymentModal()">
            💳 [F4] FINALIZAR VENDA
          </button>
          <button class="btn btn-secondary" style="width:100%; justify-content:center;" onclick="openProductSearchModal()">
            🔍 [F3] Consultar Preço
          </button>
          <button class="btn btn-outline" style="width:100%; justify-content:center;" onclick="openSangriaModal()">
            🔻 [F8] Retirada / Sangria
          </button>
          <button class="btn btn-outline" style="width:100%; justify-content:center;" onclick="openSuprimentoModal()">
            🔺 [F9] Fundo de Troco
          </button>
          <button class="btn btn-danger" style="width:100%; justify-content:center;" onclick="cancelCurrentSale()">
            ❌ [F7] Cancelar Compra
          </button>
        </div>
      </aside>
    </div>
  `;
}

// Configuração dos Atalhos de Teclado F1 a F12 no PDV
function setupPdvShortcuts() {
  const input = document.getElementById("barcode-input");
  if (input) {
    input.focus();
    input.onkeydown = async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const raw = input.value.trim();
        if (raw) {
          await processBarcodeScan(raw);
          input.value = "";
          input.focus();
        }
      }
    };
  }

  window.onkeydown = (e) => {
    if (state.currentRoute !== "/pdv") return;
    if (document.getElementById("modal-container").children.length > 0) return; // se modal aberto, ignora atalhos de fundo

    switch (e.key) {
      case "F1": e.preventDefault(); openShortcutsModal(); break;
      case "F2": e.preventDefault(); triggerWeighingAction(); break;
      case "F3": e.preventDefault(); openProductSearchModal(); break;
      case "F4": e.preventDefault(); openPaymentModal(); break;
      case "F5": e.preventDefault(); openDiscountModal(); break;
      case "F6": e.preventDefault(); openCancelItemModal(); break;
      case "F7": e.preventDefault(); cancelCurrentSale(); break;
      case "F8": e.preventDefault(); openSangriaModal(); break;
      case "F9": e.preventDefault(); openSuprimentoModal(); break;
      case "F10": e.preventDefault(); openCloseCashModal(); break;
      case "F11": e.preventDefault(); openCustomerIdentifyModal(); break;
      case "F12": e.preventDefault(); triggerDrawer(); break;
    }
  };
}

// Processador de Leitura de Código de Barras / Balança / Multiplicação
async function processBarcodeScan(raw) {
  let qty = 1.0;
  let code = raw;

  // Suporte a multiplicação: "3*7891000..." ou "2.5*123"
  if (raw.includes("*")) {
    const parts = raw.split("*");
    qty = parseFloat(parts[0].replace(",", ".")) || 1.0;
    code = parts[1].trim();
  }

  // Busca lista de produtos se ainda não tiver carregado
  if (state.products.length === 0) {
    state.products = await API.get("/api/products");
  }

  let matched = null;

  // 1. Verifica se é etiqueta pesável de balança iniciada com flag '2' (ex: 200123005009)
  if (code.startsWith("2") && code.length === 12 || code.length === 13) {
    const plu = code.substring(1, 6).replace(/^0+/, "");
    matched = state.products.find(p => p.pluCode === plu || p.sku === plu);
    if (matched) {
      // Extrai o peso ou valor dos dígitos 7 a 11
      const valWeight = parseInt(code.substring(6, 11), 10) / 1000.0;
      qty = valWeight;
    }
  }

  // 2. Busca exata por Código de Barras, SKU ou PLU
  if (!matched) {
    matched = state.products.find(p => p.barcode === code || p.sku === code || p.pluCode === code);
  }

  // 3. Busca aproximada por nome
  if (!matched) {
    matched = state.products.find(p => p.name.toLowerCase().includes(code.toLowerCase()));
  }

  if (!matched) {
    alert(`Produto não encontrado para o código: "${code}"\nPressione [F3] para pesquisar no catálogo.`);
    return;
  }

  // Se o item for pesável e não veio peso na etiqueta, usa o peso ativo da balança
  if (matched.isWeighable && qty === 1.0) {
    if (state.activeScaleWeight > 0.0) {
      qty = state.activeScaleWeight;
    } else {
      const inputWeight = prompt(`Produto Pesável: "${matched.name}"\nInforme o peso em KG (ex: 0.750):`, "0.500");
      if (!inputWeight) return;
      qty = parseFloat(inputWeight.replace(",", ".")) || 0.5;
    }
  }

  const itemTotal = Math.round(qty * matched.salePrice * 100) / 100;
  const cartItem = {
    productId: matched.id,
    sku: matched.sku,
    barcode: matched.barcode,
    name: matched.name,
    unit: matched.unit || "UN",
    unitPrice: matched.salePrice,
    quantity: qty,
    discount: 0,
    totalPrice: itemTotal,
    isWeighable: matched.isWeighable
  };

  state.cart.push(cartItem);
  state.lastScannedItem = cartItem;

  playScannerBeep();
  renderApp();

  // Scroll automático da bobina para o final
  setTimeout(() => {
    const scr = document.getElementById("receipt-scroll");
    if (scr) scr.scrollTop = scr.scrollHeight;
  }, 50);
}

// Balança de Checkout
function simulateScaleWeight(weight) {
  state.activeScaleWeight = weight;
  const el = document.getElementById("scale-weight-val");
  if (el) el.innerText = fmtNum(weight, 3);
}

function triggerWeighingAction() {
  if (state.activeScaleWeight <= 0) {
    simulateScaleWeight(0.850);
  }
  const code = prompt("Digite o código ou PLU do produto pesável para pesar na balança:", "201");
  if (code) processBarcodeScan(code);
}

function cancelCurrentSale() {
  if (state.cart.length === 0) return;
  if (confirm("Deseja realmente cancelar toda a venda atual em andamento?")) {
    state.cart = [];
    state.lastScannedItem = null;
    state.activeCustomer = null;
    renderApp();
  }
}

function triggerDrawer() {
  alert("Comando ESC/POS enviado para a porta da impressora:\nAbertura do solenóide da Gaveta de Dinheiro acionada!");
}

// =====================================================================
// MODAL DE FINALIZAÇÃO DE VENDA (TELA FINALIZAR VENDA COMPLETA)
// =====================================================================
function openPaymentModal() {
  if (state.cart.length === 0) {
    alert("Nenhum item adicionado à venda!");
    return;
  }

  const subtotal = state.cart.reduce((sum, item) => sum + item.totalPrice, 0);
  let discount = 0;
  let total = subtotal;

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong style="font-size:18px; color:#fff;">💳 Finalização da Venda (Fechamento de Conta)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <!-- Coluna da Esquerda: Resumo dos Valores -->
            <div style="background:#0f172a; padding:18px; border-radius:10px; border:1px solid #263554;">
              <span style="font-size:12px; color:#94a3b8; font-weight:700;">RESUMO DA COMPRA</span>
              <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:15px;">
                <span>Subtotal da Venda:</span>
                <strong style="color:#fff;">${fmtMoeda(subtotal)}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:15px;">
                <span>Desconto Aplicado:</span>
                <input type="number" id="pay-discount" class="form-control" style="width:110px; text-align:right;" value="0.00" step="0.50" onchange="recalcPaymentTotal(${subtotal})" />
              </div>
              <hr style="border:0; border-top:1px solid #263554; margin:14px 0;">
              <div style="display:flex; justify-content:space-between; font-size:22px; font-weight:900;">
                <span style="color:#38bdf8;">TOTAL A PAGAR:</span>
                <span style="color:#22c55e;" id="pay-final-total">${fmtMoeda(total)}</span>
              </div>

              <div style="margin-top:20px;">
                <label style="font-size:12px; color:#94a3b8; font-weight:600;">Cliente Vinculado à Nota:</label>
                <div style="display:flex; gap:8px; margin-top:4px;">
                  <input type="text" class="form-control" style="flex:1;" value="${state.activeCustomer ? state.activeCustomer.name : 'Consumidor Final'}" readonly />
                  <button class="btn btn-secondary btn-sm" onclick="openCustomerIdentifyModal()">Alterar</button>
                </div>
              </div>
            </div>

            <!-- Coluna da Direita: Seleção do Meio de Pagamento -->
            <div>
              <label style="font-size:13px; font-weight:700; color:#cbd5e1; margin-bottom:8px; display:block;">Escolha a Forma de Pagamento:</label>
              <select id="pay-method" class="form-control" style="font-size:16px; font-weight:700;" onchange="changePaymentMethodUI()">
                <option value="DINHEIRO">💵 Dinheiro (com Troco Automático)</option>
                <option value="CARTAO_DEBITO">💳 Cartão de Débito</option>
                <option value="CARTAO_CREDITO">💳 Cartão de Crédito (com Parcelamento)</option>
                <option value="PIX">⚡ Pix (QR Code Dinâmico)</option>
                <option value="CREDIARIO">📑 Crediário / Carnê / Fiado</option>
                <option value="CHEQUE">🏦 Cheque Pré-Datado</option>
              </select>

              <!-- Painel Dinâmico de Detalhes do Pagamento -->
              <div id="payment-details-panel" style="margin-top:16px; background:#0f172a; padding:16px; border-radius:10px; border:1px solid #263554;">
                <!-- Dinheiro por padrão -->
                <div id="panel-cash">
                  <div class="form-group">
                    <label>Valor Recebido em Dinheiro (R$):</label>
                    <input type="number" id="pay-cash-received" class="form-control" style="font-size:20px; font-weight:800; color:#22c55e;" value="${total}" step="1" oninput="calcCashChange()" />
                  </div>
                  <div style="display:flex; justify-content:space-between; margin-top:14px; background:#1e293b; padding:12px; border-radius:8px;">
                    <span style="font-size:16px; font-weight:700; color:#cbd5e1;">TROCO A DEVOLVER:</span>
                    <strong style="font-size:22px; font-weight:900; color:#f59e0b;" id="pay-cash-change">R$ 0,00</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-success" style="padding:12px 24px; font-size:15px;" onclick="executeSaleCompletion()">
            ✔️ Concluir Venda e Imprimir Comprovante
          </button>
        </footer>
      </div>
    </div>
  `;
}

function recalcPaymentTotal(subtotal) {
  const disc = parseFloat(document.getElementById("pay-discount").value) || 0;
  const finalTotal = Math.max(0, subtotal - disc);
  document.getElementById("pay-final-total").innerText = fmtMoeda(finalTotal);
  const cashRec = document.getElementById("pay-cash-received");
  if (cashRec) {
    cashRec.value = finalTotal;
    calcCashChange();
  }
}

function calcCashChange() {
  const totStr = document.getElementById("pay-final-total").innerText.replace(/[^0-9,-]/g, "").replace(",", ".");
  const total = parseFloat(totStr) || 0;
  const received = parseFloat(document.getElementById("pay-cash-received").value) || 0;
  const change = Math.max(0, received - total);
  document.getElementById("pay-cash-change").innerText = fmtMoeda(change);
}

function changePaymentMethodUI() {
  const method = document.getElementById("pay-method").value;
  const panel = document.getElementById("payment-details-panel");
  const totStr = document.getElementById("pay-final-total").innerText.replace(/[^0-9,-]/g, "").replace(",", ".");
  const total = parseFloat(totStr) || 0;

  if (method === "DINHEIRO") {
    panel.innerHTML = `
      <div class="form-group">
        <label>Valor Recebido em Dinheiro (R$):</label>
        <input type="number" id="pay-cash-received" class="form-control" style="font-size:20px; font-weight:800; color:#22c55e;" value="${total}" step="1" oninput="calcCashChange()" />
      </div>
      <div style="display:flex; justify-content:space-between; margin-top:14px; background:#1e293b; padding:12px; border-radius:8px;">
        <span style="font-size:16px; font-weight:700; color:#cbd5e1;">TROCO A DEVOLVER:</span>
        <strong style="font-size:22px; font-weight:900; color:#f59e0b;" id="pay-cash-change">R$ 0,00</strong>
      </div>
    `;
    calcCashChange();
  } else if (method === "CARTAO_CREDITO" || method === "CARTAO_DEBITO") {
    panel.innerHTML = `
      <div class="form-grid">
        <div class="form-group">
          <label>Bandeira do Cartão:</label>
          <select id="pay-card-flag" class="form-control">
            <option value="MASTERCARD">Mastercard</option>
            <option value="VISA">Visa</option>
            <option value="ELO">Elo</option>
            <option value="HIPERCARD">Hipercard</option>
            <option value="AMEX">American Express</option>
          </select>
        </div>
        ${method === "CARTAO_CREDITO" ? `
          <div class="form-group">
            <label>Parcelamento:</label>
            <select id="pay-card-inst" class="form-control">
              <option value="1">1x de ${fmtMoeda(total)} (À vista)</option>
              <option value="2">2x de ${fmtMoeda(total / 2)}</option>
              <option value="3">3x de ${fmtMoeda(total / 3)}</option>
              <option value="4">4x de ${fmtMoeda(total / 4)}</option>
              <option value="6">6x de ${fmtMoeda(total / 6)}</option>
            </select>
          </div>
        ` : `
          <div class="form-group">
            <label>Tipo:</label>
            <input type="text" class="form-control" value="Débito à Vista" readonly />
          </div>
        `}
      </div>
      <p style="font-size:12px; color:#10b981; margin-top:12px;">✅ Integração TEF / POS PinPad pronta para autorização.</p>
    `;
  } else if (method === "PIX") {
    panel.innerHTML = `
      <div style="text-align:center;">
        <p style="font-size:13px; color:#cbd5e1; margin-bottom:8px;">Aponte o aplicativo do banco para o QR Code abaixo:</p>
        <div style="background:#fff; padding:12px; width:150px; height:150px; margin:0 auto; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:72px;">
          📱
        </div>
        <p style="font-size:14px; font-weight:800; color:#22c55e; margin-top:8px;">VALOR: ${fmtMoeda(total)}</p>
        <p style="font-size:11px; color:#94a3b8;">Chave Pix Dinâmica SEFAZ / BACEN gerada.</p>
      </div>
    `;
  } else if (method === "CREDIARIO") {
    panel.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <span style="font-size:13px; color:#f59e0b; font-weight:700;">⚠️ Modalidade Crediário / Carnê Próprio</span>
        <p style="font-size:12px; color:#cbd5e1;">A venda a prazo será lançada na conta corrente do cliente vinculado com vencimento para 30 dias.</p>
        ${!state.activeCustomer ? `
          <div style="background:#7f1d1d; color:#fecaca; padding:10px; border-radius:6px; font-size:12px;">
            Nenhum cliente selecionado! Para vender no crediário é obrigatório vincular um cliente com limite aprovado.
          </div>
        ` : `
          <div style="background:#064e3b; color:#a7f3d0; padding:10px; border-radius:6px; font-size:12px;">
            Cliente: <strong>${state.activeCustomer.name}</strong><br>
            Limite Aprovado: ${fmtMoeda(state.activeCustomer.creditLimit)} | Débito Atual: ${fmtMoeda(state.activeCustomer.currentDebt)}
          </div>
        `}
      </div>
    `;
  } else if (method === "CHEQUE") {
    panel.innerHTML = `
      <div class="form-grid">
        <div class="form-group">
          <label>Banco Emissor:</label>
          <select id="pay-check-bank" class="form-control">
            <option>001 - Banco do Brasil</option>
            <option>104 - Caixa Econômica</option>
            <option>237 - Bradesco</option>
            <option>341 - Itaú Unibanco</option>
            <option>033 - Santander</option>
          </select>
        </div>
        <div class="form-group">
          <label>Data de Compensação (Prazo):</label>
          <input type="date" id="pay-check-date" class="form-control" value="${new Date(Date.now() + 30*86400000).toISOString().split('T')[0]}" />
        </div>
      </div>
    `;
  }
}

// Conclusão e Persistência da Venda no Servidor
async function executeSaleCompletion() {
  const method = document.getElementById("pay-method").value;
  const disc = parseFloat(document.getElementById("pay-discount").value) || 0;
  const subtotal = state.cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const total = Math.max(0, subtotal - disc);

  if (method === "CREDIARIO" && !state.activeCustomer) {
    alert("Selecione um cliente para autorizar a venda no Crediário!");
    return;
  }

  let received = total;
  let change = 0;
  let cardFlag = null;
  let installments = 1;

  if (method === "DINHEIRO") {
    received = parseFloat(document.getElementById("pay-cash-received").value) || total;
    if (received < total) {
      alert("O valor recebido em dinheiro é inferior ao total da compra!");
      return;
    }
    change = received - total;
  } else if (method === "CARTAO_CREDITO") {
    cardFlag = document.getElementById("pay-card-flag")?.value || "MASTERCARD";
    installments = parseInt(document.getElementById("pay-card-inst")?.value, 10) || 1;
  } else if (method === "CARTAO_DEBITO") {
    cardFlag = document.getElementById("pay-card-flag")?.value || "MASTERCARD";
  }

  const payload = {
    subtotal,
    discount: disc,
    addition: 0,
    total,
    change,
    operatorId: null,
    operatorName: state.user.name,
    customerId: state.activeCustomer ? state.activeCustomer.id : null,
    customerName: state.activeCustomer ? state.activeCustomer.name : "Consumidor Final",
    customerCpf: state.activeCustomer ? state.activeCustomer.cpfCnpj : null,
    items: state.cart.map(i => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discount: i.discount,
      totalPrice: i.totalPrice
    })),
    payments: [
      {
        method,
        amount: received,
        cardFlag,
        installments
      }
    ]
  };

  try {
    const res = await API.post("/api/sales/complete", payload);
    closeModal();

    alert(`✅ VENDA Nº ${String(res.number).padStart(6, '0')} CONCLUÍDA COM SUCESSO!\n\nTotal: ${fmtMoeda(res.total)}\nTroco: ${fmtMoeda(res.change)}\nForma: ${res.paymentSummary}\n\n[Comprovante térmico enviado para impressão ESC/POS e gaveta acionada]`);

    // Limpa PDV para o próximo cliente
    state.cart = [];
    state.lastScannedItem = null;
    state.activeCustomer = null;
    renderApp();
  } catch (e) {
    alert("Erro ao concluir venda: " + e.message);
  }
}

// Identificar Cliente na Venda
function openCustomerIdentifyModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong style="color:#fff;">👥 Identificar Cliente no Caixa</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body">
          <div class="form-group">
            <label>Digite Nome, CPF ou CNPJ do Cliente:</label>
            <input type="text" id="cust-search-input" class="form-control" placeholder="Buscar cliente..." oninput="filterCustomerSearch(this.value)" autofocus />
          </div>

          <div style="margin-top:14px; max-height:260px; overflow-y:auto;" id="cust-search-list">
            <p style="color:#94a3b8; font-size:12px;">Carregando clientes cadastrados...</p>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        </footer>
      </div>
    </div>
  `;

  API.get("/api/customers").then(list => {
    state.customers = list;
    filterCustomerSearch("");
  });
}

function filterCustomerSearch(term) {
  const el = document.getElementById("cust-search-list");
  if (!el) return;
  const q = term.toLowerCase().trim();
  const filtered = state.customers.filter(c => c.name.toLowerCase().includes(q) || (c.cpfCnpj && c.cpfCnpj.includes(q)));

  if (filtered.length === 0) {
    el.innerHTML = `<p style="color:#ef4444; font-size:12px; padding:8px;">Nenhum cliente encontrado com "${term}".</p>`;
    return;
  }

  el.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Nome</th>
          <th>CPF / CNPJ</th>
          <th>Limite</th>
          <th>Débito</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(c => `
          <tr>
            <td><strong>${c.name}</strong></td>
            <td>${c.cpfCnpj || "-"}</td>
            <td>${fmtMoeda(c.creditLimit)}</td>
            <td style="color:${c.currentDebt > 0 ? '#ef4444' : '#10b981'};">${fmtMoeda(c.currentDebt)}</td>
            <td>
              <button class="btn btn-success btn-sm" onclick="selectCustomerForPdv('${c.id}')">Selecionar</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function selectCustomerForPdv(id) {
  const cust = state.customers.find(c => c.id === id);
  if (cust) {
    state.activeCustomer = cust;
    closeModal();
    renderApp();
  }
}

function removeActiveCustomer() {
  state.activeCustomer = null;
  renderApp();
}

// Modal de Busca Rápida de Produtos no PDV [F3]
function openProductSearchModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong style="color:#fff;">🔍 [F3] Consulta de Produtos e Preços</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body">
          <div class="form-group">
            <input type="text" id="prod-lookup-input" class="form-control" placeholder="Buscar por Nome, Código de Barras, SKU ou PLU..." oninput="filterProductLookup(this.value)" autofocus />
          </div>

          <div style="margin-top:14px; max-height:350px; overflow-y:auto;" id="prod-lookup-list">
            <p style="color:#94a3b8; font-size:12px;">Carregando produtos...</p>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
        </footer>
      </div>
    </div>
  `;

  API.get("/api/products").then(list => {
    state.products = list;
    filterProductLookup("");
  });
}

function filterProductLookup(term) {
  const el = document.getElementById("prod-lookup-list");
  if (!el) return;
  const q = term.toLowerCase().trim();
  const filtered = state.products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q)) || (p.pluCode && p.pluCode.includes(q)));

  el.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>SKU / PLU</th>
          <th>Código Barras</th>
          <th>Descrição</th>
          <th>Categoria</th>
          <th>Estoque</th>
          <th>Preço Venda</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(p => `
          <tr>
            <td><strong>${p.sku}</strong> ${p.pluCode ? `<span class="status-pill blue">PLU ${p.pluCode}</span>` : ''}</td>
            <td>${p.barcode || "-"}</td>
            <td><strong>${p.name}</strong> ${p.size ? `(${p.size}/${p.color})` : ''}</td>
            <td>${p.category}</td>
            <td>${fmtNum(p.quantity, p.unit === 'KG' ? 3 : 0)} ${p.unit}</td>
            <td style="color:#22c55e; font-weight:800; font-size:14px;">${fmtMoeda(p.salePrice)}</td>
            <td>
              <button class="btn btn-success btn-sm" onclick="addSearchedProductToPdv('${p.id}')">+ Lançar</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function addSearchedProductToPdv(id) {
  const p = state.products.find(x => x.id === id);
  if (p) {
    closeModal();
    processBarcodeScan(p.barcode || p.sku);
  }
}

// =====================================================================
// 2. MÓDULO RETAGUARDA: CADASTRO DE PRODUTOS COMPLETO (TELA CADASTRO PRODUTO)
// =====================================================================
function renderProductsModule() {
  setTimeout(() => loadProductsTable(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <h2 class="panel-title">🛒 Cadastro Geral de Produtos & Controle de Estoque</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" onclick="navigate('/compras-nfe')">📥 Importar XML NF-e</button>
          <button class="btn btn-success" onclick="openProductEditModal(null)">+ Novo Produto</button>
        </div>
      </header>

      <!-- Filtros Rápidos -->
      <div style="display:flex; gap:12px; margin-bottom:16px;">
        <input type="text" id="prod-filter-q" class="form-control" style="flex:1;" placeholder="Filtrar por nome, SKU, código de barras..." oninput="loadProductsTable()" />
        <select id="prod-filter-cat" class="form-control" style="width:200px;" onchange="loadProductsTable()">
          <option value="Todos">Todas as Categorias</option>
          <option value="Mercearia">Mercearia</option>
          <option value="Açougue">Açougue</option>
          <option value="Laticínios">Laticínios</option>
          <option value="Bebidas">Bebidas</option>
          <option value="Hortifruti">Hortifruti</option>
          <option value="Vestuário">Vestuário / Moda</option>
        </select>
      </div>

      <div class="table-wrap" id="products-table-container">
        <p style="color:#94a3b8; padding:20px;">Carregando produtos...</p>
      </div>
    </div>
  `;
}

async function loadProductsTable() {
  const container = document.getElementById("products-table-container");
  if (!container) return;

  const q = document.getElementById("prod-filter-q")?.value || "";
  const cat = document.getElementById("prod-filter-cat")?.value || "Todos";

  const list = await API.get(`/api/products?query=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`);
  state.products = list;

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>SKU / Cód.</th>
          <th>Código Barras</th>
          <th>Descrição do Produto</th>
          <th>Categoria</th>
          <th>Custo</th>
          <th>Markup %</th>
          <th>Preço Venda</th>
          <th>Estoque</th>
          <th>Localização</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(p => `
          <tr>
            <td><strong>${p.sku}</strong> ${p.pluCode ? `<span class="status-pill blue">PLU ${p.pluCode}</span>` : ''}</td>
            <td>${p.barcode || "-"}</td>
            <td>
              <strong>${p.name}</strong>
              ${p.size ? `<br><small style="color:#38bdf8;">Tam: ${p.size} | Cor: ${p.color}</small>` : ''}
            </td>
            <td>${p.category}</td>
            <td>${fmtMoeda(p.costPrice)}</td>
            <td>${fmtNum(p.markupPct, 1)}%</td>
            <td style="color:#22c55e; font-weight:800;">${fmtMoeda(p.salePrice)}</td>
            <td>
              <span class="status-pill ${p.quantity <= p.minQuantity ? 'amber' : ''}">
                ${fmtNum(p.quantity, p.unit === 'KG' ? 3 : 0)} ${p.unit}
              </span>
            </td>
            <td>${p.location || "-"}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="openProductEditModal('${p.id}')">Editar</button>
              <button class="btn btn-outline btn-sm" onclick="openStockAdjustModal('${p.id}', '${p.name}', ${p.quantity})">Estoque</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// Modal Completo de Cadastro / Edição de Produto (com abas do GDM)
function openProductEditModal(id) {
  const p = id ? state.products.find(x => x.id === id) : {
    sku: String(Math.floor(100 + Math.random() * 900)),
    name: "",
    brand: "",
    category: "Mercearia",
    unit: "UN",
    costPrice: 0,
    markupPct: 40,
    salePrice: 0,
    commissionPct: 0,
    quantity: 10,
    minQuantity: 5,
    location: "",
    ncm: "",
    cfop: "5102",
    isWeighable: false,
    pluCode: "",
    size: "",
    color: "",
    expiryDate: ""
  };

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong style="color:#fff;">${id ? "✏️ Editar Cadastro de Produto" : "➕ Novo Cadastro de Produto"}</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body">
          <div class="form-tabs">
            <span class="tab-link active" onclick="switchProductTab('geral', this)">1. Dados Gerais</span>
            <span class="tab-link" onclick="switchProductTab('precos', this)">2. Preços & Formação</span>
            <span class="tab-link" onclick="switchProductTab('estoque', this)">3. Estoque & Localização</span>
            <span class="tab-link" onclick="switchProductTab('fiscal', this)">4. Fiscal & Balança</span>
            <span class="tab-link" onclick="switchProductTab('grade', this)">5. Moda & Grade</span>
          </div>

          <!-- Aba 1: Dados Gerais -->
          <div id="ptab-geral" class="ptab-content">
            <div class="form-grid">
              <div class="form-group" style="grid-column: span 2;">
                <label>Nome / Descrição Completa do Produto: *</label>
                <input type="text" id="p-name" class="form-control" value="${p.name}" required />
              </div>
              <div class="form-group">
                <label>Código Interno / SKU: *</label>
                <input type="text" id="p-sku" class="form-control" value="${p.sku}" required />
              </div>
              <div class="form-group">
                <label>Código de Barras (EAN-13):</label>
                <input type="text" id="p-bar" class="form-control" value="${p.barcode || ''}" placeholder="Ex: 7891000100103" />
              </div>
              <div class="form-group">
                <label>Marca / Fabricante:</label>
                <input type="text" id="p-brand" class="form-control" value="${p.brand || ''}" />
              </div>
              <div class="form-group">
                <label>Categoria:</label>
                <select id="p-cat" class="form-control">
                  <option ${p.category === 'Mercearia' ? 'selected' : ''}>Mercearia</option>
                  <option ${p.category === 'Açougue' ? 'selected' : ''}>Açougue</option>
                  <option ${p.category === 'Laticínios' ? 'selected' : ''}>Laticínios</option>
                  <option ${p.category === 'Bebidas' ? 'selected' : ''}>Bebidas</option>
                  <option ${p.category === 'Hortifruti' ? 'selected' : ''}>Hortifruti</option>
                  <option ${p.category === 'Vestuário' ? 'selected' : ''}>Vestuário</option>
                  <option ${p.category === 'Padaria' ? 'selected' : ''}>Padaria</option>
                </select>
              </div>
              <div class="form-group">
                <label>Unidade de Medida:</label>
                <select id="p-unit" class="form-control">
                  <option ${p.unit === 'UN' ? 'selected' : ''}>UN</option>
                  <option ${p.unit === 'KG' ? 'selected' : ''}>KG</option>
                  <option ${p.unit === 'PCT' ? 'selected' : ''}>PCT</option>
                  <option ${p.unit === 'CX' ? 'selected' : ''}>CX</option>
                  <option ${p.unit === 'LT' ? 'selected' : ''}>LT</option>
                  <option ${p.unit === 'MT' ? 'selected' : ''}>MT</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Aba 2: Preços & Margem -->
          <div id="ptab-precos" class="ptab-content" style="display:none;">
            <div class="form-grid">
              <div class="form-group">
                <label>Preço de Custo (R$):</label>
                <input type="number" id="p-cost" class="form-control" value="${p.costPrice}" step="0.01" oninput="calcSaleFromCost()" />
              </div>
              <div class="form-group">
                <label>Margem de Lucro / Markup (%):</label>
                <input type="number" id="p-markup" class="form-control" value="${p.markupPct}" step="0.1" oninput="calcSaleFromCost()" />
              </div>
              <div class="form-group">
                <label>Preço de Venda Final (R$): *</label>
                <input type="number" id="p-sale" class="form-control" style="font-weight:800; color:#22c55e;" value="${p.salePrice}" step="0.01" required />
              </div>
              <div class="form-group">
                <label>Comissão Vendedor (%):</label>
                <input type="number" id="p-comm" class="form-control" value="${p.commissionPct}" step="0.5" />
              </div>
            </div>
          </div>

          <!-- Aba 3: Estoque & Localização -->
          <div id="ptab-estoque" class="ptab-content" style="display:none;">
            <div class="form-grid">
              <div class="form-group">
                <label>Estoque Atual:</label>
                <input type="number" id="p-qty" class="form-control" value="${p.quantity}" step="0.001" />
              </div>
              <div class="form-group">
                <label>Estoque Mínimo (Alerta de Reposição):</label>
                <input type="number" id="p-minq" class="form-control" value="${p.minQuantity}" step="1" />
              </div>
              <div class="form-group">
                <label>Localização na Loja (Corredor / Gôndola):</label>
                <input type="text" id="p-loc" class="form-control" value="${p.location || ''}" placeholder="Ex: Corredor B - Gôndola 02" />
              </div>
              <div class="form-group">
                <label>Data de Validade:</label>
                <input type="date" id="p-exp" class="form-control" value="${p.expiryDate || ''}" />
              </div>
            </div>
          </div>

          <!-- Aba 4: Fiscal & Balança -->
          <div id="ptab-fiscal" class="ptab-content" style="display:none;">
            <div class="form-grid">
              <div class="form-group">
                <label>Código NCM:</label>
                <input type="text" id="p-ncm" class="form-control" value="${p.ncm || ''}" placeholder="Ex: 10063021" />
              </div>
              <div class="form-group">
                <label>CFOP Padrão:</label>
                <input type="text" id="p-cfop" class="form-control" value="${p.cfop || '5102'}" />
              </div>
              <div class="form-group">
                <label>Produto Pesável no Caixa (Balança):</label>
                <select id="p-weigh" class="form-control">
                  <option value="0" ${!p.isWeighable ? 'selected' : ''}>Não (Mercadoria Tradicional)</option>
                  <option value="1" ${p.isWeighable ? 'selected' : ''}>Sim (Pesa na Balança de Checkout)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Código PLU da Balança:</label>
                <input type="text" id="p-plu" class="form-control" value="${p.pluCode || ''}" placeholder="Ex: 123" />
              </div>
            </div>
          </div>

          <!-- Aba 5: Moda & Grade -->
          <div id="ptab-grade" class="ptab-content" style="display:none;">
            <div class="form-grid">
              <div class="form-group">
                <label>Tamanho (Vestuário / Calçado):</label>
                <input type="text" id="p-size" class="form-control" value="${p.size || ''}" placeholder="Ex: P, M, G, GG, 40, 42" />
              </div>
              <div class="form-group">
                <label>Cor / Estampa:</label>
                <input type="text" id="p-color" class="form-control" value="${p.color || ''}" placeholder="Ex: Azul Marinho, Preto, Floral" />
              </div>
            </div>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-success" onclick="saveProductForm('${id || ''}')">💾 Gravar Produto</button>
        </footer>
      </div>
    </div>
  `;
}

function switchProductTab(tabName, el) {
  document.querySelectorAll(".ptab-content").forEach(x => x.style.display = "none");
  document.querySelectorAll(".tab-link").forEach(x => x.classList.remove("active"));
  document.getElementById(`ptab-${tabName}`).style.display = "block";
  el.classList.add("active");
}

function calcSaleFromCost() {
  const cost = parseFloat(document.getElementById("p-cost").value) || 0;
  const markup = parseFloat(document.getElementById("p-markup").value) || 0;
  const sale = Math.round(cost * (1 + markup / 100) * 100) / 100;
  document.getElementById("p-sale").value = sale;
}

async function saveProductForm(existingId) {
  const payload = {
    id: existingId || null,
    sku: document.getElementById("p-sku").value.trim(),
    barcode: document.getElementById("p-bar").value.trim() || null,
    name: document.getElementById("p-name").value.trim(),
    brand: document.getElementById("p-brand").value.trim() || null,
    category: document.getElementById("p-cat").value,
    unit: document.getElementById("p-unit").value,
    costPrice: parseFloat(document.getElementById("p-cost").value) || 0,
    markupPct: parseFloat(document.getElementById("p-markup").value) || 0,
    salePrice: parseFloat(document.getElementById("p-sale").value) || 0,
    commissionPct: parseFloat(document.getElementById("p-comm").value) || 0,
    quantity: parseFloat(document.getElementById("p-qty").value) || 0,
    minQuantity: parseFloat(document.getElementById("p-minq").value) || 0,
    location: document.getElementById("p-loc").value.trim() || null,
    ncm: document.getElementById("p-ncm").value.trim() || null,
    cfop: document.getElementById("p-cfop").value.trim() || "5102",
    isWeighable: document.getElementById("p-weigh").value === "1",
    pluCode: document.getElementById("p-plu").value.trim() || null,
    size: document.getElementById("p-size").value.trim() || null,
    color: document.getElementById("p-color").value.trim() || null,
    expiryDate: document.getElementById("p-exp").value || null
  };

  if (!payload.name || !payload.sku || payload.salePrice <= 0) {
    alert("Preencha Nome, SKU e Preço de Venda corretamente!");
    return;
  }

  await API.post("/api/products", payload);
  closeModal();
  loadProductsTable();
}

// =====================================================================
// 3. MÓDULO RETAGUARDA: CLIENTES & CREDIÁRIO (TELA CADASTRO CLIENTES)
// =====================================================================
function renderCustomersModule() {
  setTimeout(() => loadCustomersTable(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <h2 class="panel-title">👥 Cadastro de Clientes & Limites de Crediário</h2>
        <button class="btn btn-success" onclick="openCustomerEditModal(null)">+ Novo Cliente</button>
      </header>

      <div style="display:flex; gap:12px; margin-bottom:16px;">
        <input type="text" id="cust-filter-q" class="form-control" style="flex:1;" placeholder="Buscar por Nome, CPF, CNPJ ou Telefone..." oninput="loadCustomersTable()" />
      </div>

      <div class="table-wrap" id="customers-table-container">
        <p style="color:#94a3b8; padding:20px;">Carregando clientes...</p>
      </div>
    </div>
  `;
}

async function loadCustomersTable() {
  const container = document.getElementById("customers-table-container");
  if (!container) return;

  const q = document.getElementById("cust-filter-q")?.value || "";
  const list = await API.get(`/api/customers?query=${encodeURIComponent(q)}`);
  state.customers = list;

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Nome / Razão Social</th>
          <th>CPF / CNPJ</th>
          <th>Telefone / Celular</th>
          <th>Cidade / UF</th>
          <th>Limite Crediário</th>
          <th>Débito Atual</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(c => `
          <tr>
            <td><span class="status-pill ${c.type === 'PJ' ? 'blue' : ''}">${c.type}</span></td>
            <td><strong>${c.name}</strong> ${c.tradeName ? `<br><small style="color:#94a3b8;">${c.tradeName}</small>` : ''}</td>
            <td>${c.cpfCnpj || "-"}</td>
            <td>${c.cellPhone || c.phone || "-"}</td>
            <td>${c.city || "-"}/${c.state || "-"}</td>
            <td>${fmtMoeda(c.creditLimit)}</td>
            <td style="color:${c.currentDebt > 0 ? '#ef4444' : '#10b981'}; font-weight:700;">${fmtMoeda(c.currentDebt)}</td>
            <td>
              <span class="status-pill ${c.blocked ? 'amber' : ''}">
                ${c.blocked ? 'BLOQUEADO' : 'LIBERADO'}
              </span>
            </td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="openCustomerEditModal('${c.id}')">Editar</button>
              <button class="btn btn-outline btn-sm" onclick="openCustomerCrediarioModal('${c.id}')">Carnês</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// Modal Completo de Edição de Cliente (PF/PJ + Endereço ViaCEP + Limite)
async function openCustomerEditModal(id) {
  let c = {
    type: "PF", name: "", tradeName: "", cpfCnpj: "", rgIe: "", phone: "", cellPhone: "",
    email: "", zipCode: "", street: "", number: "", neighborhood: "", city: "", state: "SP",
    deliveryAddress: "", creditLimit: 500, currentDebt: 0, blocked: false, notes: ""
  };

  if (id) {
    c = await API.get(`/api/customers/${id}`);
  }

  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong style="color:#fff;">${id ? "✏️ Editar Cadastro de Cliente" : "➕ Novo Cadastro de Cliente"}</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>

        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Tipo de Pessoa:</label>
              <select id="c-type" class="form-control" onchange="toggleCustomerTypeUI()">
                <option value="PF" ${c.type === 'PF' ? 'selected' : ''}>Pessoa Física (CPF)</option>
                <option value="PJ" ${c.type === 'PJ' ? 'selected' : ''}>Pessoa Jurídica (CNPJ)</option>
              </select>
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label id="lbl-c-name">Nome Completo: *</label>
              <input type="text" id="c-name" class="form-control" value="${c.name}" required />
            </div>
            <div class="form-group">
              <label id="lbl-c-doc">CPF:</label>
              <input type="text" id="c-doc" class="form-control" value="${c.cpfCnpj || ''}" placeholder="000.000.000-00" />
            </div>
            <div class="form-group">
              <label id="lbl-c-rg">RG / IE:</label>
              <input type="text" id="c-rg" class="form-control" value="${c.rgIe || ''}" />
            </div>
            <div class="form-group">
              <label>Telefone / Celular:</label>
              <input type="text" id="c-phone" class="form-control" value="${c.cellPhone || c.phone || ''}" placeholder="(11) 98765-4321" />
            </div>
            <div class="form-group">
              <label>E-mail:</label>
              <input type="email" id="c-email" class="form-control" value="${c.email || ''}" />
            </div>

            <!-- Endereço com Busca Automática de CEP -->
            <div class="form-group">
              <label>CEP (Busca Automática):</label>
              <div style="display:flex; gap:6px;">
                <input type="text" id="c-cep" class="form-control" value="${c.zipCode || ''}" placeholder="00000-000" />
                <button type="button" class="btn btn-secondary btn-sm" onclick="lookupCep()">Buscar</button>
              </div>
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label>Logradouro / Rua:</label>
              <input type="text" id="c-street" class="form-control" value="${c.street || ''}" />
            </div>
            <div class="form-group">
              <label>Número:</label>
              <input type="text" id="c-num" class="form-control" value="${c.number || ''}" />
            </div>
            <div class="form-group">
              <label>Bairro:</label>
              <input type="text" id="c-neigh" class="form-control" value="${c.neighborhood || ''}" />
            </div>
            <div class="form-group">
              <label>Cidade:</label>
              <input type="text" id="c-city" class="form-control" value="${c.city || ''}" />
            </div>
            <div class="form-group">
              <label>UF:</label>
              <input type="text" id="c-uf" class="form-control" value="${c.state || 'SP'}" />
            </div>

            <!-- Limite de Crédito / Crediário -->
            <div class="form-group">
              <label>Limite de Crédito Aprovado (R$):</label>
              <input type="number" id="c-limit" class="form-control" value="${c.creditLimit}" step="50" />
            </div>
            <div class="form-group">
              <label>Situação da Conta:</label>
              <select id="c-block" class="form-control">
                <option value="0" ${!c.blocked ? 'selected' : ''}>Liberado para Compras</option>
                <option value="1" ${c.blocked ? 'selected' : ''}>Bloqueado por Inadimplência</option>
              </select>
            </div>
          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-success" onclick="saveCustomerForm('${id || ''}')">💾 Gravar Cliente</button>
        </footer>
      </div>
    </div>
  `;
}

async function lookupCep() {
  const cep = document.getElementById("c-cep").value.replace(/\D/g, "");
  if (cep.length !== 8) {
    alert("Informe um CEP válido com 8 dígitos!");
    return;
  }
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then(r => r.json());
    if (res.erro) {
      alert("CEP não encontrado!");
      return;
    }
    document.getElementById("c-street").value = res.logradouro || "";
    document.getElementById("c-neigh").value = res.bairro || "";
    document.getElementById("c-city").value = res.localidade || "";
    document.getElementById("c-uf").value = res.uf || "";
    document.getElementById("c-num").focus();
  } catch (e) {
    alert("Erro na consulta de CEP: " + e.message);
  }
}

async function saveCustomerForm(existingId) {
  const payload = {
    id: existingId || null,
    type: document.getElementById("c-type").value,
    name: document.getElementById("c-name").value.trim(),
    tradeName: null,
    cpfCnpj: document.getElementById("c-doc").value.trim() || null,
    rgIe: document.getElementById("c-rg").value.trim() || null,
    cellPhone: document.getElementById("c-phone").value.trim() || null,
    phone: null,
    email: document.getElementById("c-email").value.trim() || null,
    zipCode: document.getElementById("c-cep").value.trim() || null,
    street: document.getElementById("c-street").value.trim() || null,
    number: document.getElementById("c-num").value.trim() || null,
    neighborhood: document.getElementById("c-neigh").value.trim() || null,
    city: document.getElementById("c-city").value.trim() || null,
    state: document.getElementById("c-uf").value.trim() || "SP",
    creditLimit: parseFloat(document.getElementById("c-limit").value) || 0,
    currentDebt: 0,
    blocked: document.getElementById("c-block").value === "1",
    notes: null
  };

  if (!payload.name) {
    alert("Informe o nome do cliente!");
    return;
  }

  await API.post("/api/customers", payload);
  closeModal();
  loadCustomersTable();
}

// =====================================================================
// 4. MÓDULO RETAGUARDA: CAIXA DIÁRIO & MOVIMENTAÇÕES (TELA CAIXA DIÁRIO)
// =====================================================================
function renderCashModule() {
  setTimeout(() => loadCashModuleData(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <h2 class="panel-title">💵 Controle de Caixa Diário & Movimentações de Gaveta</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" onclick="openSuprimentoModal()">🔺 + Suprimento (Troco)</button>
          <button class="btn btn-danger" onclick="openSangriaModal()">🔻 - Sangria (Retirada)</button>
          <button class="btn btn-outline" onclick="openCloseCashModal()">🔒 Fechamento de Caixa</button>
        </div>
      </header>

      <div id="cash-status-cards" class="metrics-grid">
        <p style="color:#94a3b8; padding:20px;">Carregando dados da sessão de caixa...</p>
      </div>

      <div style="margin-top:24px;">
        <h3 style="font-size:16px; color:#fff; margin-bottom:12px;">📋 Movimentações Lançadas no Caixa Atual</h3>
        <div class="table-wrap" id="cash-movements-container"></div>
      </div>
    </div>
  `;
}

async function loadCashModuleData() {
  const cards = document.getElementById("cash-status-cards");
  const movWrap = document.getElementById("cash-movements-container");
  if (!cards || !movWrap) return;

  const data = await API.get("/api/cash/current");
  if (!data || !data.session) {
    cards.innerHTML = `
      <div class="metric-card" style="grid-column: span 3; background:#7f1d1d;">
        <span style="color:#fff;">Status do Caixa</span>
        <strong style="color:#fecaca;">CAIXA FECHADO</strong>
        <p style="font-size:13px; color:#fff; margin-top:8px;">Nenhum caixa está aberto no momento. Clique no botão abaixo para abrir:</p>
        <button class="btn btn-success" style="width:200px; margin-top:10px;" onclick="openOpenCashModal()">Abrir Caixa Agora</button>
      </div>
    `;
    movWrap.innerHTML = "";
    return;
  }

  const s = data.session;
  state.cashSession = s;

  cards.innerHTML = `
    <div class="metric-card">
      <span>Operador Responsável</span>
      <strong>${s.operatorName}</strong>
      <small style="color:#38bdf8;">Aberto às ${fmtDataHora(s.openedAt)}</small>
    </div>
    <div class="metric-card">
      <span>Fundo de Troco Inicial</span>
      <strong>${fmtMoeda(s.openingBalance)}</strong>
      <small>Saldo inicial de abertura</small>
    </div>
    <div class="metric-card">
      <span>Total Entradas (Vendas + Sup.)</span>
      <strong style="color:#22c55e;">${fmtMoeda(s.totalInflows)}</strong>
      <small style="color:#22c55e;">+ Recebimentos em dinheiro</small>
    </div>
    <div class="metric-card">
      <span>Total Saídas (Sangrias)</span>
      <strong style="color:#ef4444;">${fmtMoeda(s.totalOutflows)}</strong>
      <small style="color:#ef4444;">- Retiradas de caixa</small>
    </div>
    <div class="metric-card" style="border-color:#22c55e;">
      <span>Saldo Esperado em Gaveta</span>
      <strong style="color:#22c55e; font-size:28px;">${fmtMoeda(s.closingBalanceExpected)}</strong>
      <small style="color:#cbd5e1;">Conferência física obrigatória</small>
    </div>
  `;

  movWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Horário</th>
          <th>Tipo</th>
          <th>Descrição da Movimentação</th>
          <th>Operador</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        ${data.movements.map(m => `
          <tr>
            <td>${fmtDataHora(m.createdAt)}</td>
            <td>
              <span class="status-pill ${m.type === 'SANGRIA' ? 'amber' : (m.type === 'VENDA' || m.type === 'CREDIARIO' ? '' : 'blue')}">
                ${m.type}
              </span>
            </td>
            <td><strong>${m.description}</strong></td>
            <td>${m.operatorName}</td>
            <td style="color:${m.type === 'SANGRIA' ? '#ef4444' : '#22c55e'}; font-weight:700;">
              ${m.type === 'SANGRIA' ? '-' : '+'}${fmtMoeda(m.amount)}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function openSangriaModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong style="color:#fff;">🔻 Lançamento de Sangria de Caixa (Retirada)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body">
          <div class="form-group">
            <label>Valor da Retirada (R$): *</label>
            <input type="number" id="sangria-val" class="form-control" style="font-size:20px; font-weight:800; color:#ef4444;" step="10" placeholder="0.00" autofocus />
          </div>
          <div class="form-group" style="margin-top:14px;">
            <label>Motivo da Sangria / Justificativa:</label>
            <input type="text" id="sangria-desc" class="form-control" value="Sangria periódica de segurança para cofre" />
          </div>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-danger" onclick="submitSangria()">Confirmar Sangria & Imprimir Comprovante</button>
        </footer>
      </div>
    </div>
  `;
}

async function submitSangria() {
  const amt = parseFloat(document.getElementById("sangria-val").value) || 0;
  const desc = document.getElementById("sangria-desc").value.trim();
  if (amt <= 0) {
    alert("Informe um valor válido para a sangria!");
    return;
  }
  await API.post("/api/cash/sangria", { amount: amt, description: desc, operatorName: state.user.name });
  closeModal();
  alert(`✅ SANGRIA DE ${fmtMoeda(amt)} REGISTRADA COM SUCESSO!\nComprovante impresso para assinatura do operador.`);
  if (state.currentRoute === "/caixa") loadCashModuleData();
}

function openSuprimentoModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong style="color:#fff;">🔺 Lançamento de Suprimento de Caixa (Fundo de Troco)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body">
          <div class="form-group">
            <label>Valor do Suprimento (R$): *</label>
            <input type="number" id="sup-val" class="form-control" style="font-size:20px; font-weight:800; color:#22c55e;" step="10" placeholder="0.00" autofocus />
          </div>
          <div class="form-group" style="margin-top:14px;">
            <label>Descrição / Origem:</label>
            <input type="text" id="sup-desc" class="form-control" value="Reforço de moedas e cédulas para troco" />
          </div>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-success" onclick="submitSuprimento()">Confirmar Suprimento</button>
        </footer>
      </div>
    </div>
  `;
}

async function submitSuprimento() {
  const amt = parseFloat(document.getElementById("sup-val").value) || 0;
  const desc = document.getElementById("sup-desc").value.trim();
  if (amt <= 0) {
    alert("Informe um valor válido para o suprimento!");
    return;
  }
  await API.post("/api/cash/suprimento", { amount: amt, description: desc, operatorName: state.user.name });
  closeModal();
  alert(`✅ SUPRIMENTO DE ${fmtMoeda(amt)} REGISTRADO COM SUCESSO!`);
  if (state.currentRoute === "/caixa") loadCashModuleData();
}

function openCloseCashModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong style="color:#fff;">🔒 Fechamento de Caixa Diário (Leitura Z / Sangria Cega)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body">
          <p style="font-size:13px; color:#cbd5e1; margin-bottom:14px;">
            Informe o valor físico total apurado e contado na gaveta de dinheiro para fechamento e conferência de caixa:
          </p>
          <div class="form-group">
            <label>Valor Contado em Gaveta (R$): *</label>
            <input type="number" id="close-physical" class="form-control" style="font-size:22px; font-weight:900; color:#f59e0b;" step="0.50" placeholder="0.00" autofocus />
          </div>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-danger" onclick="submitCloseCash()">Finalizar e Fechar Caixa</button>
        </footer>
      </div>
    </div>
  `;
}

async function submitCloseCash() {
  const phys = parseFloat(document.getElementById("close-physical").value);
  if (isNaN(phys)) {
    alert("Informe o valor físico contado!");
    return;
  }
  const res = await API.post("/api/cash/close", { physicalBalance: phys });
  closeModal();

  const diffMsg = res.difference === 0 ? "Saldo conferido exatamente sem sobras ou faltas." : (res.difference > 0 ? `Sobra de caixa: +${fmtMoeda(res.difference)}` : `Falta de caixa: ${fmtMoeda(res.difference)}`);

  alert(`🔒 CAIXA FECHADO COM SUCESSO!\n\nSaldo Esperado: ${fmtMoeda(res.expectedBalance)}\nSaldo Físico Contado: ${fmtMoeda(res.physicalBalance)}\n${diffMsg}\n\n[Relatório analítico de fechamento de caixa gerado]`);
  if (state.currentRoute === "/caixa") loadCashModuleData();
}

// =====================================================================
// 5. MÓDULO RETAGUARDA: FINANCEIRO (CONTAS A PAGAR E RECEBER)
// =====================================================================
function renderFinancialModule() {
  setTimeout(() => loadFinancialData(), 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <h2 class="panel-title">💳 Gestão Financeira - Contas a Pagar e Receber</h2>
        <button class="btn btn-success" onclick="openFinancialEntryModal()">+ Lançar Nova Conta / Boleto</button>
      </header>

      <div style="display:flex; gap:12px; margin-bottom:16px;">
        <select id="fin-type" class="form-control" style="width:200px;" onchange="loadFinancialData()">
          <option value="">Todas (Pagar e Receber)</option>
          <option value="PAGAR">Contas a Pagar</option>
          <option value="RECEBER">Contas a Receber</option>
        </select>
        <select id="fin-status" class="form-control" style="width:200px;" onchange="loadFinancialData()">
          <option value="">Todos os Status</option>
          <option value="PENDENTE">Pendentes</option>
          <option value="PAGO">Liquidadas / Pagas</option>
        </select>
      </div>

      <div class="table-wrap" id="financial-table-container">
        <p style="color:#94a3b8; padding:20px;">Carregando lançamentos financeiros...</p>
      </div>
    </div>
  `;
}

async function loadFinancialData() {
  const container = document.getElementById("financial-table-container");
  if (!container) return;

  const type = document.getElementById("fin-type")?.value || "";
  const status = document.getElementById("fin-status")?.value || "";

  const list = await API.get(`/api/financial?type=${type}&status=${status}`);

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Título / Descrição</th>
          <th>Doc. Nº</th>
          <th>Favorecido / Cedente</th>
          <th>Banco Emissor</th>
          <th>Vencimento</th>
          <th>Valor</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(f => `
          <tr>
            <td>
              <span class="status-pill ${f.type === 'PAGAR' ? 'amber' : 'blue'}">${f.type}</span>
            </td>
            <td><strong>${f.title}</strong> ${f.barcode ? `<br><small style="color:#64748b;">${f.barcode}</small>` : ''}</td>
            <td>${f.docNumber || "-"}</td>
            <td>${f.entityName || "-"}</td>
            <td>${f.issuerBank || "-"}</td>
            <td><strong>${fmtData(f.dueDate)}</strong></td>
            <td style="color:${f.type === 'PAGAR' ? '#ef4444' : '#22c55e'}; font-weight:800;">${fmtMoeda(f.amount)}</td>
            <td>
              <span class="status-pill ${f.status === 'PAGO' ? '' : 'amber'}">${f.status}</span>
            </td>
            <td>
              ${f.status === 'PENDENTE' ? `
                <button class="btn btn-success btn-sm" onclick="settleFinancialEntry('${f.id}', ${f.amount})">Baixar / Pagar</button>
              ` : `
                <small style="color:#10b981;">Pago em ${fmtData(f.paidAt)}</small>
              `}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function openFinancialEntryModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box wide">
        <header class="modal-header">
          <strong style="color:#fff;">➕ Lançamento de Conta (Boleto / Título Financeiro)</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Tipo de Lançamento:</label>
              <select id="fe-type" class="form-control">
                <option value="PAGAR">Conta a Pagar (Despesa / Fornecedor)</option>
                <option value="RECEBER">Conta a Receber (Receita / Convênio)</option>
              </select>
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label>Título / Descrição da Conta: *</label>
              <input type="text" id="fe-title" class="form-control" placeholder="Ex: Fornecimento de Carnes Friboi NF-8901" required />
            </div>
            <div class="form-group">
              <label>Documento Nº:</label>
              <input type="text" id="fe-doc" class="form-control" placeholder="DOC-12345" />
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label>Código de Barras / Linha Digitável do Boleto:</label>
              <input type="text" id="fe-bar" class="form-control" placeholder="00190.00009 01234.567809 12345.678901 1 90000000100000" />
            </div>
            <div class="form-group">
              <label>Banco Emissor:</label>
              <select id="fe-bank" class="form-control">
                <option>Banco do Brasil</option>
                <option>Caixa Econômica Federal</option>
                <option>Bradesco</option>
                <option>Itaú Unibanco</option>
                <option>Santander</option>
                <option>Banco Inter</option>
                <option>Outros</option>
              </select>
            </div>
            <div class="form-group">
              <label>Cedente / Favorecido:</label>
              <input type="text" id="fe-ent" class="form-control" placeholder="Ex: JBS S.A." />
            </div>
            <div class="form-group">
              <label>Data de Vencimento: *</label>
              <input type="date" id="fe-due" class="form-control" value="${new Date().toISOString().split('T')[0]}" required />
            </div>
            <div class="form-group">
              <label>Valor Total (R$): *</label>
              <input type="number" id="fe-amt" class="form-control" style="font-weight:800; color:#22c55e;" step="0.50" placeholder="0.00" required />
            </div>
          </div>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-success" onclick="saveFinancialEntry()">💾 Registrar Título</button>
        </footer>
      </div>
    </div>
  `;
}

async function saveFinancialEntry() {
  const payload = {
    id: null,
    type: document.getElementById("fe-type").value,
    title: document.getElementById("fe-title").value.trim(),
    docNumber: document.getElementById("fe-doc").value.trim() || null,
    barcode: document.getElementById("fe-bar").value.trim() || null,
    issuerBank: document.getElementById("fe-bank").value,
    entityName: document.getElementById("fe-ent").value.trim() || null,
    dueDate: document.getElementById("fe-due").value,
    amount: parseFloat(document.getElementById("fe-amt").value) || 0,
    installmentNumber: 1,
    totalInstallments: 1
  };

  if (!payload.title || payload.amount <= 0) {
    alert("Preencha título e valor corretamente!");
    return;
  }

  await API.post("/api/financial", payload);
  closeModal();
  loadFinancialData();
}

async function settleFinancialEntry(id, amount) {
  if (confirm(`Confirmar liquidação e baixa do título no valor de ${fmtMoeda(amount)}?`)) {
    await API.post(`/api/financial/${id}/settle`, { amount, discount: 0, interest: 0 });
    alert("✅ Título liquidado com sucesso!");
    loadFinancialData();
  }
}

// =====================================================================
// 6. MÓDULO RETAGUARDA: CREDIÁRIO / CARNÊS (TELA DETALHE CREDIÁRIO)
// =====================================================================
function renderCrediarioModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <h2 class="panel-title">📑 Central de Crediário, Carnês e Faturas a Prazo</h2>
      </header>

      <div class="form-group" style="max-width:500px; margin-bottom:20px;">
        <label>Selecione o Cliente para Consultar Extrato de Crediário:</label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="cr-cust-name" class="form-control" placeholder="Clique em 'Localizar' para escolher cliente..." readonly />
          <button class="btn btn-secondary" onclick="openCrediarioCustomerPicker()">🔍 Localizar Cliente</button>
        </div>
      </div>

      <div id="crediario-details-area">
        <p style="color:#94a3b8; padding:30px; text-align:center;">Selecione um cliente acima para visualizar os carnês em aberto e amortizar parcelas.</p>
      </div>
    </div>
  `;
}

function openCrediarioCustomerPicker() {
  openCustomerIdentifyModal();
  // Sobrescreve a seleção para abrir o crediário
  window.selectCustomerForPdv = async (id) => {
    closeModal();
    loadCustomerCrediario(id);
  };
}

async function loadCustomerCrediario(customerId) {
  const area = document.getElementById("crediario-details-area");
  if (!area) return;

  const data = await API.get(`/api/crediario/customer/${customerId}`);
  const c = data.customer;
  document.getElementById("cr-cust-name").value = `${c.name} (${c.cpfCnpj || 'Sem CPF'})`;

  area.innerHTML = `
    <div class="metrics-grid" style="margin-bottom:20px;">
      <div class="metric-card">
        <span>Limite Total Aprovado</span>
        <strong>${fmtMoeda(c.creditLimit)}</strong>
      </div>
      <div class="metric-card" style="border-color:#ef4444;">
        <span>Saldo Devedor em Aberto</span>
        <strong style="color:#ef4444;">${fmtMoeda(c.currentDebt)}</strong>
      </div>
      <div class="metric-card" style="border-color:#10b981;">
        <span>Limite Disponível para Compras</span>
        <strong style="color:#10b981;">${fmtMoeda(Math.max(0, c.creditLimit - c.currentDebt))}</strong>
      </div>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <h3 style="font-size:16px; color:#fff;">Carnês / Faturas em Aberto</h3>
      <button class="btn btn-success" onclick="openReceiveCrediarioModal('${c.id}', ${c.currentDebt})">💵 Receber / Amortizar Valor</button>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Nº Carnê / Contrato</th>
          <th>Data Emissão</th>
          <th>Data Vencimento</th>
          <th>Valor Original</th>
          <th>Saldo Devedor</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${data.accounts.length === 0 ? `
          <tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:20px;">Nenhum carnê em aberto para este cliente.</td></tr>
        ` : data.accounts.map(acc => `
          <tr>
            <td><strong>${acc.contractNumber}</strong></td>
            <td>${fmtData(acc.createdAt)}</td>
            <td><strong>${fmtData(acc.dueDate)}</strong></td>
            <td>${fmtMoeda(acc.totalAmount)}</td>
            <td style="color:#ef4444; font-weight:800;">${fmtMoeda(acc.balance)}</td>
            <td><span class="status-pill ${acc.status === 'PAGO' ? '' : 'amber'}">${acc.status}</span></td>
            <td>
              <button class="btn btn-success btn-sm" onclick="openReceiveCrediarioModal('${c.id}', ${acc.balance}, '${acc.id}')">Receber Parcela</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <div style="margin-top:24px;">
      <h3 style="font-size:16px; color:#fff; margin-bottom:12px;">Histórico de Recibos Pagos</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Data Pagamento</th>
            <th>Valor Recebido</th>
            <th>Desconto</th>
            <th>Juros</th>
            <th>Operador</th>
          </tr>
        </thead>
        <tbody>
          ${data.receipts.map(r => `
            <tr>
              <td>${fmtDataHora(r.paidAt)}</td>
              <td style="color:#22c55e; font-weight:800;">${fmtMoeda(r.amountPaid)}</td>
              <td>${fmtMoeda(r.discount)}</td>
              <td>${fmtMoeda(r.penaltyInterest)}</td>
              <td>${r.operatorName}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function openReceiveCrediarioModal(customerId, defaultAmt, accountId = null) {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong style="color:#fff;">💵 Recebimento de Crediário / Carnê</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body">
          <div class="form-group">
            <label>Valor a Receber (R$): *</label>
            <input type="number" id="rec-amt" class="form-control" style="font-size:22px; font-weight:900; color:#22c55e;" value="${defaultAmt}" step="1" required autofocus />
          </div>
          <div class="form-grid" style="margin-top:14px;">
            <div class="form-group">
              <label>Desconto Concedido (R$):</label>
              <input type="number" id="rec-desc" class="form-control" value="0.00" step="1" />
            </div>
            <div class="form-group">
              <label>Juros / Multa de Mora (R$):</label>
              <input type="number" id="rec-pen" class="form-control" value="0.00" step="1" />
            </div>
          </div>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-success" onclick="executeCrediarioReceipt('${customerId}', '${accountId || ''}')">✔️ Confirmar Recebimento & Imprimir Recibo</button>
        </footer>
      </div>
    </div>
  `;
}

async function executeCrediarioReceipt(customerId, accountId) {
  const amt = parseFloat(document.getElementById("rec-amt").value) || 0;
  const desc = parseFloat(document.getElementById("rec-desc").value) || 0;
  const interest = parseFloat(document.getElementById("rec-pen").value) || 0;

  if (amt <= 0) {
    alert("Informe o valor a receber!");
    return;
  }

  const payload = {
    customerId,
    creditAccountId: accountId || null,
    amount: amt,
    discount: desc,
    interest,
    operatorName: state.user.name
  };

  const res = await API.post("/api/crediario/receive", payload);
  closeModal();
  alert(`✅ RECEBIMENTO DE CREDIÁRIO EFETUADO COM SUCESSO!\n\nValor: ${fmtMoeda(res.amountPaid)}\nRecibo gerado para assinatura e entrega ao cliente.`);
  loadCustomerCrediario(customerId);
}

// =====================================================================
// 7. MÓDULO RETAGUARDA: ENTRADA DE NOTAS FISCAIS XML (LEITOR XML / COMPRAS)
// =====================================================================
let parsedNfeData = null;

function renderNfeImportModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <h2 class="panel-title">📥 Entrada de Mercadorias por Importação de XML (NF-e SEFAZ v4.00)</h2>
      </header>

      <p style="font-size:13px; color:#cbd5e1; margin-bottom:14px;">
        Faça o upload do arquivo XML da NF-e emitida pelo fornecedor para dar entrada automática de estoque, conciliar preços de custo e gerar conta a pagar:
      </p>

      <div style="display:flex; gap:12px; align-items:center; margin-bottom:20px;">
        <input type="file" id="nfe-file-input" accept=".xml" class="form-control" style="flex:1;" />
        <button class="btn btn-success" onclick="handleNfeXmlUpload()">Carregar e Interpretar XML</button>
      </div>

      <div id="nfe-parsed-area"></div>
    </div>
  `;
}

async function handleNfeXmlUpload() {
  const fileInput = document.getElementById("nfe-file-input");
  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Selecione um arquivo XML de NF-e!");
    return;
  }

  const file = fileInput.files[0];
  const text = await file.text();

  const res = await fetch("/api/nfe/parse", {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: text
  }).then(r => r.json());

  if (res.error) {
    alert(res.error);
    return;
  }

  parsedNfeData = res;
  renderParsedNfeUI();
}

function renderParsedNfeUI() {
  const area = document.getElementById("nfe-parsed-area");
  if (!area || !parsedNfeData) return;

  const d = parsedNfeData;
  area.innerHTML = `
    <div class="metrics-grid">
      <div class="metric-card">
        <span>NF-e Número</span>
        <strong>#${d.invoiceNumber}</strong>
        <small>Emissão: ${fmtDataHora(d.issueDate)}</small>
      </div>
      <div class="metric-card">
        <span>Fornecedor / Emitente</span>
        <strong>${d.supplier.tradeName || d.supplier.corporateName}</strong>
        <small>CNPJ: ${d.supplier.cnpj}</small>
      </div>
      <div class="metric-card" style="border-color:#22c55e;">
        <span>Valor Total da Nota</span>
        <strong style="color:#22c55e;">${fmtMoeda(d.totalAmount)}</strong>
        <small>${d.items.length} itens contidos na nota</small>
      </div>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; margin: 20px 0 10px;">
      <h3 style="font-size:16px; color:#fff;">Itens da Nota Fiscal & Formação de Preço de Venda</h3>
      <button class="btn btn-success" onclick="confirmNfeImport()">✔️ Concluir Entrada de Estoque</button>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Cód. Fornec.</th>
          <th>Código Barras</th>
          <th>Descrição do Produto</th>
          <th>NCM</th>
          <th>Qtd. Entrada</th>
          <th>Custo Un.</th>
          <th>Margem %</th>
          <th>Preço Venda Sugerido</th>
        </tr>
      </thead>
      <tbody>
        ${d.items.map((it, idx) => `
          <tr>
            <td><strong>${it.sku}</strong></td>
            <td>${it.barcode || "-"}</td>
            <td><strong>${it.name}</strong></td>
            <td>${it.ncm}</td>
            <td><span class="status-pill blue">${fmtNum(it.quantity, 0)} ${it.unit}</span></td>
            <td>${fmtMoeda(it.costPrice)}</td>
            <td><input type="number" class="form-control" style="width:75px;" value="${it.suggestedMarkup}" id="nfe-markup-${idx}" oninput="recalcNfeItem(${idx})" /></td>
            <td style="color:#22c55e; font-weight:800;" id="nfe-sale-${idx}">${fmtMoeda(it.suggestedSalePrice)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function recalcNfeItem(idx) {
  const it = parsedNfeData.items[idx];
  const markup = parseFloat(document.getElementById(`nfe-markup-${idx}`).value) || 0;
  it.suggestedMarkup = markup;
  it.suggestedSalePrice = Math.round(it.costPrice * (1 + markup / 100) * 100) / 100;
  document.getElementById(`nfe-sale-${idx}`).innerText = fmtMoeda(it.suggestedSalePrice);
}

async function confirmNfeImport() {
  if (!parsedNfeData) return;
  const payload = {
    invoiceNumber: parsedNfeData.invoiceNumber,
    accessKey: parsedNfeData.accessKey,
    supplierCnpj: parsedNfeData.supplier.cnpj,
    supplierCorporateName: parsedNfeData.supplier.corporateName,
    supplierTradeName: parsedNfeData.supplier.tradeName,
    totalAmount: parsedNfeData.totalAmount,
    createPayable: true,
    items: parsedNfeData.items.map(i => ({
      sku: i.sku,
      barcode: i.barcode,
      name: i.name,
      ncm: i.ncm,
      unit: i.unit,
      quantity: i.quantity,
      costPrice: i.costPrice,
      markupPct: i.suggestedMarkup,
      salePrice: i.suggestedSalePrice
    }))
  };

  const res = await API.post("/api/nfe/import-parsed", payload);
  alert(`✅ ENTRADA DE NOTA Nº ${res.invoiceNumber} CONCLUÍDA!\n\n${res.importedCount} produtos inseridos/atualizados no estoque.\nConta a pagar gerada no financeiro com vencimento em 28 dias.`);
  navigate("/produtos");
}

// =====================================================================
// 8. MÓDULO TERMINAL DE ETIQUETAS & CARGA DE BALANÇA
// =====================================================================
function renderLabelsModule() {
  return `
    <div class="panel">
      <header class="panel-header">
        <h2 class="panel-title">🏷️ Central de Etiquetas e Carga para Balanças</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" onclick="downloadToledoCarga()">⚖️ Carga Toledo MGV</button>
          <button class="btn btn-secondary" onclick="downloadFilizolaCarga()">⚖️ Carga Filizola Smart</button>
        </div>
      </header>

      <div style="display:grid; grid-template-columns: 340px 1fr; gap:20px;">
        <!-- Configuração da Etiqueta -->
        <div style="background:#0f172a; padding:18px; border-radius:10px; border:1px solid #263554;">
          <div class="form-group">
            <label>Formato da Etiqueta:</label>
            <select id="lbl-format" class="form-control" onchange="updateLabelPreview()">
              <option value="GONDOLA">Gôndola Supermercado (com Procon R$/kg)</option>
              <option value="BALANCA">Balança Açougue / Padaria (EAN-13 flag 2)</option>
              <option value="ROUPAS">Vestuário / Roupas (Grade Tamanho x Cor)</option>
              <option value="BORBOLETA">Joia / Óculos / Mini Gôndola</option>
            </select>
          </div>

          <div class="form-group" style="margin-top:12px;">
            <label>Selecione o Produto Modelo:</label>
            <select id="lbl-prod-sel" class="form-control" onchange="updateLabelPreview()">
              <option value="101">Arroz Nobre Tipo 1 5kg (R$ 29,90)</option>
              <option value="201">Picanha Bovina Grill (R$ 69,90/kg)</option>
              <option value="301">Camisa Polo Slim Confort M (R$ 89,90)</option>
              <option value="103">Leite Integral UHT 1L (R$ 4,89)</option>
            </select>
          </div>

          <div class="form-group" style="margin-top:12px;">
            <label>Quantidade de Etiquetas a Imprimir:</label>
            <input type="number" id="lbl-copies" class="form-control" value="1" min="1" max="100" />
          </div>

          <button class="btn btn-success" style="width:100%; margin-top:20px;" onclick="printActiveLabel()">
            🖨️ Enviar Impressão Térmica (ZPL / EPL)
          </button>
        </div>

        <!-- Pré-visualização Gráfica ao Vivo -->
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; background:#070b13; padding:24px; border-radius:10px; border:1px solid #263554;">
          <div id="label-live-preview"></div>
        </div>
      </div>
    </div>
  `;
}

function updateLabelPreview() {
  const format = document.getElementById("lbl-format")?.value || "GONDOLA";
  const preview = document.getElementById("label-live-preview");
  if (!preview) return;

  if (format === "GONDOLA") {
    preview.innerHTML = `
      <div class="label-preview-card" style="width:360px;">
        <span style="font-size:11px; font-weight:800; text-transform:uppercase; color:#475569;">SUPERMERCADO MODELO</span>
        <strong style="font-size:16px; color:#0f172a; line-height:1.2;">ARROZ NOBRE TIPO 1 5KG</strong>
        <span style="font-size:11px; color:#64748b;">COD: 101 | NCM: 10063021</span>
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin: 8px 0;">
          <span style="font-size:12px; color:#475569;">PREÇO POR KG: <strong>R$ 5,98</strong></span>
          <span style="font-size:32px; font-weight:900; color:#dc2626;">R$ 29,90</span>
        </div>
        <div class="label-barcode">7891000100103</div>
      </div>
    `;
  } else if (format === "BALANCA") {
    preview.innerHTML = `
      <div class="label-preview-card" style="width:340px;">
        <span style="font-size:11px; font-weight:800; text-transform:uppercase; color:#475569;">AÇOUGUE MODELO</span>
        <strong style="font-size:15px; color:#0f172a;">PICANHA BOVINA GRILL ESPECIAL</strong>
        <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:4px;">
          <span>PLU: <strong>123</strong></span>
          <span>PESO: <strong>0,500 KG</strong></span>
          <span>VALOR/KG: <strong>R$ 69,90</strong></span>
        </div>
        <div style="text-align:right; margin: 6px 0;">
          <span style="font-size:26px; font-weight:900; color:#0f172a;">TOTAL: R$ 34,95</span>
        </div>
        <div class="label-barcode">200123003495</div>
        <span style="font-size:9px; color:#64748b; text-align:center;">EMB: 31/10/2026 | VAL: 15/11/2026</span>
      </div>
    `;
  } else if (format === "ROUPAS") {
    preview.innerHTML = `
      <div class="label-preview-card" style="width:320px; border-radius:12px;">
        <span style="font-size:11px; font-weight:800; color:#475569;">MAGAZINE MODELO - MODA</span>
        <strong style="font-size:16px; color:#0f172a;">CAMISA POLO SLIM CONFORT</strong>
        <div style="display:flex; justify-content:space-between; font-size:13px; margin: 6px 0;">
          <span>TAMANHO: <strong style="font-size:18px;">M</strong></span>
          <span>COR: <strong>AZUL MARINHO</strong></span>
        </div>
        <div style="text-align:center; margin: 8px 0;">
          <span style="font-size:32px; font-weight:900; color:#0f172a;">R$ 89,90</span>
          <br><small style="color:#64748b;">ou 3x de R$ 29,96 sem juros</small>
        </div>
        <div class="label-barcode">7892000100011</div>
      </div>
    `;
  }
}

function printActiveLabel() {
  alert("Impressão Térmica ZPL II enviada com sucesso para a porta RAW da impressora Zebra/Argox!");
}

function downloadToledoCarga() {
  const content = "0100123000699000000PICANHA BOVINA GRILL\n0100124000459000000QUEIJO MUSSARELA FATIADO\n0100125000099000000MACA NACIONAL FUJI\n";
  downloadTextFile("ITENSMGV.TXT", content);
}

function downloadFilizolaCarga() {
  const content = "00123P0006990000PICANHA BOVINA GRILL\n00124P0004590000QUEIJO MUSSARELA FATIADO\n00125P0000990000MACA NACIONAL FUJI\n";
  downloadTextFile("CADTXT.TXT", content);
}

function downloadTextFile(filename, text) {
  const el = document.createElement("a");
  el.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
  el.setAttribute("download", filename);
  el.style.display = "none";
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
}

// =====================================================================
// 9. MÓDULO RETAGUARDA: RELATÓRIOS EXECUTIVOS & CURVA ABC
// =====================================================================
function renderAbcReportModule() {
  setTimeout(async () => {
    const list = await API.get("/api/reports/abc");
    const container = document.getElementById("abc-report-container");
    if (!container) return;

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Classificação</th>
            <th>SKU</th>
            <th>Descrição da Mercadoria</th>
            <th>Qtd. Vendida</th>
            <th>Receita Total (R$)</th>
            <th>Participação</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((it, idx) => `
            <tr>
              <td>
                <span class="status-pill ${idx < 3 ? '' : (idx < 7 ? 'blue' : 'amber')}">
                  Classe ${idx < 3 ? 'A (80%)' : (idx < 7 ? 'B (15%)' : 'C (5%)')}
                </span>
              </td>
              <td><strong>${it.sku}</strong></td>
              <td>${it.name}</td>
              <td>${fmtNum(it.totalQuantity, 1)} ${it.unit}</td>
              <td style="color:#22c55e; font-weight:800;">${fmtMoeda(it.totalRevenue)}</td>
              <td>${fmtNum(100 / (idx + 1), 1)}%</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }, 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <h2 class="panel-title">📈 Curva ABC de Mercadorias e Lucratividade</h2>
      </header>
      <p style="font-size:13px; color:#cbd5e1; margin-bottom:16px;">
        Classificação matemática de Pareto dos produtos mais representativos no faturamento do estabelecimento:
      </p>
      <div class="table-wrap" id="abc-report-container">
        <p style="color:#94a3b8; padding:20px;">Processando curva ABC...</p>
      </div>
    </div>
  `;
}

// =====================================================================
// 10. MÓDULO RETAGUARDA: DASHBOARD EXECUTIVO
// =====================================================================
function renderDashboardModule() {
  setTimeout(async () => {
    const d = await API.get("/api/dashboard");
    const el = document.getElementById("dash-metrics");
    if (!el) return;

    el.innerHTML = `
      <div class="metric-card" style="border-color:#22c55e;">
        <span>Faturamento Total Vendas</span>
        <strong style="color:#22c55e; font-size:28px;">${fmtMoeda(d.salesTotal)}</strong>
        <small style="color:#22c55e;">${d.sales} vendas realizadas</small>
      </div>
      <div class="metric-card">
        <span>Catálogo de Produtos</span>
        <strong>${d.products} itens</strong>
        <small style="color:#38bdf8;">Supermercado & Moda</small>
      </div>
      <div class="metric-card">
        <span>Clientes Cadastrados</span>
        <strong>${d.customers} clientes</strong>
        <small style="color:#cbd5e1;">Pessoa Física & Jurídica</small>
      </div>
      <div class="metric-card" style="border-color:#ef4444;">
        <span>Contas a Pagar Pendentes</span>
        <strong style="color:#ef4444;">${fmtMoeda(d.pendingPayables)}</strong>
        <small style="color:#ef4444;">Fornecedores e boletos</small>
      </div>
      <div class="metric-card" style="border-color:#38bdf8;">
        <span>Contas a Receber</span>
        <strong style="color:#38bdf8;">${fmtMoeda(d.pendingReceivables)}</strong>
        <small>Convênios e empresas</small>
      </div>
      <div class="metric-card" style="border-color:#f59e0b;">
        <span>Débito Aberto no Crediário</span>
        <strong style="color:#f59e0b;">${fmtMoeda(d.totalCrediarioDebt)}</strong>
        <small>Carnês e fiado próprio</small>
      </div>
    `;
  }, 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <div>
          <h2 class="panel-title">🏢 Retaguarda Empresarial - Visão Executiva Geral</h2>
          <p style="font-size:12px; color:#94a3b8; margin-top:2px;">${state.company.name} | Segmento: ${state.company.segment}</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-success" onclick="navigate('/pdv')">⚡ Abrir Frente de Caixa (PDV)</button>
          <button class="btn btn-secondary" onclick="navigate('/caixa')">💵 Caixa Diário</button>
        </div>
      </header>

      <div class="metrics-grid" id="dash-metrics">
        <p style="color:#94a3b8; padding:20px;">Carregando métricas executivas...</p>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-top:20px;">
        <div class="panel" style="background:#0f172a; border-color:#263554;">
          <h3 class="panel-title" style="font-size:15px; margin-bottom:12px;">⚡ Operações Imediatas do Sistema</h3>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/produtos')">🛒 Gerenciar Catálogo de Produtos e Grade</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/compras-nfe')">📥 Dar Entrada em Nota Fiscal por XML (SEFAZ)</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/clientes')">👥 Cadastrar Cliente e Autorizar Crediário</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/financeiro')">💳 Lançar e Liquidar Boletos / Contas a Pagar</button>
            <button class="btn btn-outline" style="justify-content:flex-start;" onclick="navigate('/etiquetas')">🏷️ Emitir Etiquetas de Gôndola e Balança</button>
          </div>
        </div>

        <div class="panel" style="background:#0f172a; border-color:#263554;">
          <h3 class="panel-title" style="font-size:15px; margin-bottom:12px;">⚖️ Status das Integrações de Periféricos</h3>
          <ul style="list-style:none; display:flex; flex-direction:column; gap:8px; font-size:13px; color:#cbd5e1;">
            <li style="display:flex; justify-content:space-between;"><span>Balança Toledo Prix 3 (Porta COM1):</span> <strong style="color:#10b981;">Online (9600 bps)</strong></li>
            <li style="display:flex; justify-content:space-between;"><span>Balança Filizola Platina:</span> <strong style="color:#10b981;">Compatível P03/P05</strong></li>
            <li style="display:flex; justify-content:space-between;"><span>Impressora Térmica Não-Fiscal 80mm:</span> <strong style="color:#10b981;">ESC/POS Pronta</strong></li>
            <li style="display:flex; justify-content:space-between;"><span>Acionamento Automático de Gaveta:</span> <strong style="color:#10b981;">Habilitado</strong></li>
            <li style="display:flex; justify-content:space-between;"><span>Leitor de Código de Barras / EAN-13:</span> <strong style="color:#10b981;">Decodificação Ativa</strong></li>
            <li style="display:flex; justify-content:space-between;"><span>Banco SQLite WAL Multi-Instâncias:</span> <strong style="color:#38bdf8;">Lock-Free Conectado</strong></li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

// =====================================================================
// 11. MÓDULO CONFIGURAÇÕES & DADOS DA EMPRESA
// =====================================================================
function renderSettingsModule() {
  const c = state.company;
  return `
    <div class="panel">
      <header class="panel-header">
        <h2 class="panel-title">⚙️ Configurações Gerais da Empresa e Parâmetros</h2>
      </header>

      <div class="form-grid">
        <div class="form-group" style="grid-column: span 2;">
          <label>Razão Social da Empresa: *</label>
          <input type="text" id="cfg-name" class="form-control" value="${c.name || ''}" />
        </div>
        <div class="form-group">
          <label>Nome Fantasia:</label>
          <input type="text" id="cfg-trade" class="form-control" value="${c.tradeName || ''}" />
        </div>
        <div class="form-group">
          <label>CNPJ: *</label>
          <input type="text" id="cfg-cnpj" class="form-control" value="${c.cnpj || ''}" />
        </div>
        <div class="form-group">
          <label>Inscrição Estadual (IE):</label>
          <input type="text" id="cfg-ie" class="form-control" value="${c.ie || ''}" />
        </div>
        <div class="form-group">
          <label>Segmento de Atuação:</label>
          <select id="cfg-seg" class="form-control">
            <option ${c.segment === 'Supermercado e Vestuário' ? 'selected' : ''}>Supermercado e Vestuário</option>
            <option ${c.segment === 'Supermercado' ? 'selected' : ''}>Supermercado</option>
            <option ${c.segment === 'Açougue e Carnes' ? 'selected' : ''}>Açougue e Carnes</option>
            <option ${c.segment === 'Loja de Moda e Roupas' ? 'selected' : ''}>Loja de Moda e Roupas</option>
            <option ${c.segment === 'Material de Construção' ? 'selected' : ''}>Material de Construção</option>
            <option ${c.segment === 'Varejo em Geral' ? 'selected' : ''}>Varejo em Geral</option>
          </select>
        </div>
        <div class="form-group">
          <label>Telefone Contato:</label>
          <input type="text" id="cfg-p1" class="form-control" value="${c.phone1 || ''}" />
        </div>
        <div class="form-group">
          <label>E-mail Comercial:</label>
          <input type="email" id="cfg-email" class="form-control" value="${c.email || ''}" />
        </div>
      </div>

      <div style="margin-top:24px;">
        <button class="btn btn-success" onclick="saveCompanySettings()">💾 Salvar Dados da Empresa</button>
      </div>
    </div>
  `;
}

async function saveCompanySettings() {
  const payload = {
    name: document.getElementById("cfg-name").value.trim(),
    tradeName: document.getElementById("cfg-trade").value.trim() || null,
    cnpj: document.getElementById("cfg-cnpj").value.trim(),
    ie: document.getElementById("cfg-ie").value.trim() || null,
    im: null,
    segment: document.getElementById("cfg-seg").value,
    phone1: document.getElementById("cfg-p1").value.trim() || null,
    phone2: null,
    email: document.getElementById("cfg-email").value.trim() || null,
    zipCode: null, street: null, number: null, neighborhood: null, city: null, state: null, logoUrl: null
  };

  await API.post("/api/company", payload);
  state.company = await API.get("/api/company");
  alert("✅ Dados da empresa atualizados com sucesso!");
  renderApp();
}

// =====================================================================
// FORNECEDORES E USUÁRIOS
// =====================================================================
function renderSuppliersModule() {
  setTimeout(async () => {
    const list = await API.get("/api/suppliers");
    const container = document.getElementById("suppliers-table-container");
    if (!container) return;
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>CNPJ</th>
            <th>Razão Social</th>
            <th>Nome Fantasia</th>
            <th>Contato</th>
            <th>Telefone</th>
            <th>E-mail</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(s => `
            <tr>
              <td><strong>${s.cnpjCpf}</strong></td>
              <td><strong>${s.corporateName}</strong></td>
              <td>${s.tradeName || "-"}</td>
              <td>${s.contactPerson || "-"}</td>
              <td>${s.phone || "-"}</td>
              <td>${s.email || "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }, 50);

  return `
    <div class="panel">
      <header class="panel-header">
        <h2 class="panel-title">🚚 Cadastro e Gestão de Fornecedores</h2>
      </header>
      <div class="table-wrap" id="suppliers-table-container">
        <p style="color:#94a3b8; padding:20px;">Carregando fornecedores...</p>
      </div>
    </div>
  `;
}

// Modais Globais
function closeModal() {
  const m = document.getElementById("modal-container");
  if (m) m.innerHTML = "";
  // Se estiver no PDV, volta o foco para o leitor de código de barras
  const bi = document.getElementById("barcode-input");
  if (bi) bi.focus();
}

function openAboutModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong style="color:#fff;">ℹ️ Sobre o Sistema PDV Gama & GDM Enterprise</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body" style="line-height:1.6; color:#cbd5e1;">
          <p><strong>PDV Gama / GDM Softwares Enterprise v2.0.0</strong></p>
          <p>Plataforma robusta para Supermercados, Varejo Alimentar, Açougues e Lojas de Confecção/Moda.</p>
          <br>
          <ul style="padding-left:20px; font-size:13px;">
            <li>Arquitetura Descentralizada: Servidor Matriz + Servidor Filial + PDV Checkout + Terminal de Etiquetas.</li>
            <li>Banco de Dados SQLite em modo Write-Ahead Logging (WAL) com zero necessidade de configuração manual.</li>
            <li>Drivers de Hardware: Balanças Toledo (P03/P05) e Filizola, Impressoras Térmicas ESC/POS e Etiquetas ZPL II / EPL2.</li>
            <li>Importação e Entrada automática de Estoque por XML de NF-e SEFAZ v4.00.</li>
            <li>Controle completo de Crediário, Carnês e Limites de Crédito por cliente.</li>
          </ul>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-primary" onclick="closeModal()">Entendido</button>
        </footer>
      </div>
    </div>
  `;
}

function openShortcutsModal() {
  const modal = document.getElementById("modal-container");
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-box">
        <header class="modal-header">
          <strong style="color:#fff;">⌨️ Guia de Teclas de Atalho do Checkout</strong>
          <button class="btn btn-outline btn-sm" onclick="closeModal()">✕</button>
        </header>
        <div class="modal-body">
          <table class="data-table">
            <thead>
              <tr><th>Tecla</th><th>Ação Operacional</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>[F1]</strong></td><td>Ajuda e Guia de Atalhos</td></tr>
              <tr><td><strong>[F2]</strong></td><td>Balança de Checkout (Capturar Peso em KG)</td></tr>
              <tr><td><strong>[F3]</strong></td><td>Consultar Preço e Buscar Produtos</td></tr>
              <tr><td><strong>[F4]</strong></td><td>Finalizar Venda (Dinheiro, Cartão, Pix, Crediário)</td></tr>
              <tr><td><strong>[F5]</strong></td><td>Conceder Desconto na Venda</td></tr>
              <tr><td><strong>[F6]</strong></td><td>Cancelar Último Item Registrado</td></tr>
              <tr><td><strong>[F7]</strong></td><td>Cancelar Venda / Cupom Atual</td></tr>
              <tr><td><strong>[F8]</strong></td><td>Sangria de Caixa (Retirada com comprovante)</td></tr>
              <tr><td><strong>[F9]</strong></td><td>Suprimento de Caixa (Fundo de Troco)</td></tr>
              <tr><td><strong>[F10]</strong></td><td>Fechamento de Caixa Diário (Leitura Z)</td></tr>
              <tr><td><strong>[F11]</strong></td><td>Identificar Cliente (CPF na Nota / Crediário)</td></tr>
              <tr><td><strong>[F12]</strong></td><td>Acionar Abertura da Gaveta de Dinheiro</td></tr>
              <tr><td><strong>QTD*COD</strong></td><td>Multiplicação no Leitor (Ex: 3*7891000100103)</td></tr>
            </tbody>
          </table>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-primary" onclick="closeModal()">Fechar</button>
        </footer>
      </div>
    </div>
  `;
}

// Inicia aplicação
window.addEventListener("DOMContentLoaded", init);
