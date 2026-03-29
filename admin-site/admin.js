const API_BASE_URL = 'https://api.zym8.com';
const ADMIN_TOKEN_KEY = 'zym_admin_token';
const ADMIN_USERNAME_KEY = 'zym_admin_username';
const ADMIN_TAB_KEY = 'zym_admin_tab';

const TAB_META = {
  overview: {
    kicker: 'Overview',
    title: 'Platform overview',
    subtitle: 'User growth, engagement, moderation pulse, and the latest operational signals.',
  },
  'ai-usage': {
    kicker: 'AI usage',
    title: 'OpenRouter and local AI telemetry',
    subtitle: 'Track live provider usage, local request logging, and the product surfaces using the most AI.',
  },
  warnings: {
    kicker: 'Recent warnings',
    title: 'Security and moderation signals',
    subtitle: 'Review recent warning events, abuse reports, and the operational indicators worth checking first.',
  },
  users: {
    kicker: 'Users',
    title: 'User directory and product usage',
    subtitle: 'Search accounts, coach selection, activity volume, and AI usage in one clean table.',
  },
};

const state = {
  token: localStorage.getItem(ADMIN_TOKEN_KEY) || '',
  username: localStorage.getItem(ADMIN_USERNAME_KEY) || '',
  configuredUsername: 'admin',
  activeTab: localStorage.getItem(ADMIN_TAB_KEY) || 'overview',
  overview: null,
  users: [],
  limit: 500,
  search: '',
  searchTimer: null,
};

const els = {
  errorBanner: document.getElementById('error-banner'),
  loginPanel: document.getElementById('login-panel'),
  dashboard: document.getElementById('dashboard'),
  loginForm: document.getElementById('login-form'),
  usernameInput: document.getElementById('username-input'),
  passwordInput: document.getElementById('password-input'),
  loginButton: document.getElementById('login-button'),
  refreshButton: document.getElementById('refresh-button'),
  logoutButton: document.getElementById('logout-button'),
  statusPill: document.getElementById('admin-status-pill'),
  sidebarAdminName: document.getElementById('sidebar-admin-name'),
  workspaceKicker: document.getElementById('workspace-kicker'),
  workspaceTitle: document.getElementById('workspace-title'),
  workspaceSubtitle: document.getElementById('workspace-subtitle'),
  tabButtons: Array.from(document.querySelectorAll('[data-tab]')),
  tabPanels: Array.from(document.querySelectorAll('[data-panel]')),
  navOverviewCount: document.getElementById('nav-overview-count'),
  navAiCount: document.getElementById('nav-ai-count'),
  navWarningCount: document.getElementById('nav-warning-count'),
  navUserCount: document.getElementById('nav-user-count'),
  statsGrid: document.getElementById('stats-grid'),
  overviewPulse: document.getElementById('overview-pulse'),
  recentUsers: document.getElementById('recent-users'),
  recentReports: document.getElementById('recent-reports'),
  aiHighlights: document.getElementById('ai-highlights'),
  openrouterLive: document.getElementById('openrouter-live'),
  openrouterLocal: document.getElementById('openrouter-local'),
  openrouterSources: document.getElementById('openrouter-sources'),
  openrouterModels: document.getElementById('openrouter-models'),
  openrouterProviderWarnings: document.getElementById('openrouter-provider-warnings'),
  warningsHighlights: document.getElementById('warnings-highlights'),
  recentWarnings: document.getElementById('recent-warnings'),
  warningsReports: document.getElementById('warnings-reports'),
  searchInput: document.getElementById('search-input'),
  limitSelect: document.getElementById('limit-select'),
  usersSummary: document.getElementById('users-summary'),
  usersTableWrap: document.getElementById('users-table-wrap'),
};

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function formatCurrency(value) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: numeric !== 0 && Math.abs(numeric) < 1 ? 4 : 2,
    maximumFractionDigits: numeric !== 0 && Math.abs(numeric) < 1 ? 4 : 2,
  }).format(numeric);
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

function setActiveTab(tab) {
  const nextTab = TAB_META[tab] ? tab : 'overview';
  state.activeTab = nextTab;
  localStorage.setItem(ADMIN_TAB_KEY, nextTab);

  const meta = TAB_META[nextTab];
  els.workspaceKicker.textContent = meta.kicker;
  els.workspaceTitle.textContent = meta.title;
  els.workspaceSubtitle.textContent = meta.subtitle;

  els.tabButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === nextTab);
  });
  els.tabPanels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.panel === nextTab);
  });
}

function renderMetricGrid(container, cards) {
  container.innerHTML = cards.map((card) => `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(card.label)}</div>
      <div class="metric-value">${escapeHtml(card.value)}</div>
      <div class="metric-meta">${escapeHtml(card.meta || '')}</div>
    </article>
  `).join('');
}

function renderInfoGrid(container, items, emptyLabel = 'No data available yet.') {
  if (!items || items.length === 0) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(emptyLabel)}</div>`;
    return;
  }

  container.innerHTML = items.map((item) => `
    <article class="info-card">
      <div class="label">${escapeHtml(item.label)}</div>
      <div class="value">${escapeHtml(item.value)}</div>
      <div class="meta">${escapeHtml(item.meta || '')}</div>
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

function badgeClass(tone) {
  if (tone === 'warn') return 'data-badge warn';
  if (tone === 'error') return 'data-badge error';
  return 'data-badge';
}

function formatCoachPill(coach) {
  const normalized = String(coach || '').trim().toLowerCase();
  if (normalized === 'zj') {
    return '<span class="coach-pill coach-zj">ZJ</span>';
  }
  if (normalized === 'lc') {
    return '<span class="coach-pill coach-lc">LC</span>';
  }
  return '<span class="coach-pill coach-none">None</span>';
}

function renderOverview(payload) {
  const stats = payload?.stats || {};

  renderMetricGrid(els.statsGrid, [
    { label: 'Users', value: formatNumber(stats.totalUsers), meta: `${formatNumber(stats.signups7d)} signed up in 7d` },
    { label: 'Verified', value: formatNumber(stats.verifiedUsers), meta: `${formatNumber(stats.coachSelectedUsers)} picked a coach` },
    { label: 'Active 24h', value: formatNumber(stats.activeUsers24h), meta: `${formatNumber(stats.activeUsers7d)} active in 7d` },
    { label: 'Groups', value: formatNumber(stats.totalGroups), meta: `${formatNumber(stats.openReports)} open reports` },
    { label: 'Messages', value: formatNumber(stats.totalMessages), meta: `${formatNumber(stats.coachMessages)} coach replies` },
    { label: 'Posts', value: formatNumber(stats.totalPosts), meta: `${formatNumber(stats.totalComments)} comments` },
    { label: 'Warnings 24h', value: formatNumber(stats.warnings24h), meta: `${formatNumber(stats.activeSessions)} live sessions` },
    { label: 'Coach selected', value: formatNumber(stats.coachSelectedUsers), meta: 'Users who chose ZJ or LC' },
  ]);

  renderInfoGrid(els.overviewPulse, [
    { label: 'Verified rate', value: stats.totalUsers ? `${Math.round((stats.verifiedUsers / stats.totalUsers) * 100)}%` : '0%', meta: 'Share of users with verified email' },
    { label: 'Message density', value: stats.totalUsers ? `${(stats.totalMessages / Math.max(1, stats.totalUsers)).toFixed(1)}` : '0', meta: 'Messages per user' },
    { label: 'Community volume', value: formatNumber(stats.totalPosts + stats.totalComments), meta: 'Posts plus comments' },
    { label: 'Moderation pressure', value: formatNumber(stats.openReports + stats.warnings24h), meta: 'Open reports plus warnings 24h' },
  ]);

  renderList(
    els.recentUsers,
    payload.recentUsers || [],
    (user) => `
      <article class="data-row">
        <div>
          <strong>${escapeHtml(user.username)}</strong>
          <p>${escapeHtml(user.email || 'No email')}</p>
          <small>Joined ${escapeHtml(formatDateTime(user.createdAt))}</small>
        </div>
        ${formatCoachPill(user.selectedCoach)}
      </article>
    `,
    'No recent users yet.',
  );

  renderList(
    els.recentReports,
    payload.recentReports || [],
    (report) => `
      <article class="data-row">
        <div>
          <strong>${escapeHtml(report.reason)}</strong>
          <p>${escapeHtml(report.targetType)} #${escapeHtml(report.targetId)}</p>
          <small>Reporter #${escapeHtml(report.reporterUserId || '—')} · ${escapeHtml(formatDateTime(report.createdAt))}</small>
        </div>
        <span class="${badgeClass(report.status === 'open' ? 'warn' : '')}">${escapeHtml(report.status)}</span>
      </article>
    `,
    'No reports found.',
  );

  els.navOverviewCount.textContent = formatNumber(stats.activeUsers24h || 0);
  els.navWarningCount.textContent = formatNumber(stats.warnings24h || 0);
}

function renderAiUsage(openRouter) {
  const local = openRouter?.local || {};
  const totals = local.totals || {};
  const last24h = local.last24h || {};
  const live = openRouter?.live || {};
  const liveKey = live?.key?.data || live?.key || {};
  const liveCredits = live?.credits?.data || live?.credits || {};

  renderMetricGrid(els.aiHighlights, [
    { label: 'Tracked requests', value: formatNumber(totals.requestCount), meta: `${formatNumber(totals.successCount)} successful` },
    { label: 'Tracked tokens', value: formatNumber(totals.totalTokens), meta: `${formatNumber(last24h.totalTokens)} in last 24h` },
    { label: 'Estimated cost', value: formatCurrency(totals.estimatedCostUsd), meta: `${formatCurrency(last24h.estimatedCostUsd)} in last 24h` },
    { label: 'OpenRouter total usage', value: formatCurrency(liveCredits.totalUsage ?? liveCredits.total_usage ?? liveKey.usage), meta: `Daily ${formatCurrency(liveKey.usage_daily)}` },
  ]);

  renderInfoGrid(els.openrouterLive, [
    { label: 'Key label', value: liveKey.label || 'Unavailable', meta: live.configured ? 'Live provider response' : 'Provider not configured' },
    { label: 'Daily usage', value: formatCurrency(liveKey.usage_daily), meta: `Weekly ${formatCurrency(liveKey.usage_weekly)}` },
    { label: 'Monthly usage', value: formatCurrency(liveKey.usage_monthly), meta: `Total ${formatCurrency(liveKey.usage)}` },
    { label: 'Credit pool', value: formatCurrency(liveCredits.total_credits), meta: `Used ${formatCurrency(liveCredits.total_usage)}` },
    { label: 'Limit remaining', value: liveKey.limit_remaining == null ? 'Unavailable' : formatCurrency(liveKey.limit_remaining), meta: liveKey.limit_reset ? `Resets ${escapeHtml(formatDateTime(liveKey.limit_reset))}` : 'No configured limit reset' },
    { label: 'Management key', value: liveKey.is_management_key ? 'Yes' : 'No', meta: liveKey.is_free_tier ? 'Free tier key' : 'Paid key' },
  ], live.error || 'No live OpenRouter details available.');

  renderInfoGrid(els.openrouterLocal, [
    { label: 'Success count', value: formatNumber(totals.successCount), meta: `${formatNumber(totals.requestCount)} total requests` },
    { label: 'Prompt tokens', value: formatNumber(totals.promptTokens), meta: `${formatNumber(last24h.promptTokens)} in last 24h` },
    { label: 'Completion tokens', value: formatNumber(totals.completionTokens), meta: `${formatNumber(last24h.completionTokens)} in last 24h` },
    { label: 'Last request', value: formatDateTime(totals.lastRequestAt), meta: 'Latest tracked successful or failed event' },
    { label: '24h requests', value: formatNumber(last24h.requestCount), meta: 'Tracked local telemetry in last 24h' },
    { label: '24h cost', value: formatCurrency(last24h.estimatedCostUsd), meta: 'Estimated local cost in last 24h' },
  ]);

  renderList(
    els.openrouterSources,
    Array.isArray(local.bySource) ? local.bySource.slice(0, 8) : [],
    (row) => `
      <article class="data-row">
        <div>
          <strong>${escapeHtml(row.source)}</strong>
          <p>${formatNumber(row.requestCount)} requests · ${formatNumber(row.totalTokens)} tokens</p>
          <small>Last seen ${escapeHtml(formatDateTime(row.lastRequestAt))}</small>
        </div>
        <span class="${badgeClass()}">${escapeHtml(formatCurrency(row.estimatedCostUsd))}</span>
      </article>
    `,
    'No tracked sources yet.',
  );

  renderList(
    els.openrouterModels,
    Array.isArray(local.byModel) ? local.byModel.slice(0, 8) : [],
    (row) => `
      <article class="data-row">
        <div>
          <strong>${escapeHtml(row.model)}</strong>
          <p>${formatNumber(row.requestCount)} requests · ${formatNumber(row.totalTokens)} tokens</p>
          <small>Last seen ${escapeHtml(formatDateTime(row.lastRequestAt))}</small>
        </div>
        <span class="${badgeClass()}">${escapeHtml(formatCurrency(row.estimatedCostUsd))}</span>
      </article>
    `,
    'No tracked models yet.',
  );

  renderList(
    els.openrouterProviderWarnings,
    (Array.isArray(live.warnings) ? live.warnings : []).map((warning) => ({ warning })),
    (row) => `
      <article class="data-row">
        <div>
          <strong>Provider warning</strong>
          <p>${escapeHtml(row.warning)}</p>
        </div>
        <span class="${badgeClass('warn')}">warn</span>
      </article>
    `,
    live.error || 'No provider warnings.',
  );

  els.navAiCount.textContent = formatNumber(totals.requestCount || 0);
}

function renderWarnings(payload) {
  const stats = payload?.stats || {};

  renderMetricGrid(els.warningsHighlights, [
    { label: 'Warnings 24h', value: formatNumber(stats.warnings24h), meta: 'Security events with warn/high severity' },
    { label: 'Open reports', value: formatNumber(stats.openReports), meta: 'Moderation items still marked open' },
    { label: 'Live sessions', value: formatNumber(stats.activeSessions), meta: 'Active sessions not yet revoked' },
    { label: 'Messages', value: formatNumber(stats.totalMessages), meta: `${formatNumber(stats.coachMessages)} from coach` },
  ]);

  renderList(
    els.recentWarnings,
    payload.recentWarnings || [],
    (warning) => `
      <article class="data-row">
        <div>
          <strong>${escapeHtml(warning.eventType)}</strong>
          <p>User #${escapeHtml(warning.userId || '—')}</p>
          <small>${escapeHtml(formatDateTime(warning.createdAt))}</small>
        </div>
        <span class="${badgeClass(warning.severity === 'high' ? 'error' : 'warn')}">${escapeHtml(warning.severity)}</span>
      </article>
    `,
    'No recent warnings.',
  );

  renderList(
    els.warningsReports,
    payload.recentReports || [],
    (report) => `
      <article class="data-row">
        <div>
          <strong>${escapeHtml(report.reason)}</strong>
          <p>${escapeHtml(report.targetType)} #${escapeHtml(report.targetId)}</p>
          <small>${escapeHtml(formatDateTime(report.createdAt))}</small>
        </div>
        <span class="${badgeClass(report.status === 'open' ? 'warn' : '')}">${escapeHtml(report.status)}</span>
      </article>
    `,
    'No reports found.',
  );
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
          <th>Coach</th>
          <th>Joined</th>
          <th>Recent activity</th>
          <th>Messages</th>
          <th>Community</th>
          <th>AI usage</th>
        </tr>
      </thead>
      <tbody>
        ${users.map((user) => `
          <tr>
            <td class="user-cell">
              <strong>${escapeHtml(user.username)}</strong>
              <small>${escapeHtml(user.email || 'No email on file')}</small>
              <span class="mono-pill">#${escapeHtml(user.id)}</span>
            </td>
            <td>
              ${formatCoachPill(user.selectedCoach)}
              <small>${user.emailVerifiedAt ? 'Verified email' : 'Unverified email'}</small>
            </td>
            <td>
              <strong>${escapeHtml(formatDateTime(user.createdAt))}</strong>
              <small>Account created</small>
            </td>
            <td>
              <strong>${escapeHtml(formatDateTime(user.lastActiveAt))}</strong>
              <small>Session seen ${escapeHtml(formatDateTime(user.lastSeenAt))}</small>
            </td>
            <td>
              <strong>${formatNumber(user.usage.totalMessagesSent)} total</strong>
              <small>DM ${formatNumber(user.usage.dmMessagesSent)} · Group ${formatNumber(user.usage.groupMessagesSent)} · Coach ${formatNumber(user.usage.coachDmMessagesSent)}</small>
            </td>
            <td>
              <strong>${formatNumber(user.usage.groupsJoined)} groups</strong>
              <small>${formatNumber(user.usage.postsCreated)} posts · ${formatNumber(user.usage.commentsCreated)} comments</small>
            </td>
            <td>
              <strong>${formatNumber(user.usage.aiRequests)} requests</strong>
              <small>${formatNumber(user.usage.aiTotalTokens)} tokens · ${formatCurrency(user.usage.aiEstimatedCostUsd)}</small>
              <small>Last ${escapeHtml(formatDateTime(user.usage.aiLastRequestAt))}</small>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
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

async function loadOverview() {
  const payload = await apiRequest('/admin/overview');
  state.overview = payload;
  renderOverview(payload);
  renderAiUsage(payload.openRouter || {});
  renderWarnings(payload);

  const stats = payload?.stats || {};
  els.navUserCount.textContent = formatNumber(stats.totalUsers || state.users.length || 0);
}

async function loadUsers() {
  const query = new URLSearchParams();
  if (state.search) query.set('search', state.search);
  query.set('limit', String(state.limit));

  const payload = await apiRequest(`/admin/users?${query.toString()}`);
  state.users = Array.isArray(payload.users) ? payload.users : [];
  els.usersSummary.textContent = `Showing ${formatNumber(state.users.length)} users${state.search ? ` for “${state.search}”` : ''}.`;
  els.navUserCount.textContent = formatNumber(state.users.length);
  renderUsersTable(state.users);
}

async function loadDashboard() {
  showError('');
  await Promise.all([loadOverview(), loadUsers()]);
}

async function checkStatus() {
  try {
    const payload = await apiRequest('/admin/auth/status');
    state.configuredUsername = payload.username || 'admin';
    els.statusPill.textContent = payload.configured
      ? `Admin ready · ${state.configuredUsername}`
      : 'Admin not configured';
    els.usernameInput.value = state.username || state.configuredUsername;
    els.sidebarAdminName.textContent = state.username || state.configuredUsername;

    if (payload.configured && state.token) {
      setSignedIn(true);
      setActiveTab(state.activeTab);
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
    els.sidebarAdminName.textContent = state.username;
    els.statusPill.textContent = `Admin ready · ${state.username}`;
    els.passwordInput.value = '';
    setSignedIn(true);
    setActiveTab(state.activeTab);
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
  els.passwordInput.value = '';
}

function bindEvents() {
  els.loginForm.addEventListener('submit', handleLogin);
  els.refreshButton.addEventListener('click', () => {
    loadDashboard().catch((error) => showError(error.message || 'Refresh failed.'));
  });
  els.logoutButton.addEventListener('click', handleLogout);
  els.tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
  els.searchInput.addEventListener('input', (event) => {
    state.search = event.target.value.trim();
    if (state.searchTimer) {
      window.clearTimeout(state.searchTimer);
    }
    state.searchTimer = window.setTimeout(() => {
      loadUsers().catch((error) => showError(error.message || 'Failed to load users.'));
    }, 220);
  });
  els.limitSelect.addEventListener('change', (event) => {
    state.limit = Number(event.target.value || 500);
    loadUsers().catch((error) => showError(error.message || 'Failed to load users.'));
  });
}

bindEvents();
setActiveTab(state.activeTab);
checkStatus();
