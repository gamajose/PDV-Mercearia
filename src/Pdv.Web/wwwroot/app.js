const state = {
  session: null,
  permissions: new Set(),
  stores: [],
  permissionCatalog: []
};

const titles = {
  dashboard: 'Painel',
  products: 'Produtos',
  stores: 'Filiais',
  users: 'Usuários e permissões'
};

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  let payload = null;
  if (response.status !== 204) {
    const text = await response.text();
    payload = text ? JSON.parse(text) : null;
  }

  if (!response.ok) {
    throw new ApiError(response.status, payload?.error || 'Não foi possível concluir a operação.');
  }

  return payload;
}

function showOnly(id) {
  ['loading-screen', 'setup-screen', 'login-screen', 'app-shell'].forEach(elementId => {
    document.getElementById(elementId).classList.toggle('hidden', elementId !== id);
  });
}

function toast(message, tone = 'success') {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.dataset.tone = tone;
  element.classList.remove('hidden');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => element.classList.add('hidden'), 4200);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value || 0));
}

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || 'U';
}

function setFormBusy(form, busy) {
  form.querySelectorAll('button, input, select').forEach(control => {
    control.disabled = busy;
  });
}

async function initialize() {
  try {
    const setup = await api('/api/setup/status');
    if (!setup.configured) {
      showOnly('setup-screen');
      return;
    }

    try {
      state.session = await api('/api/session');
      await openApplication();
    } catch (error) {
      if (error.status === 401) {
        showOnly('login-screen');
        return;
      }
      throw error;
    }
  } catch (error) {
    showOnly('login-screen');
    document.getElementById('login-message').textContent =
      `Não foi possível acessar o serviço: ${error.message}`;
  }
}

async function openApplication() {
  state.permissions = new Set(state.session.permissions || []);
  document.getElementById('company-name').textContent = state.session.companyName || '';
  document.getElementById('store-name').textContent = state.session.storeName || 'Sem filial vinculada';
  document.getElementById('user-name').textContent = state.session.displayName || '';
  document.getElementById('user-initials').textContent = initials(state.session.displayName);

  const allowedButtons = [];
  document.querySelectorAll('#main-nav button').forEach(button => {
    const allowed = state.permissions.has(button.dataset.permission);
    button.classList.toggle('hidden', !allowed);
    if (allowed) allowedButtons.push(button);
  });

  showOnly('app-shell');
  if (allowedButtons.length === 0) {
    document.getElementById('page-title').textContent = 'Sem acesso liberado';
    toast('Seu usuário ainda não possui permissões. Procure um administrador.', 'warning');
    return;
  }

  await navigate(allowedButtons[0].dataset.view);
}

async function navigate(view) {
  document.querySelectorAll('.view').forEach(section => section.classList.add('hidden'));
  document.querySelectorAll('#main-nav button').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
  });

  document.getElementById(`${view}-view`).classList.remove('hidden');
  document.getElementById('page-title').textContent = titles[view] || '';

  if (view === 'dashboard') await loadDashboard();
  if (view === 'products') await loadProducts();
  if (view === 'stores') await loadStores();
  if (view === 'users') await loadUsers();
}

async function loadDashboard() {
  try {
    const data = await api('/api/dashboard');
    document.getElementById('metric-sales').textContent = formatMoney(data.salesToday);
    document.getElementById('metric-transactions').textContent = formatNumber(data.transactionsToday);
    document.getElementById('metric-products').textContent = formatNumber(data.productCount);
    document.getElementById('metric-low-stock').textContent = formatNumber(data.lowStock);
    renderHourlyChart(data.hourly || []);
    renderRecentSales(data.recentSales || []);
  } catch (error) {
    handleViewError(error);
  }
}

function renderHourlyChart(items) {
  const target = document.getElementById('hourly-chart');
  if (!items.length || !items.some(item => Number(item.total) > 0)) {
    target.className = 'chart-empty';
    target.textContent = 'Nenhuma venda registrada hoje.';
    return;
  }

  const maximum = Math.max(...items.map(item => Number(item.total)));
  target.className = 'bar-chart';
  target.innerHTML = items.map(item => {
    const height = maximum > 0 ? Math.max(8, Number(item.total) / maximum * 100) : 0;
    return `<div class="bar-column" title="${escapeHtml(formatMoney(item.total))}">
      <div class="bar" style="height:${height}%"></div>
      <span>${String(item.hour).padStart(2, '0')}h</span>
    </div>`;
  }).join('');
}

function renderRecentSales(items) {
  const target = document.getElementById('recent-sales');
  if (!items.length) {
    target.className = 'empty-state';
    target.textContent = 'Nenhuma venda registrada.';
    return;
  }

  target.className = 'simple-list';
  target.innerHTML = items.map(item => `<div>
    <span>Venda #${escapeHtml(item.number)}</span>
    <strong>${escapeHtml(formatMoney(item.total))}</strong>
  </div>`).join('');
}

async function loadProducts() {
  const canManage = state.permissions.has('products.manage');
  document.getElementById('new-product-button').classList.toggle('hidden', !canManage);
  try {
    const products = await api('/api/products');
    const target = document.getElementById('products-table');
    if (!products.length) {
      target.innerHTML = '<div class="empty-state">Nenhum produto cadastrado.</div>';
      return;
    }

    target.innerHTML = `<div class="data-table">
      <div class="table-row table-head"><span>Produto</span><span>SKU</span><span>Estoque</span><span>Preço</span></div>
      ${products.map(product => `<div class="table-row">
        <span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.barcode || 'Sem código de barras')}</small></span>
        <span>${escapeHtml(product.sku)}</span>
        <span class="${Number(product.quantity) <= Number(product.minimumQuantity) ? 'danger-text' : ''}">${escapeHtml(formatNumber(product.quantity, 3))}</span>
        <span>${escapeHtml(formatMoney(product.salePrice))}</span>
      </div>`).join('')}
    </div>`;
  } catch (error) {
    handleViewError(error);
  }
}

async function loadStores() {
  try {
    state.stores = await api('/api/stores');
    const target = document.getElementById('stores-table');
    if (!state.stores.length) {
      target.innerHTML = '<div class="empty-state">Nenhuma filial cadastrada.</div>';
      return;
    }

    target.innerHTML = `<div class="data-table">
      <div class="table-row table-head three"><span>Filial</span><span>Código</span><span>Status</span></div>
      ${state.stores.map(store => `<div class="table-row three">
        <span><strong>${escapeHtml(store.name)}</strong><small>${store.isAdministrationHub ? 'Filial administradora' : 'Filial'}</small></span>
        <span>${escapeHtml(store.code)}</span>
        <span><span class="status-label ${store.isActive ? 'active' : ''}">${store.isActive ? 'Ativa' : 'Inativa'}</span></span>
      </div>`).join('')}
    </div>`;
    fillStoreSelect();
  } catch (error) {
    handleViewError(error);
  }
}

async function loadUsers() {
  try {
    const [users, stores, permissions] = await Promise.all([
      api('/api/users'),
      api('/api/stores'),
      api('/api/permissions')
    ]);
    state.stores = stores;
    state.permissionCatalog = permissions;
    fillStoreSelect();
    renderPermissionOptions();

    const target = document.getElementById('users-table');
    if (!users.length) {
      target.innerHTML = '<div class="empty-state">Nenhum usuário cadastrado.</div>';
      return;
    }

    target.innerHTML = `<div class="data-table">
      <div class="table-row table-head"><span>Usuário</span><span>Login</span><span>Filial</span><span>Status</span></div>
      ${users.map(user => `<div class="table-row">
        <span><strong>${escapeHtml(user.displayName)}</strong><small>${user.isAdministrator ? 'Administrador' : `${user.permissions.length} permissões`}</small></span>
        <span>${escapeHtml(user.login)}</span>
        <span>${escapeHtml(user.storeName || 'Sem filial fixa')}</span>
        <span><button class="status-toggle ${user.isActive ? 'active' : ''}" data-user-id="${user.id}" data-active="${user.isActive}">${user.isActive ? 'Ativo' : 'Inativo'}</button></span>
      </div>`).join('')}
    </div>`;

    target.querySelectorAll('.status-toggle').forEach(button => {
      button.addEventListener('click', () => changeUserStatus(button));
    });
  } catch (error) {
    handleViewError(error);
  }
}

function fillStoreSelect() {
  const select = document.getElementById('user-store-select');
  select.innerHTML = '<option value="">Sem filial fixa</option>' + state.stores
    .filter(store => store.isActive)
    .map(store => `<option value="${store.id}">${escapeHtml(store.code)} — ${escapeHtml(store.name)}</option>`)
    .join('');
}

function renderPermissionOptions() {
  const target = document.getElementById('permission-options');
  target.innerHTML = state.permissionCatalog.map(permission => `<label class="permission-option">
    <input type="checkbox" name="permissions" value="${escapeHtml(permission.code)}">
    <span><strong>${escapeHtml(permission.name)}</strong><small>${escapeHtml(permission.description)}</small></span>
  </label>`).join('');
}

async function changeUserStatus(button) {
  const active = button.dataset.active === 'true';
  try {
    await api(`/api/users/${button.dataset.userId}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !active })
    });
    toast(`Usuário ${active ? 'desativado' : 'ativado'}.`);
    await loadUsers();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function handleViewError(error) {
  if (error.status === 401) {
    state.session = null;
    showOnly('login-screen');
    return;
  }
  toast(error.message, 'error');
}

document.getElementById('setup-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  if (values.get('password') !== values.get('confirmPassword')) {
    toast('As senhas não conferem.', 'error');
    return;
  }

  const payload = {
    legalName: values.get('legalName'),
    tradeName: values.get('tradeName'),
    document: values.get('document') || null,
    segment: values.get('segment'),
    storeCode: values.get('storeCode'),
    storeName: values.get('storeName'),
    administratorName: values.get('administratorName'),
    login: values.get('login'),
    password: values.get('password')
  };

  setFormBusy(form, true);
  try {
    await api('/api/setup', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    document.getElementById('login-message').textContent = 'Configuração concluída. Entre com o administrador que você acabou de criar.';
    showOnly('login-screen');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setFormBusy(form, false);
  }
});

document.getElementById('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  setFormBusy(form, true);
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        login: values.get('login'),
        password: values.get('password'),
        rememberMe: values.get('rememberMe') === 'on'
      })
    });
    state.session = await api('/api/session');
    form.reset();
    await openApplication();
  } catch (error) {
    document.getElementById('login-message').textContent =
      error.status === 401 ? 'Usuário ou senha inválidos.' : error.message;
  } finally {
    setFormBusy(form, false);
  }
});

document.getElementById('logout-button').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* sessão já encerrada */ }
  state.session = null;
  state.permissions.clear();
  showOnly('login-screen');
});

document.querySelectorAll('#main-nav button').forEach(button => {
  button.addEventListener('click', () => navigate(button.dataset.view));
});

document.getElementById('new-product-button').addEventListener('click', () => document.getElementById('product-form').classList.remove('hidden'));
document.getElementById('new-store-button').addEventListener('click', () => document.getElementById('store-form').classList.remove('hidden'));
document.getElementById('new-user-button').addEventListener('click', () => document.getElementById('user-form').classList.remove('hidden'));

document.querySelectorAll('[data-cancel]').forEach(button => {
  button.addEventListener('click', () => {
    const form = document.getElementById(`${button.dataset.cancel}-form`);
    form.reset();
    form.classList.add('hidden');
  });
});

document.getElementById('product-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  setFormBusy(form, true);
  try {
    await api('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        sku: values.get('sku'), barcode: values.get('barcode') || null, name: values.get('name'),
        unit: values.get('unit'), costPrice: Number(values.get('costPrice') || 0),
        salePrice: Number(values.get('salePrice') || 0), initialQuantity: Number(values.get('initialQuantity') || 0),
        minimumQuantity: Number(values.get('minimumQuantity') || 0), storeId: null
      })
    });
    form.reset();
    form.classList.add('hidden');
    toast('Produto cadastrado.');
    await loadProducts();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setFormBusy(form, false);
  }
});

document.getElementById('store-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  setFormBusy(form, true);
  try {
    await api('/api/stores', { method: 'POST', body: JSON.stringify({ code: values.get('code'), name: values.get('name') }) });
    form.reset();
    form.classList.add('hidden');
    toast('Filial cadastrada.');
    await loadStores();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setFormBusy(form, false);
  }
});

document.getElementById('user-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  setFormBusy(form, true);
  try {
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        displayName: values.get('displayName'), login: values.get('login'), password: values.get('password'),
        storeId: values.get('storeId') || null, permissions: values.getAll('permissions')
      })
    });
    form.reset();
    form.classList.add('hidden');
    toast('Usuário criado.');
    await loadUsers();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setFormBusy(form, false);
  }
});

initialize();
