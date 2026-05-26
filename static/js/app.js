/* ── Config ────────────────────────────────────────────────────── */
const WS_BASE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/chat/ws`;
const RECONNECT_DELAY = 3000;

/* ── Session ───────────────────────────────────────────────────── */
let sessionId = localStorage.getItem('helpdesk_session') || generateId();
localStorage.setItem('helpdesk_session', sessionId);

function generateId() {
  return 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── State ─────────────────────────────────────────────────────── */
let ws = null;
let streaming = false;
let streamingBubble = null;
let reconnectTimer = null;
let allFaqs = [];

/* ── DOM refs ──────────────────────────────────────────────────── */
const $messages   = document.getElementById('messagesContainer');
const $input      = document.getElementById('messageInput');
const $sendBtn    = document.getElementById('sendBtn');
const $typing     = document.getElementById('typingIndicator');
const $statusDot  = document.getElementById('statusDot');
const $statusText = document.getElementById('statusText');
const $welcome    = document.getElementById('welcomeScreen');
const $sessions   = document.getElementById('sessionsList');
const $categories = document.getElementById('faqCategories');
const $faqBody    = document.getElementById('faqDrawerBody');

/* ── WebSocket ─────────────────────────────────────────────────── */
function connect() {
  if (ws && ws.readyState < 2) return;
  setStatus('connecting');

  ws = new WebSocket(`${WS_BASE}/${sessionId}`);

  ws.onopen = () => {
    setStatus('online');
    $sendBtn.disabled = false;
    clearTimeout(reconnectTimer);
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    setStatus('offline');
    $sendBtn.disabled = true;
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
  };

  ws.onerror = () => ws.close();
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'history':
      renderHistory(msg.data);
      break;
    case 'message':
      hideTyping();
      renderMessage(msg.data);
      refreshSessions();
      break;
    case 'typing':
      showTyping();
      break;
    case 'stream_start':
      hideTyping();
      streamingBubble = createStreamingBubble();
      streaming = true;
      break;
    case 'stream_chunk':
      if (streamingBubble) appendChunk(msg.data.chunk);
      break;
    case 'stream_end':
      finalizeStream(msg.data);
      streaming = false;
      refreshSessions();
      break;
  }
}

/* ── Send message ──────────────────────────────────────────────── */
function send() {
  const text = $input.value.trim();
  if (!text || !ws || ws.readyState !== 1) return;

  hideWelcome();
  renderMessage({ role: 'user', content: text, source: 'user', timestamp: new Date().toISOString() });

  ws.send(JSON.stringify({ message: text }));
  $input.value = '';
  resizeInput();
  $input.focus();
}

function sendQuick(text) {
  $input.value = text;
  send();
}

/* ── Render helpers ────────────────────────────────────────────── */
function renderHistory(messages) {
  if (!messages || messages.length === 0) return;
  hideWelcome();
  messages.forEach(renderMessage);
}

function renderMessage(data) {
  const { role, content, source, timestamp, id } = data;
  const row = document.createElement('div');
  row.className = `msg-row ${role}${source ? ' ' + source : ''}`;
  if (id) row.dataset.id = id;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';

  const body = document.createElement('div');
  body.className = 'msg-body';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = formatContent(content);

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span>${formatTime(timestamp)}</span>${sourceBadge(source)}`;

  body.appendChild(bubble);
  body.appendChild(meta);
  row.appendChild(avatar);
  row.appendChild(body);
  $messages.appendChild(row);
  scrollBottom();
}

function createStreamingBubble() {
  const row = document.createElement('div');
  row.className = 'msg-row assistant ai';
  row.id = 'streaming-row';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '🤖';

  const body = document.createElement('div');
  body.className = 'msg-body';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.id = 'streaming-bubble';
  bubble.innerHTML = '<span class="cursor"></span>';

  body.appendChild(bubble);
  row.appendChild(avatar);
  row.appendChild(body);
  $messages.appendChild(row);
  scrollBottom();
  return bubble;
}

function appendChunk(chunk) {
  const cursor = streamingBubble.querySelector('.cursor');
  const text = document.createTextNode(chunk);
  streamingBubble.insertBefore(text, cursor);
  scrollBottom();
}

function finalizeStream(data) {
  if (!streamingBubble) return;
  const cursor = streamingBubble.querySelector('.cursor');
  if (cursor) cursor.remove();

  const rawText = streamingBubble.textContent;
  streamingBubble.innerHTML = formatContent(rawText);

  const row = document.getElementById('streaming-row');
  if (row && data) {
    row.id = '';
    if (data.id) row.dataset.id = data.id;

    const body = row.querySelector('.msg-body');
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerHTML = `<span>${formatTime(data.timestamp)}</span>${sourceBadge(data.source)}`;
    body.appendChild(meta);
  }

  streamingBubble = null;
  scrollBottom();
}

/* ── Format ─────────────────────────────────────────────────────── */
function formatContent(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\n/g, '<br>');
}

function formatTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function sourceBadge(source) {
  const map = { ai: ['badge-ai', 'IA'], faq: ['badge-faq', 'FAQ'], error: ['badge-error', 'Erro'] };
  const entry = map[source];
  if (!entry) return '';
  return `<span class="source-badge ${entry[0]}">${entry[1]}</span>`;
}

/* ── UI state ────────────────────────────────────────────────────── */
function setStatus(state) {
  const labels = { online: 'Conectado', offline: 'Desconectado — reconectando…', connecting: 'Conectando…' };
  $statusDot.className = `status-dot ${state === 'online' ? '' : state}`;
  $statusText.textContent = labels[state] || state;
}

function showTyping() { $typing.style.display = 'flex'; scrollBottom(); }
function hideTyping() { $typing.style.display = 'none'; }

function hideWelcome() {
  if ($welcome) { $welcome.style.display = 'none'; }
}

function scrollBottom() {
  $messages.scrollTop = $messages.scrollHeight;
}

/* ── Input ───────────────────────────────────────────────────────── */
function resizeInput() {
  $input.style.height = 'auto';
  $input.style.height = Math.min($input.scrollHeight, 140) + 'px';
}

$input.addEventListener('input', resizeInput);

$input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

$sendBtn.addEventListener('click', send);

$input.addEventListener('input', () => {
  $sendBtn.disabled = !$input.value.trim() || !ws || ws.readyState !== 1;
});

/* ── New chat / Clear ──────────────────────────────────────────── */
document.getElementById('newChatBtn').addEventListener('click', () => {
  sessionId = generateId();
  localStorage.setItem('helpdesk_session', sessionId);
  $messages.innerHTML = '';
  $messages.appendChild(buildWelcome());
  if (ws) ws.close();
  connect();
  refreshSessions();
});

function buildWelcome() {
  const d = document.createElement('div');
  d.id = 'welcomeScreen';
  d.className = 'welcome';
  d.innerHTML = `
    <div class="welcome-icon">🤖</div>
    <h2>Help Desk IA</h2>
    <p>Olá! Sou seu assistente de suporte técnico.<br>Como posso ajudar você hoje?</p>
    <div class="quick-actions">
      <button class="quick-btn" onclick="sendQuick('Como resetar minha senha?')">🔑 Resetar senha</button>
      <button class="quick-btn" onclick="sendQuick('Estou sem acesso à internet')">🌐 Sem internet</button>
      <button class="quick-btn" onclick="sendQuick('Impressora não funciona')">🖨️ Impressora</button>
      <button class="quick-btn" onclick="sendQuick('Como conectar à VPN?')">🔒 VPN</button>
      <button class="quick-btn" onclick="sendQuick('Como abrir um chamado?')">🎫 Abrir chamado</button>
      <button class="quick-btn" onclick="sendQuick('Como instalar um programa?')">💿 Instalar software</button>
    </div>`;
  return d;
}

document.getElementById('clearBtn').addEventListener('click', async () => {
  if (!confirm('Limpar histórico desta conversa?')) return;
  await fetch(`/api/history/${sessionId}`, { method: 'DELETE' }).catch(() => {});
  $messages.innerHTML = '';
  $messages.appendChild(buildWelcome());
  if (ws) ws.close();
  connect();
  refreshSessions();
});

/* ── Sessions sidebar ──────────────────────────────────────────── */
async function refreshSessions() {
  try {
    const res = await fetch('/api/history/sessions');
    const { sessions } = await res.json();
    $sessions.innerHTML = '';
    sessions.slice(0, 15).forEach(s => {
      const item = document.createElement('div');
      item.className = 'session-item' + (s.session_id === sessionId ? ' active' : '');
      item.innerHTML = `
        <span style="font-size:13px">💬</span>
        <span class="session-title">${escHtml(s.title || 'Nova conversa')}</span>
        <span class="session-time">${relTime(s.updated_at)}</span>`;
      item.onclick = () => loadSession(s.session_id);
      $sessions.appendChild(item);
    });
  } catch { /* ignore */ }
}

function loadSession(sid) {
  if (sid === sessionId) return;
  sessionId = sid;
  localStorage.setItem('helpdesk_session', sessionId);
  $messages.innerHTML = '';
  if (ws) ws.close();
  connect();
  refreshSessions();
}

/* ── FAQ drawer ────────────────────────────────────────────────── */
async function loadFAQ() {
  try {
    const res = await fetch('/api/faq/');
    allFaqs = await res.json();
    renderFaqCategories();
    renderFaqDrawer(allFaqs);
  } catch { /* ignore */ }
}

const CAT_ICONS = {
  'Senhas e Acesso': '🔑',
  'Rede e Internet': '🌐',
  'E-mail': '📧',
  'Software': '💿',
  'Impressoras': '🖨️',
  'VPN e Acesso Remoto': '🔒',
  'Hardware': '🖥️',
  'Microsoft Office': '📊',
  'Backup e Arquivos': '💾',
  'Chamados e Suporte': '🎫',
};

function renderFaqCategories() {
  const cats = [...new Set(allFaqs.map(f => f.category))];
  $categories.innerHTML = '';
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.innerHTML = `<span class="cat-icon">${CAT_ICONS[cat] || '📌'}</span><span>${cat}</span>`;
    btn.onclick = () => {
      const filtered = allFaqs.filter(f => f.category === cat);
      renderFaqDrawer(filtered);
      openFaqDrawer();
    };
    $categories.appendChild(btn);
  });
}

function renderFaqDrawer(faqs) {
  $faqBody.innerHTML = '';
  if (!faqs.length) {
    $faqBody.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;padding:8px">Nenhuma FAQ encontrada.</p>';
    return;
  }
  faqs.forEach(faq => {
    const item = document.createElement('div');
    item.className = 'faq-item';
    item.innerHTML = `
      <div class="faq-question" onclick="toggleFaq(this)">
        <span>${escHtml(faq.question)}</span>
        <span class="faq-chevron">▾</span>
      </div>
      <div class="faq-answer">
        ${escHtml(faq.answer)}
        <br><button class="faq-use-btn" onclick="useFaq(${JSON.stringify(faq.question)})">Enviar esta pergunta</button>
      </div>`;
    $faqBody.appendChild(item);
  });
}

function toggleFaq(el) {
  el.closest('.faq-item').classList.toggle('expanded');
}

function useFaq(question) {
  closeFaqDrawer();
  $input.value = question;
  send();
}

function openFaqDrawer() {
  document.getElementById('faqDrawer').classList.add('open');
  document.getElementById('overlay').classList.add('visible');
}

function closeFaqDrawer() {
  document.getElementById('faqDrawer').classList.remove('open');
  document.getElementById('overlay').classList.remove('visible');
}

/* ── Utils ───────────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '\n');
}

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/* ── Init ────────────────────────────────────────────────────────── */
connect();
loadFAQ();
refreshSessions();
