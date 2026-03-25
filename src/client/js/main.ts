import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
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
let authToken: string = '';
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

// ── Password validation ──
function isStrongPassword(pw: string): { valid: boolean; message: string } {
  if (pw.length < 6) return { valid: false, message: 'At least 6 characters' };
  if (!/[A-Z]/.test(pw)) return { valid: false, message: 'Add 1 uppercase letter' };
  if (!/[!@_]/.test(pw)) return { valid: false, message: 'Add 1 symbol (! @ _)' };
  return { valid: true, message: 'Strong password' };
}

// AI state
let currentAiMessageId: string | null = null;

// Demo Command Center state
let demoHudVisible = false;
let demoCrashCount = 0;
let demoDlpCount = 0;
let demoServiceRunning = false;
let demoHasCrashed = false;
const demoMissions: Record<string, boolean> = { start: false, dlp: false, crash: false, model: false, fix: false };

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
const postmortemBtn = document.getElementById('postmortem-btn');
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

// ── Sidebar resize (bottom panel — vertical drag) ──
sidebarResizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  sidebarResizing = true;
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!sidebarResizing) return;
  const workspaceRect = workspace.getBoundingClientRect();
  const newHeight = workspaceRect.bottom - e.clientY;
  if (newHeight >= 100 && newHeight <= 400) {
    sidebarWidth = newHeight;
    sidebar.style.height = `${newHeight}px`;
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

// ── Landing screen ──
const landingScreen = document.getElementById('landing-screen')!;
const landingDemoBtn = document.getElementById('landing-demo-btn');
const landingJoinBtn = document.getElementById('landing-join-btn');

function startHeroAnimation() {
  const typedEl = document.getElementById('hero-typed');
  const cursorEl = document.getElementById('hero-cursor');
  const responseEl = document.getElementById('hero-response');
  if (!typedEl || !cursorEl || !responseEl) return;

  const text = 'sharedterminal login --guest';
  let i = 0;
  const interval = setInterval(() => {
    if (i < text.length) {
      typedEl.textContent += text[i];
      i++;
    } else {
      clearInterval(interval);
      cursorEl.style.display = 'none';
      setTimeout(() => responseEl.classList.add('visible'), 300);
    }
  }, 60);
}

if (landingDemoBtn) {
  landingDemoBtn.addEventListener('click', () => {
    landingScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    showDemoAuthFlow();
  });
}

if (landingJoinBtn) {
  landingJoinBtn.addEventListener('click', () => {
    landingScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
  });
}

// ── URL session ID + project name ──
const urlParams = new URLSearchParams(window.location.search);
const urlSession = urlParams.get('session');
const urlTeam = urlParams.get('team');
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

// ── Session restore on refresh ──
const savedToken = sessionStorage.getItem('st_token');
const savedRole = sessionStorage.getItem('st_role');
const savedName = sessionStorage.getItem('st_name');
const savedSessionName = sessionStorage.getItem('st_session_name');

if (savedToken && savedRole && savedName) {
  // Auto-reconnect with saved credentials
  myRole = savedRole;
  if (savedSessionName) {
    document.title = `${savedSessionName} \u2014 SharedTerminal`;
    sessionDisplayNameEl.textContent = savedSessionName;
    securityBannerSession.textContent = savedSessionName;
  }
  authScreen.classList.add('hidden');
  terminalScreen.classList.remove('hidden');
  sessionStartTime = Date.now();
  timerInterval = window.setInterval(updateTimer, 1000);
  statusRole.textContent = savedRole;
  if ('Notification' in window) {
    notificationsPermission = Notification.permission === 'granted';
  }
  initSocket(savedToken, savedName);
} else if (urlTeam) {
  // Team demo mode: look up existing team session
  authScreen.classList.remove('hidden');
  sessionInput.type = 'hidden';

  fetch(`/api/demo/team?name=${encodeURIComponent(urlTeam)}`)
    .then((r) => {
      if (!r.ok) return r.json().then((d: any) => { throw new Error(d.error || 'Failed to load demo'); });
      return r.json();
    })
    .then((data: any) => {
      // Team session found — show session name + PIN + name fields
      sessionInput.value = data.sessionId;
      const sessionLabel = document.getElementById('session-label')!;
      const labelSpan = document.createElement('span');
      labelSpan.className = 'label-dim';
      labelSpan.textContent = 'Team:';
      sessionLabel.appendChild(labelSpan);
      sessionLabel.appendChild(document.createTextNode(' ' + data.sessionName));
      sessionLabel.classList.remove('hidden');
      passwordInput.placeholder = 'Session password';
      passwordInput.style.display = '';
      nameInput.focus();
    })
    .catch(() => {
      // No session for this team — show the create form instead
      const authForm = document.getElementById('auth-form')!;
      authForm.classList.add('hidden');
      const teamCreate = document.getElementById('team-create')!;
      teamCreate.classList.remove('hidden');

      const teamNameInput = document.getElementById('team-name-input') as HTMLInputElement;
      const teamPinInput = document.getElementById('team-pin-input') as HTMLInputElement;
      const teamUserInput = document.getElementById('team-user-input') as HTMLInputElement;
      const startDemoBtn = document.getElementById('start-demo-btn')!;

      teamNameInput.value = urlTeam;
      teamNameInput.readOnly = true;
      teamNameInput.style.opacity = '0.7';

      const createTeamSession = async () => {
        const pin = teamPinInput.value.trim();
        const userName = teamUserInput.value.trim() || 'host';
        const adminPinInput = document.getElementById('admin-pin-input') as HTMLInputElement;
        const adminPin = adminPinInput?.value.trim() || '';
        const pwCheck = isStrongPassword(pin);
        if (!pwCheck.valid) { showError(pwCheck.message); return; }
        if (adminPin && !/^\d{6}$/.test(adminPin)) { showError('Admin PIN must be exactly 6 digits'); return; }

        (startDemoBtn as HTMLButtonElement).disabled = true;
        startDemoBtn.textContent = 'Creating...';

        try {
          const res = await fetch('/api/demo/team', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: urlTeam, password: pin, ownerName: userName, adminPin: adminPin || undefined }),
          });
          const result = await res.json();
          if (!res.ok) { showError(result.error || 'Failed to create session'); (startDemoBtn as HTMLButtonElement).disabled = false; startDemoBtn.textContent = 'Start Private Demo'; return; }

          // Auto-connect as owner
          sessionInput.value = result.sessionId;
          teamCreate.classList.add('hidden');
          const authFormEl = document.getElementById('auth-form')!;
          authFormEl.classList.remove('hidden');
          sessionInput.type = 'hidden';
          passwordInput.style.display = 'none';
          isPublicSession = false;

          const sessionLabel = document.getElementById('session-label')!;
          sessionLabel.innerHTML = '';
          const labelSpan = document.createElement('span');
          labelSpan.className = 'label-dim';
          labelSpan.textContent = 'Team:';
          sessionLabel.appendChild(labelSpan);
          sessionLabel.appendChild(document.createTextNode(' ' + urlTeam));
          sessionLabel.classList.remove('hidden');

          // Directly connect using the owner token
          myRole = 'owner';
          document.title = `${urlTeam} \u2014 SharedTerminal Enterprise`;
          sessionDisplayNameEl.textContent = urlTeam;
          securityBannerSession.textContent = urlTeam;
          authScreen.classList.add('hidden');
          terminalScreen.classList.remove('hidden');
          sessionStartTime = Date.now();
          timerInterval = window.setInterval(updateTimer, 1000);
          statusRole.textContent = 'owner';
          if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then((p) => { notificationsPermission = p === 'granted'; });
          } else if ('Notification' in window) {
            notificationsPermission = Notification.permission === 'granted';
          }
          sessionStorage.setItem('st_token', result.token);
          sessionStorage.setItem('st_role', 'owner');
          sessionStorage.setItem('st_name', userName);
          sessionStorage.setItem('st_session_name', urlTeam);
          initSocket(result.token, userName);
        } catch {
          showError('Connection failed. Is the server running?');
          (startDemoBtn as HTMLButtonElement).disabled = false;
          startDemoBtn.textContent = 'Start Private Demo';
        }
      };

      startDemoBtn.addEventListener('click', createTeamSession);
      teamPinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') createTeamSession(); });
      teamUserInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') createTeamSession(); });
      teamPinInput.focus();
    });
} else if (urlSession) {
  authScreen.classList.remove('hidden');
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
  // No params — show landing page with hero animation
  landingScreen.classList.remove('hidden');
  startHeroAnimation();
}

function showDemoAuthFlow() {
  fetch('/api/demo/available')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data?.enabled) {
        // Show team-create UI, hide normal session/password inputs
        const authForm = document.getElementById('auth-form')!;
        authForm.classList.add('hidden');
        const teamCreate = document.getElementById('team-create')!;
        teamCreate.classList.remove('hidden');

        const teamNameInput = document.getElementById('team-name-input') as HTMLInputElement;
        const teamPinInput = document.getElementById('team-pin-input') as HTMLInputElement;
        const teamUserInput = document.getElementById('team-user-input') as HTMLInputElement;
        const startDemoBtn = document.getElementById('start-demo-btn')!;

        const startDemo = async () => {
          const teamName = teamNameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
          if (!teamName) { showError('Please enter a team name'); return; }
          const pin = teamPinInput.value.trim();
          const pwCheck = isStrongPassword(pin);
          if (!pwCheck.valid) { showError(pwCheck.message); return; }
          const userName = teamUserInput.value.trim() || 'host';
          const adminPinInput = document.getElementById('admin-pin-input') as HTMLInputElement;
          const adminPin = adminPinInput?.value.trim() || '';
          if (adminPin && !/^\d{6}$/.test(adminPin)) { showError('Admin PIN must be exactly 6 digits'); return; }

          (startDemoBtn as HTMLButtonElement).disabled = true;
          startDemoBtn.textContent = 'Creating...';

          try {
            const res = await fetch('/api/demo/team', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: teamName, password: pin, ownerName: userName, adminPin: adminPin || undefined }),
            });
            const result = await res.json();
            if (!res.ok) { showError(result.error || 'Failed to create session'); (startDemoBtn as HTMLButtonElement).disabled = false; startDemoBtn.textContent = 'Start Private Demo'; return; }

            // Auto-connect as owner — go straight to terminal
            sessionInput.value = result.sessionId;
            teamCreate.classList.add('hidden');
            sessionInput.type = 'hidden';
            passwordInput.style.display = 'none';
            isPublicSession = false;

            myRole = 'owner';
            document.title = `${teamName} — SharedTerminal`;
            sessionDisplayNameEl.textContent = teamName;
            securityBannerSession.textContent = teamName;
            authScreen.classList.add('hidden');
            terminalScreen.classList.remove('hidden');
            sessionStartTime = Date.now();
            timerInterval = window.setInterval(updateTimer, 1000);
            statusRole.textContent = 'owner';
            if ('Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission().then((p) => { notificationsPermission = p === 'granted'; });
            } else if ('Notification' in window) {
              notificationsPermission = Notification.permission === 'granted';
            }
            // Update URL so host can share it
            window.history.replaceState({}, '', `?team=${encodeURIComponent(teamName)}`);
            sessionStorage.setItem('st_token', result.token);
            sessionStorage.setItem('st_role', 'owner');
            sessionStorage.setItem('st_name', userName);
            sessionStorage.setItem('st_session_name', teamName);
            initSocket(result.token, userName);
          } catch {
            showError('Connection failed. Is the server running?');
            (startDemoBtn as HTMLButtonElement).disabled = false;
            startDemoBtn.textContent = 'Start Private Demo';
          }
        };

        // Password tooltip toggle + real-time rule checking
        const pwTooltip = document.getElementById('password-tooltip');
        const pwHintIcon = document.getElementById('password-hint-icon');
        const ruleLen = document.getElementById('pw-rule-len');
        const ruleUpper = document.getElementById('pw-rule-upper');
        const ruleSymbol = document.getElementById('pw-rule-symbol');

        if (pwHintIcon && pwTooltip) {
          pwHintIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            pwTooltip.classList.toggle('visible');
          });
          document.addEventListener('click', () => pwTooltip.classList.remove('visible'));
        }

        const ruleLabels = new Map<HTMLElement, string>();
        if (ruleLen) ruleLabels.set(ruleLen, 'At least 6 characters');
        if (ruleUpper) ruleLabels.set(ruleUpper, '1 uppercase letter');
        if (ruleSymbol) ruleLabels.set(ruleSymbol, '1 symbol (! @ _)');

        const updatePwRules = () => {
          const val = teamPinInput.value;
          const setRule = (el: HTMLElement | null, pass: boolean) => {
            if (!el) return;
            el.classList.toggle('pass', pass);
            const label = ruleLabels.get(el) || '';
            el.textContent = (pass ? '\u2713 ' : '\u2717 ') + label;
          };
          setRule(ruleLen, val.length >= 6);
          setRule(ruleUpper, /[A-Z]/.test(val));
          setRule(ruleSymbol, /[!@_]/.test(val));
        };
        teamPinInput.addEventListener('input', updatePwRules);
        teamPinInput.addEventListener('focus', () => pwTooltip?.classList.add('visible'));

        startDemoBtn.addEventListener('click', startDemo);
        teamNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startDemo(); });
        teamPinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startDemo(); });
        teamUserInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startDemo(); });
        teamNameInput.focus();
      } else {
        // Demo mode not enabled — show regular join form
        sessionInput.focus();
      }
    })
    .catch(() => {
      sessionInput.focus();
    });
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

// ── Lead capture ──
const leadModal = document.getElementById('lead-modal')!;
const leadEmailInput = document.getElementById('lead-email-input') as HTMLInputElement;
const leadSubmitBtn = document.getElementById('lead-submit-btn')!;
const leadError = document.getElementById('lead-error')!;
let pendingLeadAction: (() => void) | null = null;

function hasLeadEmail(): boolean {
  return !!localStorage.getItem('st_lead_email');
}

function requireLead(source: string, action: () => void) {
  pendingLeadAction = action;
  const titleEl = document.getElementById('lead-modal-title');
  if (titleEl) {
    titleEl.textContent = source === 'postmortem'
      ? 'Get Your Incident Report'
      : 'Get Your Session Artifacts';
  }
  leadModal.classList.remove('hidden');
  leadEmailInput.focus();
}

leadSubmitBtn.addEventListener('click', submitLead);
leadEmailInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitLead();
});

async function submitLead() {
  const email = leadEmailInput.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    leadError.textContent = 'Please enter a valid email.';
    leadError.style.display = 'block';
    return;
  }
  leadError.style.display = 'none';
  (leadSubmitBtn as HTMLButtonElement).disabled = true;
  leadSubmitBtn.textContent = 'Saving...';

  try {
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'demo' }),
    });
  } catch { /* best effort */ }

  localStorage.setItem('st_lead_email', email);
  leadModal.classList.add('hidden');
  (leadSubmitBtn as HTMLButtonElement).disabled = false;
  leadSubmitBtn.textContent = 'Continue';
  leadEmailInput.value = '';
  if (pendingLeadAction) { pendingLeadAction(); pendingLeadAction = null; }
}

// ── Export buttons (gated by lead capture) ──
document.getElementById('export-workspace-btn')?.addEventListener('click', () => {
  requireLead('export', () => {
    if (authToken) window.open(`/api/session/export/workspace?token=${authToken}`, '_blank');
  });
});
document.getElementById('export-history-btn')?.addEventListener('click', () => {
  requireLead('export', () => {
    if (authToken) window.open(`/api/session/export/history?token=${authToken}`, '_blank');
  });
});

// ── AI Setup / Connect flow ──
const aiSetup = document.getElementById('ai-setup');
const aiConnected = document.getElementById('ai-connected');
const aiInstallBtn = document.getElementById('ai-setup-install-btn');

function showAiConnected() {
  if (aiSetup) aiSetup.classList.add('hidden');
  if (aiConnected) aiConnected.classList.remove('hidden');
}

if (aiInstallBtn) {
  aiInstallBtn.addEventListener('click', () => {
    // Type the install command into the active terminal
    const active = tabs.get(activeTabId || '');
    if (active && socket) {
      const cmd = 'npm install -g @anthropic-ai/claude-code && claude\n';
      socket.emit('terminal:input', { tabId: activeTabId, input: cmd });
    }
  });
}

// ── Summary button ──
summaryAiBtn.addEventListener('click', requestSummary);

function requestSummary() {
  (summaryAiBtn as HTMLButtonElement).disabled = true;
  summaryAiBtn.textContent = 'Generating...';
  socket.emit('summary:request', '');
}

// ── Post-Mortem button (gated by lead capture) ──
if (postmortemBtn) {
  postmortemBtn.addEventListener('click', () => {
    requireLead('postmortem', requestPostMortem);
  });
}

function requestPostMortem() {
  if (!postmortemBtn) return;
  (postmortemBtn as HTMLButtonElement).disabled = true;
  postmortemBtn.textContent = 'Generating...';
  socket.emit('postmortem:request');
}

// ── Connect ──
async function connect() {
  const sessionId = sessionInput.value.trim();
  const password = passwordInput.value;
  const name = nameInput.value.trim() || 'anonymous';

  if (!sessionId) { showError('Please enter a Session ID'); return; }
  if (!isPublicSession && !password) { showError('Please enter the session password'); return; }

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

    // Persist session for reconnect on refresh
    sessionStorage.setItem('st_token', userToken);
    sessionStorage.setItem('st_role', role);
    sessionStorage.setItem('st_name', name);
    sessionStorage.setItem('st_session_name', sessionName || '');

    initSocket(userToken, name);
  } catch {
    showError('Connection failed. Is the server running?');
    joinBtn.textContent = 'Join Session';
    (joinBtn as HTMLButtonElement).disabled = false;
  }
}

// ── Socket initialization ──
function initSocket(token: string, name: string) {
  authToken = token;

  // Show admin link for owners
  const adminLink = document.getElementById('admin-link') as HTMLAnchorElement;
  if (adminLink && myRole === 'owner') {
    adminLink.href = `/admin?token=${authToken}`;
    adminLink.classList.remove('hidden');
  }

  // Show pinned demo MOTD for demo sessions
  const demoMotd = document.getElementById('demo-motd');
  const urlParams = new URLSearchParams(window.location.search);
  if (demoMotd && (urlParams.has('team') || !urlParams.has('session'))) {
    demoMotd.classList.remove('hidden');
    document.getElementById('demo-motd-dismiss')?.addEventListener('click', () => {
      demoMotd.classList.add('hidden');
    });
  }

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
    // Clear stale tabs — server will emit terminal:created with a fresh exec
    for (const [id, tab] of tabs) {
      tab.term.dispose();
      tab.element.remove();
    }
    tabs.clear();
    tabListEl.innerHTML = '';
    activeTabId = null;
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
    showAiConnected();
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
    // Re-enable buttons
    (summaryAiBtn as HTMLButtonElement).disabled = false;
    summaryAiBtn.textContent = 'Generate Session Summary';
    if (postmortemBtn) {
      (postmortemBtn as HTMLButtonElement).disabled = false;
      postmortemBtn.textContent = 'Generate Post-Mortem';
    }
  });

  socket.on('summary:response', (summary: string) => {
    showAiConnected();
    (summaryAiBtn as HTMLButtonElement).disabled = false;
    summaryAiBtn.textContent = 'Generate Session Summary';
    // Show in AI section
    appendAiSummary(summary);
  });

  // ── Post-Mortem events ──
  socket.on('postmortem:stream', (data: { chunk: string; id: string }) => {
    showAiConnected();
    appendAiChunk(data.chunk, data.id);
  });

  socket.on('postmortem:done', (_data: { id: string }) => {
    if (postmortemBtn) {
      (postmortemBtn as HTMLButtonElement).disabled = false;
      postmortemBtn.textContent = 'Generate Post-Mortem';
    }
    sendBrowserNotification('Post-Mortem', 'Incident report generated');
  });

  // ── Session events ──
  socket.on('session:error', (message: string) => {
    const active = tabs.get(activeTabId || '');
    if (active) active.term.write(`\r\n[Error: ${message}]\r\n`);
  });

  socket.on('session:stopped', () => {
    sessionStorage.removeItem('st_token');
    sessionStorage.removeItem('st_role');
    sessionStorage.removeItem('st_name');
    sessionStorage.removeItem('st_session_name');
    const active = tabs.get(activeTabId || '');
    if (active) active.term.write('\r\n[Session has been stopped by the owner]\r\n');
  });

  socket.on('disconnect', () => {
    connectionDot.className = 'dot-red';
    statusConnection.textContent = 'Disconnected';
  });

  // ── Demo countdown ──
  let demoTimerInterval: number | null = null;
  let demoExpiresAtMs: number | null = null;

  socket.on('demo:warning', (data: { remainingMs: number; message: string }) => {
    demoExpiresAtMs = Date.now() + data.remainingMs;

    if (data.remainingMs <= 60_000) {
      // Final minute — red urgent banner
      showDemoBanner(data.message, 'urgent');
    } else if (data.remainingMs <= 5 * 60_000) {
      showDemoBanner(data.message, 'warning');
    }

    // Start or update the countdown in the session timer
    if (!demoTimerInterval) {
      demoTimerInterval = window.setInterval(() => {
        if (!demoExpiresAtMs) return;
        const left = Math.max(0, demoExpiresAtMs - Date.now());
        const m = Math.floor(left / 60_000);
        const s = Math.floor((left % 60_000) / 1000);
        sessionTimerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
        if (left <= 60_000) {
          sessionTimerEl.style.color = '#E5534B';
        } else if (left <= 5 * 60_000) {
          sessionTimerEl.style.color = '#00F5FF';
        }
      }, 1000);
    }
  });

  socket.on('demo:expired', () => {
    sessionStorage.removeItem('st_token');
    sessionStorage.removeItem('st_role');
    sessionStorage.removeItem('st_name');
    sessionStorage.removeItem('st_session_name');
    if (demoTimerInterval) { clearInterval(demoTimerInterval); demoTimerInterval = null; }
    // Disable all terminals
    for (const [, tab] of tabs) {
      tab.term.write('\r\n\x1b[1;31m[Demo session has ended. Your sandbox has been destroyed.]\x1b[0m\r\n');
    }
    showDemoExpiredOverlay();
  });

  // ── Security warning (DLP toast) ──
  socket.on('security:warning', (message: string) => {
    showDlpToast(message);
  });

  // ── Demo Command Center events ──
  socket.on('demo:event', (data: { type: string; payload?: Record<string, unknown> }) => {
    // Show HUD on first demo event
    if (!demoHudVisible) {
      const hud = document.getElementById('demo-hud');
      const missionSection = document.getElementById('sidebar-mission-section');
      if (hud) hud.classList.remove('hidden');
      if (missionSection) missionSection.classList.remove('hidden');
      demoHudVisible = true;
    }

    switch (data.type) {
      case 'service_started':
        demoServiceRunning = true;
        updateHudStatus('running');
        if (demoHasCrashed) {
          // Service restarted after crash = fix applied
          completeMission('fix');
        }
        completeMission('start');
        break;

      case 'crash_hit': {
        const remaining = (data.payload?.remaining as number) || 0;
        demoCrashCount = 5 - remaining;
        updateHudRequests(demoCrashCount, 5);
        break;
      }

      case 'service_crashed':
        demoServiceRunning = false;
        demoHasCrashed = true;
        demoCrashCount = 5;
        updateHudStatus('crashed');
        updateHudRequests(5, 5);
        completeMission('crash');
        showCrashAutoPrompt();
        break;

      case 'dlp_blocked':
        demoDlpCount++;
        updateHudDlp(demoDlpCount);
        completeMission('dlp');
        break;

      case 'model_crashed':
        updateHudModel('crashed');
        completeMission('model');
        showModelCrashToast();
        break;

      case 'model_fixed':
        updateHudModel('running');
        completeMission('fix');
        break;
    }
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
      const terminalBuffer = getTerminalBuffer(100);
      socket.emit('ai:ask', { message: text, apiKey: '', terminalBuffer });
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
    background: '#0A0A0B', foreground: '#EDEDED', cursor: '#00F5FF', cursorAccent: '#0A0A0B',
    selectionBackground: 'rgba(0, 245, 255, 0.19)',
    black: '#0A0A0B', red: '#E5534B', green: '#34D058', yellow: '#C69026', blue: '#58a6ff',
    magenta: '#bc8cff', cyan: '#00F5FF', white: '#EDEDED',
    brightBlack: '#555555', brightRed: '#ff7b72', brightGreen: '#56d364', brightYellow: '#e3b341',
    brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d364', brightWhite: '#f0f6fc',
  };

  const term = new Terminal({ cursorBlink: true, fontSize: 14, fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace", theme: termTheme });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());

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
    fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    theme: { background: '#0A0A0B', foreground: '#EDEDED', cursor: '#00F5FF' },
    disableStdin: true,
  });
  followFitAddon = new FitAddon();
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
  // Sort: current user first, then owner, then alphabetical
  const myId = socket?.id;
  const sorted = [...users].sort((a, b) => {
    if (a.id === myId) return -1;
    if (b.id === myId) return 1;
    if (a.role === 'owner' && b.role !== 'owner') return -1;
    if (b.role === 'owner' && a.role !== 'owner') return 1;
    return a.name.localeCompare(b.name);
  });

  usersList.innerHTML = sorted.map((u) => {
    const isMe = u.id === myId;
    const roleClass = u.role === 'owner' ? ' owner' : '';
    const initials = getInitials(u.name);
    const color = hashColor(u.name);
    const youLabel = isMe ? ' <span class="you-label">(You)</span>' : '';
    return `<div class="user-item${isMe ? ' is-me' : ''}" data-user-id="${escapeHtml(u.id)}">
      <span class="user-avatar" style="background:${color}">${escapeHtml(initials)}<span class="presence-dot"></span></span>
      <span class="user-name">${escapeHtml(u.name)}${youLabel}</span>
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

const AVATAR_COLORS = ['#00F5FF', '#34D058', '#58a6ff', '#bc8cff', '#39d353', '#E5534B', '#C69026', '#79c0ff'];
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

// ── Terminal Buffer Extraction ──
function getTerminalBuffer(maxLines = 100): string {
  const tab = tabs.get(activeTabId || '');
  if (!tab) return '';
  const buf = tab.term.buffer.active;
  const totalRows = buf.length;
  const startRow = Math.max(0, totalRows - maxLines);
  const lines: string[] = [];
  for (let i = startRow; i < totalRows; i++) {
    const line = buf.getLine(i);
    if (line) lines.push(line.translateToString(true));
  }
  // Trim trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n');
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

// ── Demo countdown UI ──
function showDemoBanner(message: string, level: 'warning' | 'urgent') {
  let banner = document.getElementById('demo-countdown-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'demo-countdown-banner';
    const securityBanner = document.getElementById('security-banner');
    if (securityBanner) {
      securityBanner.after(banner);
    }
  }
  banner.className = `demo-banner demo-banner-${level}`;
  banner.textContent = message;
}

function showDemoExpiredOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'demo-expired-overlay';
  overlay.innerHTML = `
    <div class="demo-expired-card">
      <h2>Demo Session Ended</h2>
      <p>Your sandbox has been securely destroyed.</p>
      <p class="demo-expired-sub">Enjoyed the experience? Get a permanent instance for your team.</p>
      <a href="/" class="demo-expired-btn">Start New Demo</a>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ── Demo: HUD helpers ──
function updateHudStatus(state: 'idle' | 'running' | 'crashed') {
  const el = document.getElementById('hud-status');
  if (!el) return;
  el.className = 'hud-value';
  switch (state) {
    case 'running':
      el.textContent = 'RUNNING';
      el.classList.add('hud-running');
      break;
    case 'crashed':
      el.textContent = 'CRASHED';
      el.classList.add('hud-crashed');
      break;
    default:
      el.textContent = 'IDLE';
      el.classList.add('hud-idle');
  }
}

function updateHudModel(state: 'idle' | 'running' | 'crashed') {
  const el = document.getElementById('hud-model');
  if (!el) return;
  el.className = 'hud-value';
  switch (state) {
    case 'running':
      el.textContent = 'OK';
      el.classList.add('hud-running');
      break;
    case 'crashed':
      el.textContent = 'OOM';
      el.classList.add('hud-crashed');
      break;
    default:
      el.textContent = 'IDLE';
      el.classList.add('hud-idle');
  }
}

function updateHudRequests(count: number, total: number) {
  const el = document.getElementById('hud-requests');
  if (el) el.textContent = `${count}/${total}`;
}

function updateHudDlp(count: number) {
  const el = document.getElementById('hud-dlp');
  if (!el) return;
  el.textContent = `${count} blocked`;
  el.className = 'hud-value hud-dlp-active';
}

// ── Demo: DLP Alert Toast ──
function showDlpToast(message: string) {
  const container = document.getElementById('toast-container')!;
  const toast = document.createElement('div');
  toast.className = 'toast toast-dlp';
  toast.innerHTML = `
    <div><span class="toast-dlp-icon">\u{1f6e1}\ufe0f</span><span class="toast-dlp-title">Secret Blocked</span></div>
    <div class="toast-dlp-detail">${escapeHtml(message)}</div>
  `;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 5000);
}

// ── Demo: Crash Auto-Prompt ──
function showCrashAutoPrompt() {
  const container = document.getElementById('toast-container')!;
  const toast = document.createElement('div');
  toast.className = 'toast toast-crash';
  toast.innerHTML = `
    <div><span class="toast-dlp-icon">\u{1f6a8}</span><strong style="color:#f85149">Service Crashed</strong></div>
    <div class="toast-dlp-detail">The microservice hit a fatal error. AI can analyze the incident.</div>
    <button class="toast-crash-btn" id="crash-analyze-btn">Analyze Crash</button>
  `;
  container.appendChild(toast);

  const btn = toast.querySelector('#crash-analyze-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      toast.remove();
      // Open AI panel if collapsed
      const claudeBody = document.getElementById('claude-panel-content');
      const claudeChevron = document.querySelector('#sidebar-ai-section .sidebar-section-chevron') as HTMLElement;
      if (claudeBody && claudeBody.classList.contains('collapsed')) {
        claudeBody.classList.remove('collapsed');
        if (claudeChevron) { claudeChevron.innerHTML = '\u25bc'; claudeChevron.classList.remove('collapsed-chevron'); }
      }
      // Auto-send crash analysis prompt
      const terminalBuffer = getTerminalBuffer(100);
      appendAiUserMessage('The service just crashed. Analyze the error and suggest a fix.');
      socket.emit('ai:ask', { message: 'The microservice just crashed with a fatal error. Analyze the terminal output and suggest a fix for the crash in server.js.', apiKey: '', terminalBuffer });
    });
  }

  setTimeout(() => { if (toast.parentNode) { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); } }, 15000);
}

// ── Demo: Model OOM Toast ──
function showModelCrashToast() {
  const container = document.getElementById('toast-container')!;
  const toast = document.createElement('div');
  toast.className = 'toast toast-crash';
  toast.innerHTML = `
    <div><span class="toast-dlp-icon">\u{1f9e0}</span><strong style="color:#f85149">ML Model OOM</strong></div>
    <div class="toast-dlp-detail">Inference pipeline crashed — TENSOR_BUFFER_MULTIPLIER too high. Fix model.py and re-run.</div>
  `;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); } }, 8000);
}

// ── Demo: Mission Tracker ──
function completeMission(key: string) {
  if (demoMissions[key]) return;
  demoMissions[key] = true;

  const item = document.querySelector(`.mission-item[data-mission="${key}"]`);
  if (item) {
    item.classList.add('completed');
    const check = item.querySelector('.mission-check');
    if (check) check.innerHTML = '\u2611';
  }

  // Update progress badge
  const total = Object.keys(demoMissions).length;
  const completed = Object.values(demoMissions).filter(Boolean).length;
  const badge = document.getElementById('mission-progress-badge');
  if (badge) badge.textContent = `${completed}/${total}`;

  // Show completion toast on all done
  if (completed === total) {
    showToast('Mission Complete! All objectives achieved.');
  }
}
