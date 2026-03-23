declare const Terminal: any;
declare const FitAddon: any;
declare const io: any;

interface PresenceUser {
  id: string;
  name: string;
  role: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: string;
}

interface TabState {
  tabId: string;
  term: any;
  fitAddon: any;
  element: HTMLDivElement;
}

// ── State ──
let socket: any = null;
let myRole = '';
let sessionStartTime = 0;
let timerInterval: number | null = null;
let muted = false;
let notificationsPermission = false;
let currentUsers: PresenceUser[] = [];

// Tab state
const tabs = new Map<string, TabState>();
let activeTabId: string | null = null;

// Follow state
let followTerm: any = null;
let followFitAddon: any = null;
let isFollowing = false;

// AI state
let currentAiMessageId: string | null = null;

// Sidebar resize state
let sidebarResizing = false;
let sidebarWidth = 280;

// ── DOM Elements ──
const authScreen = document.getElementById('auth-screen')!;
const terminalScreen = document.getElementById('terminal-screen')!;
const sessionInput = document.getElementById('session-input') as HTMLInputElement;
const passwordInput = document.getElementById('password-input') as HTMLInputElement;
const nameInput = document.getElementById('name-input') as HTMLInputElement;
const joinBtn = document.getElementById('join-btn')!;
const authError = document.getElementById('auth-error')!;
const sessionNameEl = document.getElementById('session-name')!;
const sessionDisplayNameEl = document.getElementById('session-display-name')!;
const terminalContainer = document.getElementById('terminal-container')!;
const usersList = document.getElementById('users-list')!;
const activityList = document.getElementById('activity-list')!;
const chatMessages = document.getElementById('chat-messages')!;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const chatUnread = document.getElementById('chat-unread')!;
const tabListEl = document.getElementById('tab-list')!;
const newTabBtn = document.getElementById('new-tab-btn')!;
const sessionTimerEl = document.getElementById('session-timer')!;
const userCountEl = document.getElementById('user-count')!;
const connectionDot = document.getElementById('connection-dot')!;
const statusRole = document.getElementById('status-role')!;
const statusSize = document.getElementById('status-size')!;
const statusConnection = document.getElementById('status-connection')!;
const reconnectingBanner = document.getElementById('reconnecting-banner')!;
const followPanel = document.getElementById('follow-panel')!;
const followNameEl = document.getElementById('follow-name')!;
const followStopBtn = document.getElementById('follow-stop-btn')!;
const followTerminalEl = document.getElementById('follow-terminal')!;
const workspace = document.getElementById('workspace')!;
const terminalRow = document.getElementById('terminal-row')!;
const muteBtn = document.getElementById('mute-btn')!;
const muteIcon = document.getElementById('mute-icon')!;
const shortcutsOverlay = document.getElementById('shortcuts-overlay')!;
const shortcutsClose = document.getElementById('shortcuts-close')!;
const claudeMessages = document.getElementById('claude-messages')!;
const claudeInput = document.getElementById('claude-input') as HTMLInputElement;
const claudeUnread = document.getElementById('claude-unread')!;
const summaryAiBtn = document.getElementById('summary-ai-btn')!;
const sidebar = document.getElementById('sidebar')!;
const sidebarResizeHandle = document.getElementById('sidebar-resize-handle')!;
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn')!;
const sidebarUserCount = document.getElementById('sidebar-user-count')!;
const securityBannerSession = document.getElementById('security-banner-session')!;
const ssoBtn = document.getElementById('sso-btn')!;
const ssoDivider = document.getElementById('sso-divider')!;

// ── SSO configuration check on load ──
(async function checkSsoConfig() {
  try {
    const res = await fetch('/api/auth/sso/config');
    if (res.ok) {
      const config = await res.json();
      if (config.enabled) {
        ssoBtn.classList.remove('hidden');
        ssoDivider.classList.remove('hidden');
      }
    }
  } catch {
    // SSO not available, keep buttons hidden
  }
})();

// ── SSO button handler ──
ssoBtn.addEventListener('click', () => {
  const sessionId = sessionInput.value.trim();
  if (!sessionId) {
    showError('Please enter a Session ID before using SSO');
    return;
  }
  window.location.href = `/api/auth/sso/login?session=${encodeURIComponent(sessionId)}`;
});

// ── Sidebar section toggle (collapsible sections) ──
document.querySelectorAll('.sidebar-section-toggle').forEach((toggle) => {
  toggle.addEventListener('click', () => {
    const header = toggle as HTMLElement;
    const section = header.closest('.sidebar-section')!;
    const body = section.querySelector('.sidebar-section-body') as HTMLElement;
    const chevron = header.querySelector('.sidebar-section-chevron') as HTMLElement;

    if (body.classList.contains('collapsed')) {
      body.classList.remove('collapsed');
      if (chevron) {
        chevron.innerHTML = '&#9660;';
        chevron.classList.remove('collapsed-chevron');
      }
    } else {
      body.classList.add('collapsed');
      if (chevron) {
        chevron.innerHTML = '&#9654;';
        chevron.classList.add('collapsed-chevron');
      }
    }

    // Re-fit terminal after sidebar section changes
    setTimeout(() => {
      const tab = tabs.get(activeTabId || '');
      if (tab) tab.fitAddon.fit();
    }, 300);
  });
});

// ── Sidebar toggle (mobile) ──
sidebarToggleBtn.addEventListener('click', toggleSidebar);

function toggleSidebar() {
  sidebar.classList.toggle('collapsed');
  // Handle mobile backdrop
  let backdrop = document.getElementById('sidebar-backdrop');
  if (window.innerWidth <= 768) {
    if (!sidebar.classList.contains('collapsed')) {
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'sidebar-backdrop';
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', () => {
          sidebar.classList.add('collapsed');
          backdrop!.classList.add('hidden');
        });
      }
      backdrop.classList.remove('hidden');
    } else if (backdrop) {
      backdrop.classList.add('hidden');
    }
  }
}

// ── Sidebar resize (right panel — horizontal drag) ──
sidebarResizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  sidebarResizing = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!sidebarResizing) return;
  const workspaceRect = workspace.getBoundingClientRect();
  const newWidth = workspaceRect.right - e.clientX;
  if (newWidth >= 200 && newWidth <= 500) {
    sidebarWidth = newWidth;
    sidebar.style.width = `${newWidth}px`;
    // Re-fit active terminal
    const tab = tabs.get(activeTabId || '');
    if (tab) tab.fitAddon.fit();
    if (followFitAddon && isFollowing) followFitAddon.fit();
  }
});

document.addEventListener('mouseup', () => {
  if (sidebarResizing) {
    sidebarResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Final fit after resize
    const tab = tabs.get(activeTabId || '');
    if (tab) {
      tab.fitAddon.fit();
      statusSize.textContent = `${tab.term.cols}\u00d7${tab.term.rows}`;
      if (socket) socket.emit('terminal:resize', { tabId: activeTabId, size: { cols: tab.term.cols, rows: tab.term.rows } });
    }
  }
});

// ── URL session ID + project name ──
const urlParams = new URLSearchParams(window.location.search);
const urlSession = urlParams.get('session');
const urlName = urlParams.get('name');
let isPublicSession = false;

function setupPublicSession(sid: string, sName?: string) {
  sessionInput.value = sid;
  sessionInput.type = 'hidden';
  if (sName) {
    const sessionLabel = document.getElementById('session-label')!;
    const labelSpan = document.createElement('span');
    labelSpan.className = 'label-dim';
    labelSpan.textContent = 'Project:';
    sessionLabel.appendChild(labelSpan);
    sessionLabel.appendChild(document.createTextNode(' ' + sName));
    sessionLabel.classList.remove('hidden');
  }
  isPublicSession = true;
  passwordInput.style.display = 'none';
  nameInput.focus();
}

if (urlSession) {
  sessionInput.value = urlSession;
  // If we have a project name, show it and hide the raw UUID
  if (urlName) {
    const sessionLabel = document.getElementById('session-label')!;
    const labelSpan = document.createElement('span');
    labelSpan.className = 'label-dim';
    labelSpan.textContent = 'Project:';
    sessionLabel.appendChild(labelSpan);
    sessionLabel.appendChild(document.createTextNode(' ' + urlName));
    sessionLabel.classList.remove('hidden');
    sessionInput.type = 'hidden';
  }

  // Check if session is public — hide password field if so
  fetch(`/api/session/public-info?sessionId=${encodeURIComponent(urlSession)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data?.isPublic) {
        isPublicSession = true;
        passwordInput.style.display = 'none';
        nameInput.focus();
      }
    })
    .catch(() => {});
} else {
  // No session in URL — auto-discover a public demo session
  fetch('/api/session/demo')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data?.isPublic && data?.sessionId) {
        setupPublicSession(data.sessionId, data.sessionName);
      }
    })
    .catch(() => {});
}

// ── Auth event listeners ──
joinBtn.addEventListener('click', connect);
passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });

// ── Mute toggle ──
muteBtn.addEventListener('click', () => {
  muted = !muted;
  muteIcon.innerHTML = muted ? '&#128263;' : '&#128264;';
  muteBtn.title = muted ? 'Unmute notifications' : 'Mute notifications';
});

// ── Shortcuts overlay ──
shortcutsClose.addEventListener('click', () => shortcutsOverlay.classList.add('hidden'));

// ── New tab button ──
newTabBtn.addEventListener('click', () => { if (socket) socket.emit('terminal:create'); });

// ── Follow stop ──
followStopBtn.addEventListener('click', stopFollowing);

// ── Summary button ──
summaryAiBtn.addEventListener('click', requestSummary);

function requestSummary() {
  (summaryAiBtn as HTMLButtonElement).disabled = true;
  summaryAiBtn.textContent = 'Generating...';
  socket.emit('summary:request', '');
}

// ── Connect ──
async function connect() {
  const sessionId = sessionInput.value.trim();
  const password = passwordInput.value;
  const name = nameInput.value.trim() || 'anonymous';

  if (!sessionId) { showError('Please enter a Session ID'); return; }
  if (!isPublicSession && !password) { showError('Please enter the Session PIN'); return; }

  joinBtn.textContent = 'Connecting...';
  (joinBtn as HTMLButtonElement).disabled = true;

  try {
    const res = await fetch('/api/session/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, password, name }),
    });

    if (!res.ok) {
      const data = await res.json();
      showError(data.error || 'Failed to join session');
      joinBtn.textContent = 'Join Session';
      (joinBtn as HTMLButtonElement).disabled = false;
      return;
    }

    const { token: userToken, role, sessionName } = await res.json();
    myRole = role;

    if (sessionName) {
      document.title = `${sessionName} \u2014 SharedTerminal Enterprise`;
      sessionDisplayNameEl.textContent = sessionName;
      securityBannerSession.textContent = sessionName;
    } else {
      document.title = 'SharedTerminal Enterprise';
    }

    authScreen.classList.add('hidden');
    terminalScreen.classList.remove('hidden');

    sessionStartTime = Date.now();
    timerInterval = window.setInterval(updateTimer, 1000);
    statusRole.textContent = role;

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((p) => { notificationsPermission = p === 'granted'; });
    } else if ('Notification' in window) {
      notificationsPermission = Notification.permission === 'granted';
    }

    initSocket(userToken, name);
  } catch {
    showError('Connection failed. Is the server running?');
    joinBtn.textContent = 'Join Session';
    (joinBtn as HTMLButtonElement).disabled = false;
  }
}

// ── Socket initialization ──
function initSocket(token: string, name: string) {
  socket = io({
    auth: { token, name },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  });

  socket.on('connect', () => {
    connectionDot.className = 'dot-green';
    connectionDot.title = 'Connected';
    statusConnection.textContent = 'Connected';
    reconnectingBanner.classList.add('hidden');
  });

  // ── Auto-reconnection ──
  socket.io.on('reconnect_attempt', () => {
    connectionDot.className = 'dot-orange';
    connectionDot.title = 'Reconnecting...';
    statusConnection.textContent = 'Reconnecting...';
    reconnectingBanner.classList.remove('hidden');
  });

  socket.io.on('reconnect', () => {
    connectionDot.className = 'dot-green';
    connectionDot.title = 'Connected';
    statusConnection.textContent = 'Connected';
    reconnectingBanner.classList.add('hidden');
    const active = tabs.get(activeTabId || '');
    if (active) active.term.write('\r\n\x1b[32m[Reconnected]\x1b[0m\r\n');
    showToast('Reconnected to server');
  });

  socket.io.on('reconnect_failed', () => {
    connectionDot.className = 'dot-red';
    connectionDot.title = 'Disconnected';
    statusConnection.textContent = 'Disconnected';
    reconnectingBanner.classList.add('hidden');
    const active = tabs.get(activeTabId || '');
    if (active) active.term.write('\r\n\x1b[31m[Connection lost \u2014 could not reconnect]\x1b[0m\r\n');
  });

  // ── Terminal tab events ──
  socket.on('terminal:created', (data: { tabId: string; index: number }) => {
    createTab(data.tabId, data.index);
  });

  socket.on('terminal:closed', (tabId: string) => {
    removeTab(tabId);
  });

  socket.on('terminal:output', (data: { tabId: string; output: string }) => {
    const tab = tabs.get(data.tabId);
    if (tab) tab.term.write(data.output);
  });

  socket.on('terminal:exit', (data: { tabId: string; code: number }) => {
    const tab = tabs.get(data.tabId);
    if (tab) tab.term.write(`\r\n[Session ended with code ${data.code}]\r\n`);
  });

  // ── Follow events ──
  socket.on('follow:data', (data: { userId: string; userName: string; output: string }) => {
    if (followTerm) followTerm.write(data.output);
  });

  socket.on('follow:ended', (reason: string) => {
    stopFollowing();
    showToast(`Follow ended: ${reason}`);
  });

  // ── Presence ──
  socket.on('presence:list', (users: PresenceUser[]) => {
    currentUsers = users;
    updatePresence(users);
    userCountEl.textContent = `${users.length} online`;
    sidebarUserCount.textContent = `${users.length}`;
  });

  socket.on('presence:joined', (user: { id: string; name: string; role: string }) => {
    showToast(`${user.name} joined`);
    sendBrowserNotification('User joined', `${user.name} joined the session`);
    playNotificationSound();
  });

  socket.on('presence:left', (userId: string) => {
    const user = currentUsers.find(u => u.id === userId);
    if (user) showToast(`${user.name} left`);
  });

  // ── Activity ──
  socket.on('activity:feed', (activities: Array<{ userId: string; userName: string; activity: string; timestamp: string }>) => {
    updateActivity(activities);
  });

  // ── Chat ──
  socket.on('chat:history', (messages: ChatMessage[]) => {
    chatMessages.innerHTML = '';
    messages.forEach((msg) => appendChatMessage(msg));
  });

  socket.on('chat:message', (msg: ChatMessage) => {
    appendChatMessage(msg);
    // Show unread badge if chat section is collapsed
    const chatBody = document.getElementById('chat-panel-content');
    if (chatBody && chatBody.classList.contains('collapsed')) {
      chatUnread.textContent = String(parseInt(chatUnread.textContent || '0') + 1);
      chatUnread.classList.remove('hidden');
    }
    sendBrowserNotification('New message', `${msg.userName}: ${msg.message}`);
    playNotificationSound();
  });

  // ── AI events ──
  socket.on('ai:stream', (data: { chunk: string; id: string }) => {
    appendAiChunk(data.chunk, data.id);
  });

  socket.on('ai:response', (data: { message: string; id: string }) => {
    currentAiMessageId = null;
    const claudeBody = document.getElementById('claude-panel-content');
    if (claudeBody && claudeBody.classList.contains('collapsed')) {
      claudeUnread.textContent = String(parseInt(claudeUnread.textContent || '0') + 1);
      claudeUnread.classList.remove('hidden');
    }
    sendBrowserNotification('AI Summary', 'AI response ready');
    playNotificationSound();
  });

  socket.on('ai:error', (error: string) => {
    appendAiError(error);
    currentAiMessageId = null;
    // Re-enable summary button
    (summaryAiBtn as HTMLButtonElement).disabled = false;
    summaryAiBtn.textContent = 'Generate Session Summary';
  });

  socket.on('summary:response', (summary: string) => {
    (summaryAiBtn as HTMLButtonElement).disabled = false;
    summaryAiBtn.textContent = 'Generate Session Summary';
    // Show in AI section
    appendAiSummary(summary);
  });

  // ── Session events ──
  socket.on('session:error', (message: string) => {
    const active = tabs.get(activeTabId || '');
    if (active) active.term.write(`\r\n[Error: ${message}]\r\n`);
  });

  socket.on('session:stopped', () => {
    const active = tabs.get(activeTabId || '');
    if (active) active.term.write('\r\n[Session has been stopped by the owner]\r\n');
  });

  socket.on('disconnect', () => {
    connectionDot.className = 'dot-red';
    statusConnection.textContent = 'Disconnected';
  });

  // ── Chat input ──
  chatInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = chatInput.value.trim();
      if (text) { socket.emit('chat:send', text); chatInput.value = ''; }
    }
  });
  chatInput.addEventListener('keyup', (e) => e.stopPropagation());
  chatInput.addEventListener('keypress', (e) => e.stopPropagation());

  // ── AI input (no API key needed — server handles it) ──
  claudeInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = claudeInput.value.trim();
      if (!text) return;
      appendAiUserMessage(text);
      socket.emit('ai:ask', { message: text, apiKey: '' });
      claudeInput.value = '';
    }
  });
  claudeInput.addEventListener('keyup', (e) => e.stopPropagation());
  claudeInput.addEventListener('keypress', (e) => e.stopPropagation());

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault(); e.stopPropagation();
        if (socket) socket.emit('terminal:create');
        return;
      }
      if (e.key === 'w' || e.key === 'W') {
        if (tabs.size > 1 && activeTabId) {
          e.preventDefault(); e.stopPropagation();
          socket.emit('terminal:close', activeTabId);
        }
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        cycleTab(e.shiftKey ? -1 : 1);
        return;
      }
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        e.preventDefault(); e.stopPropagation();
        jumpToTab(num - 1);
        return;
      }
    }

    if (e.key === 'Escape') {
      if (isFollowing) { stopFollowing(); return; }
      if (!shortcutsOverlay.classList.contains('hidden')) { shortcutsOverlay.classList.add('hidden'); return; }
    }

    if (e.key === '?' && !isInput) {
      shortcutsOverlay.classList.toggle('hidden');
    }
  }, true);
}

// ── Tab management ──
function createTab(tabId: string, index: number) {
  const termTheme = {
    background: '#0d1117', foreground: '#c9d1d9', cursor: '#da7756', cursorAccent: '#0d1117',
    selectionBackground: '#da775640',
    black: '#0d1117', red: '#f85149', green: '#3fb950', yellow: '#da7756', blue: '#58a6ff',
    magenta: '#bc8cff', cyan: '#39d353', white: '#c9d1d9',
    brightBlack: '#484f58', brightRed: '#ff7b72', brightGreen: '#56d364', brightYellow: '#e3b341',
    brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d364', brightWhite: '#f0f6fc',
  };

  const term = new Terminal({ cursorBlink: true, fontSize: 14, fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace", theme: termTheme });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);

  const el = document.createElement('div');
  el.className = 'tab-terminal';
  el.dataset.tabId = tabId;
  terminalContainer.appendChild(el);
  term.open(el);

  term.onData((data: string) => {
    socket.emit('terminal:input', { tabId, input: data });
  });

  const tabBtn = document.createElement('button');
  tabBtn.className = 'terminal-tab';
  tabBtn.dataset.tabId = tabId;
  tabBtn.innerHTML = `<span class="tab-label">Terminal ${tabs.size + 1}</span><span class="tab-close" title="Close">&times;</span>`;
  tabBtn.querySelector('.tab-label')!.addEventListener('click', () => switchTab(tabId));
  tabBtn.querySelector('.tab-close')!.addEventListener('click', (e) => {
    e.stopPropagation();
    if (tabs.size > 1) socket.emit('terminal:close', tabId);
  });
  tabListEl.appendChild(tabBtn);

  tabs.set(tabId, { tabId, term, fitAddon, element: el });
  switchTab(tabId);
}

function switchTab(tabId: string) {
  if (!tabs.has(tabId)) return;

  for (const [id, tab] of tabs) {
    tab.element.classList.toggle('active-tab', id === tabId);
  }
  tabListEl.querySelectorAll('.terminal-tab').forEach((btn) => {
    (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).dataset.tabId === tabId);
  });

  activeTabId = tabId;
  const tab = tabs.get(tabId)!;
  tab.fitAddon.fit();
  tab.term.focus();

  statusSize.textContent = `${tab.term.cols}\u00d7${tab.term.rows}`;
  socket.emit('terminal:resize', { tabId, size: { cols: tab.term.cols, rows: tab.term.rows } });
}

function removeTab(tabId: string) {
  const tab = tabs.get(tabId);
  if (!tab) return;

  tab.term.dispose();
  tab.element.remove();
  tabs.delete(tabId);

  tabListEl.querySelector(`.terminal-tab[data-tab-id="${tabId}"]`)?.remove();

  let i = 1;
  tabListEl.querySelectorAll('.terminal-tab .tab-label').forEach((label) => {
    label.textContent = `Terminal ${i++}`;
  });

  if (activeTabId === tabId) {
    const remaining = Array.from(tabs.keys());
    if (remaining.length > 0) switchTab(remaining[remaining.length - 1]);
    else activeTabId = null;
  }
}

function cycleTab(direction: number) {
  const ids = Array.from(tabs.keys());
  if (ids.length <= 1) return;
  const idx = ids.indexOf(activeTabId || '');
  const next = (idx + direction + ids.length) % ids.length;
  switchTab(ids[next]);
}

function jumpToTab(index: number) {
  const ids = Array.from(tabs.keys());
  if (index < ids.length) switchTab(ids[index]);
}

// ── Resize handler ──
window.addEventListener('resize', () => {
  const tab = tabs.get(activeTabId || '');
  if (tab) {
    tab.fitAddon.fit();
    statusSize.textContent = `${tab.term.cols}\u00d7${tab.term.rows}`;
    socket.emit('terminal:resize', { tabId: activeTabId, size: { cols: tab.term.cols, rows: tab.term.rows } });
  }
  if (followFitAddon && isFollowing) followFitAddon.fit();
});

// ── Follow mode ──
function startFollowing(userId: string, userName: string) {
  if (isFollowing) stopFollowing();

  isFollowing = true;
  terminalRow.classList.add('following');
  followPanel.classList.remove('hidden');
  followNameEl.textContent = userName;

  followTerm = new Terminal({
    cursorBlink: false, fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#da7756' },
    disableStdin: true,
  });
  followFitAddon = new FitAddon.FitAddon();
  followTerm.loadAddon(followFitAddon);
  followTerm.open(followTerminalEl);
  followFitAddon.fit();

  socket.emit('follow:start', userId);
}

function stopFollowing() {
  if (!isFollowing) return;
  isFollowing = false;
  terminalRow.classList.remove('following');
  followPanel.classList.add('hidden');

  if (followTerm) { followTerm.dispose(); followTerm = null; }
  followFitAddon = null;
  followTerminalEl.innerHTML = '';

  if (socket) socket.emit('follow:stop');

  const tab = tabs.get(activeTabId || '');
  if (tab) { tab.fitAddon.fit(); tab.term.focus(); }
}

// ── Presence ──
function updatePresence(users: PresenceUser[]) {
  usersList.innerHTML = users.map((u) => {
    const roleClass = u.role === 'owner' ? ' owner' : '';
    const initials = getInitials(u.name);
    const color = hashColor(u.name);
    return `<div class="user-item" data-user-id="${escapeHtml(u.id)}">
      <span class="user-avatar" style="background:${color}">${escapeHtml(initials)}<span class="presence-dot"></span></span>
      <span class="user-name">${escapeHtml(u.name)}</span>
      <span class="user-role${roleClass}">${u.role}</span>
    </div>`;
  }).join('');

  usersList.querySelectorAll('.user-item').forEach((item) => {
    item.addEventListener('click', () => {
      const userId = (item as HTMLElement).dataset.userId!;
      const userName = item.querySelector('.user-name')!.textContent || '';
      startFollowing(userId, userName);
    });
  });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['#da7756', '#3fb950', '#58a6ff', '#bc8cff', '#39d353', '#f85149', '#e3b341', '#79c0ff'];
function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Activity ──
function updateActivity(activities: Array<{ userId: string; userName: string; activity: string; timestamp: string }>) {
  if (activities.length === 0) {
    activityList.innerHTML = '<div class="activity-empty">No activity yet</div>';
    return;
  }
  activityList.innerHTML = activities
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map((a) => `<div class="activity-item">
      <div class="activity-user">${escapeHtml(a.userName)}</div>
      <div class="activity-command">$ ${escapeHtml(a.activity)}</div>
      <div class="activity-time">${timeAgo(new Date(a.timestamp))}</div>
    </div>`).join('');
}

// ── Chat ──
function appendChatMessage(msg: ChatMessage) {
  const el = document.createElement('div');
  el.className = 'chat-msg';
  el.innerHTML = `<div class="chat-msg-header">
    <span class="chat-msg-name">${escapeHtml(msg.userName)}</span>
    <span class="chat-msg-time">${timeAgo(new Date(msg.timestamp))}</span>
  </div>
  <div class="chat-msg-text">${escapeHtml(msg.message)}</div>`;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── AI Chat ──
function appendAiUserMessage(text: string) {
  const el = document.createElement('div');
  el.className = 'claude-msg user-msg';
  el.innerHTML = `<div class="claude-msg-header"><span class="claude-msg-name">You</span></div>
  <div class="claude-msg-text">${escapeHtml(text)}</div>`;
  claudeMessages.appendChild(el);
  claudeMessages.scrollTop = claudeMessages.scrollHeight;
}

function appendAiChunk(chunk: string, id: string) {
  let msgEl = claudeMessages.querySelector(`[data-ai-id="${id}"]`) as HTMLElement;
  if (!msgEl) {
    msgEl = document.createElement('div');
    msgEl.className = 'claude-msg ai-msg';
    msgEl.dataset.aiId = id;
    msgEl.innerHTML = `<div class="claude-msg-header"><span class="claude-msg-name ai-label">Claude</span></div>
    <div class="claude-msg-text"></div>`;
    claudeMessages.appendChild(msgEl);
    currentAiMessageId = id;
  }
  const textEl = msgEl.querySelector('.claude-msg-text')!;
  textEl.textContent += chunk;
  claudeMessages.scrollTop = claudeMessages.scrollHeight;
}

function appendAiSummary(summary: string) {
  const el = document.createElement('div');
  el.className = 'claude-msg ai-msg';
  el.innerHTML = `<div class="claude-msg-header"><span class="claude-msg-name ai-label">Session Summary</span></div>
  <div class="claude-msg-text">${escapeHtml(summary)}</div>`;
  claudeMessages.appendChild(el);
  claudeMessages.scrollTop = claudeMessages.scrollHeight;
}

function appendAiError(error: string) {
  const el = document.createElement('div');
  el.className = 'claude-msg ai-error';
  el.innerHTML = `<div class="claude-msg-text" style="color:#f85149">Error: ${escapeHtml(error)}</div>`;
  claudeMessages.appendChild(el);
  claudeMessages.scrollTop = claudeMessages.scrollHeight;
}

// ── Timer ──
function updateTimer() {
  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  sessionTimerEl.textContent = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// ── Toasts ──
function showToast(message: string) {
  const container = document.getElementById('toast-container')!;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Notifications ──
function sendBrowserNotification(title: string, body: string) {
  if (muted || !document.hidden || !notificationsPermission) return;
  try { new Notification(title, { body, icon: '/favicon.ico' }); } catch {}
}

function playNotificationSound() {
  if (muted) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {}
}

// ── Utilities ──
function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function showError(msg: string) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
