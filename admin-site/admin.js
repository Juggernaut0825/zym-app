const API_BASE_URL = 'https://api.zym8.com';
const ADMIN_TOKEN_KEY = 'zym_admin_token';
const ADMIN_USERNAME_KEY = 'zym_admin_username';

const state = {
  token: localStorage.getItem(ADMIN_TOKEN_KEY) || '',
  username: localStorage.getItem(ADMIN_USERNAME_KEY) || '',
  configuredUsername: 'admin',
  overview: null,
  users: [],
  limit: 500,
  search: '',
  searchTimer: null,
};

const els = {
  statusPill: document.getElementById('admin-status-pill'),
  errorBanner: document.getElementById('error-banner'),
  loginPanel: document.getElementById('login-panel'),
  dashboard: document.getElementById('dashboard'),
  loginForm: document.getElementById('login-form'),
  usernameInput: document.getElementById('username-input'),
  passwordInput: document.getElementById('password-input'),
  loginButton: document.getElementById('login-button'),
  refreshButton: document.getElementById('refresh-button'),
  logoutButton: document.getElementById('logout-button'),
  statsGrid: document.getElementById('stats-grid'),
  openrouterSummary: document.getElementById('openrouter-summary'),
  recentUsers: document.getElementById('recent-users'),
  recentWarnings: document.getElementById('recent-warnings'),
  recentReports: document.getElementById('recent-reports'),
  usersTableWrap: document.getElementById('users-table-wrap'),
  searchInput: document.getElementById('search-input'),
  limitSelect: document.getElementById('limit-select'),
};

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showError(message) {
  if (!message) {
    els.errorBanner.classList.add('hidden');
    els.errorBanner.textContent = '';
    return;
  }
  els.errorBanner.textContent = message;
  els.errorBanner.classList.remove('hidden');
}

function setSignedIn(isSignedIn) {
  els.loginPanel.classList.toggle('hidden', isSignedIn);
  els.dashboard.classList.toggle('hidden', !isSignedIn);
}

function persistAuth() {
  if (state.token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, state.token);
    localStorage.setItem(ADMIN_USERNAME_KEY, state.username || state.configuredUsername);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USERNAME_KEY);
  }
}

function clearAuth() {
  state.token = '';
  state.username = '';
  persistAuth();
  setSignedIn(false);
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (state.token) {
    headers.set('Authorization', `Bearer ${state.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401 && state.token) {
    clearAuth();
    throw new Error(payload.error || 'Admin session expired. Please sign in again.');
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }

  return payload;
}

function renderStats(stats) {
  const cards = [
    ['Users', formatNumber(stats.totalUsers)],
    ['Verified', formatNumber(stats.verifiedUsers)],
    ['Active 24h', formatNumber(stats.activeUsers24h)],
    ['Active 7d', formatNumber(stats.activeUsers7d)],
    ['Groups', formatNumber(stats.totalGroups)],
    ['Messages', formatNumber(stats.totalMessages)],
    ['Coach replies', formatNumber(stats.coachMessages)],
    ['Posts', formatNumber(stats.totalPosts)],
    ['Comments', formatNumber(stats.totalComments)],
    ['Open reports', formatNumber(stats.openReports)],
    ['Warnings 24h', formatNumber(stats.warnings24h)],
    ['Live sessions', formatNumber(stats.activeSessions)],
  ];

  els.statsGrid.innerHTML = cards.map(([label, value]) => `
    <article class="stat-card">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}</div>
    </article>
  `).join('');
}

function renderList(container, rows, mapper, emptyLabel) {
  if (!rows || rows.length === 0) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(emptyLabel)}</div>`;
    return;
  }
  container.innerHTML = rows.map(mapper).join('');
}

function renderOpenRouter(openRouter) {
  const local = openRouter?.local || {};
  const totals = local.totals || {};
  const last24h = local.last24h || {};
  const live = openRouter?.live || {};
  const liveKey = live?.key?.data || live?.key || null;
  const liveCredits = live?.credits?.data || live?.credits || null;

  const localCards = `
    <div class="stats-grid">
      <article class="mini-card">
        <div class="label">Tracked requests</div>
        <div class="value">${formatNumber(totals.requestCount)}</div>
      </article>
      <article class="mini-card">
        <div class="label">Tracked tokens</div>
        <div class="value">${formatNumber(totals.totalTokens)}</div>
      </article>
      <article class="mini-card">
        <div class="label">Estimated cost</div>
        <div class="value">${formatCurrency(totals.estimatedCostUsd)}</div>
      </article>
      <article class="mini-card">
        <div class="label">Last 24h</div>
        <div class="value">${formatNumber(last24h.requestCount)}</div>
      </article>
    </div>
  `;

  const sourceRows = Array.isArray(local.bySource) ? local.bySource : [];
  const modelRows = Array.isArray(local.byModel) ? local.byModel : [];
  const warnings = Array.isArray(live.warnings) ? live.warnings : [];

  els.openrouterSummary.innerHTML = `
    ${localCards}
    <div class="list-card">
      <div>
        <strong>Live key summary</strong>
        <p>Label: ${escapeHtml(liveKey?.label || liveKey?.name || 'Unavailable')}</p>
        <p>Usage: ${escapeHtml(String(liveKey?.usage ?? liveCredits?.usage ?? 'Unavailable'))}</p>
        <p>Limit: ${escapeHtml(String(liveKey?.limit ?? liveCredits?.limit ?? 'Unavailable'))}</p>
        <p>Remaining credits: ${escapeHtml(String(liveCredits?.remaining_credits ?? liveCredits?.remaining ?? 'Unavailable'))}</p>
      </div>
      <span class="badge">${escapeHtml(live.error ? 'fallback' : 'live')}</span>
    </div>
    ${live.error ? `<div class="empty-state accent-red">${escapeHtml(live.error)}</div>` : ''}
    ${warnings.length ? `<div class="empty-state accent-orange">${escapeHtml(warnings.join(' · '))}</div>` : ''}
    <div class="stats-grid">
      <article class="mini-card">
        <div class="label">Top sources</div>
        <div>${sourceRows.slice(0, 4).map((row) => `
          <p><strong>${escapeHtml(row.source)}</strong><br /><small>${formatNumber(row.requestCount)} req · ${formatNumber(row.totalTokens)} tok</small></p>
        `).join('') || '<small>No tracked sources yet.</small>'}</div>
      </article>
      <article class="mini-card">
        <div class="label">Top models</div>
        <div>${modelRows.slice(0, 4).map((row) => `
          <p><strong>${escapeHtml(row.model)}</strong><br /><small>${formatNumber(row.requestCount)} req · ${formatNumber(row.totalTokens)} tok</small></p>
        `).join('') || '<small>No tracked models yet.</small>'}</div>
      </article>
    </div>
  `;
}

function renderUsersTable(users) {
  if (!users || users.length === 0) {
    els.usersTableWrap.innerHTML = '<div class="empty-state">No users matched this search.</div>';
    return;
  }

  els.usersTableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>Coach / Joined</th>
          <th>Last active</th>
          <th>Messages</th>
          <th>Community</th>
          <th>Groups</th>
          <th>AI usage</th>
        </tr>
      </thead>
      <tbody>
        ${users.map((user) => `
          <tr>
            <td class="user-cell">
              <strong>${escapeHtml(user.username)}</strong>
              <small>${escapeHtml(user.email || 'No email')}</small><br />
              <small class="mono">#${escapeHtml(user.id)}</small>
            </td>
            <td>
              <strong>${escapeHtml((user.selectedCoach || 'none').toUpperCase())}</strong><br />
              <small>${user.emailVerifiedAt ? 'Verified email' : 'Unverified email'}</small><br />
              <small>${escapeHtml(formatDateTime(user.createdAt))}</small>
            </td>
            <td>
              <strong>${escapeHtml(formatDateTime(user.lastActiveAt))}</strong><br />
              <small>Session: ${escapeHtml(formatDateTime(user.lastSeenAt))}</small>
            </td>
            <td>
              <strong>${formatNumber(user.usage.totalMessagesSent)}</strong><br />
              <small>DM ${formatNumber(user.usage.dmMessagesSent)} · Group ${formatNumber(user.usage.groupMessagesSent)} · Coach ${formatNumber(user.usage.coachDmMessagesSent)}</small>
            </td>
            <td>
              <strong>${formatNumber(user.usage.postsCreated)} posts</strong><br />
              <small>${formatNumber(user.usage.commentsCreated)} comments</small>
            </td>
            <td>
              <strong>${formatNumber(user.usage.groupsJoined)}</strong><br />
              <small>joined groups</small>
            </td>
            <td>
              <strong>${formatNumber(user.usage.aiRequests)} requests</strong><br />
              <small>${formatNumber(user.usage.aiTotalTokens)} tokens · ${formatCurrency(user.usage.aiEstimatedCostUsd)}</small><br />
              <small>${escapeHtml(formatDateTime(user.usage.aiLastRequestAt))}</small>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadOverview() {
  const payload = await apiRequest('/admin/overview');
  state.overview = payload;
  renderStats(payload.stats || {});
  renderOpenRouter(payload.openRouter || {});

  renderList(
    els.recentUsers,
    payload.recentUsers || [],
    (user) => `
      <article class="list-card">
        <div>
          <strong>${escapeHtml(user.username)}</strong>
          <p>${escapeHtml(user.email || 'No email')}</p>
          <small>${escapeHtml(formatDateTime(user.createdAt))}</small>
        </div>
        <span class="badge">${escapeHtml((user.selectedCoach || 'none').toUpperCase())}</span>
      </article>
    `,
    'No recent users yet.',
  );

  renderList(
    els.recentWarnings,
    payload.recentWarnings || [],
    (warning) => `
      <article class="list-card">
        <div>
          <strong>${escapeHtml(warning.eventType)}</strong>
          <p>User #${escapeHtml(warning.userId || '—')}</p>
          <small>${escapeHtml(formatDateTime(warning.createdAt))}</small>
        </div>
        <span class="badge">${escapeHtml(warning.severity)}</span>
      </article>
    `,
    'No recent warnings.',
  );

  renderList(
    els.recentReports,
    payload.recentReports || [],
    (report) => `
      <article class="list-card">
        <div>
          <strong>${escapeHtml(report.reason)}</strong>
          <p>${escapeHtml(report.targetType)} #${escapeHtml(report.targetId)}</p>
          <small>${escapeHtml(formatDateTime(report.createdAt))}</small>
        </div>
        <span class="badge">${escapeHtml(report.status)}</span>
      </article>
    `,
    'No reports found.',
  );
}

async function loadUsers() {
  const query = new URLSearchParams();
  if (state.search) query.set('search', state.search);
  query.set('limit', String(state.limit));
  const payload = await apiRequest(`/admin/users?${query.toString()}`);
  state.users = Array.isArray(payload.users) ? payload.users : [];
  renderUsersTable(state.users);
}

async function loadDashboard() {
  showError('');
  await Promise.all([loadOverview(), loadUsers()]);
}

async function checkStatus() {
  try {
    const payload = await apiRequest('/admin/auth/status', { headers: {} });
    state.configuredUsername = payload.username || 'admin';
    els.statusPill.textContent = payload.configured
      ? `Admin ready · username ${state.configuredUsername}`
      : 'Admin not configured on API';
    els.usernameInput.value = state.username || state.configuredUsername;
    if (payload.configured && state.token) {
      setSignedIn(true);
      await loadDashboard();
    }
  } catch (error) {
    showError(error.message || 'Failed to read admin status.');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  showError('');
  els.loginButton.disabled = true;
  try {
    const payload = await apiRequest('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: els.usernameInput.value.trim(),
        password: els.passwordInput.value,
      }),
    });
    state.token = payload.token;
    state.username = payload.username || els.usernameInput.value.trim();
    persistAuth();
    setSignedIn(true);
    els.passwordInput.value = '';
    await loadDashboard();
  } catch (error) {
    showError(error.message || 'Login failed.');
  } finally {
    els.loginButton.disabled = false;
  }
}

function handleLogout() {
  clearAuth();
  showError('');
  els.usernameInput.value = state.configuredUsername;
}

function bindEvents() {
  els.loginForm.addEventListener('submit', handleLogin);
  els.refreshButton.addEventListener('click', () => loadDashboard().catch((error) => showError(error.message)));
  els.logoutButton.addEventListener('click', handleLogout);
  els.searchInput.addEventListener('input', (event) => {
    state.search = event.target.value.trim();
    if (state.searchTimer) window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      loadUsers().catch((error) => showError(error.message));
    }, 220);
  });
  els.limitSelect.addEventListener('change', (event) => {
    state.limit = Number(event.target.value || 500);
    loadUsers().catch((error) => showError(error.message));
  });
}

bindEvents();
checkStatus();
