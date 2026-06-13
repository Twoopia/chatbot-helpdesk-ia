/* ── Config ────────────────────────────────────────────────────── */
const WS_BASE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/chat/ws`;
const RECONNECT_DELAY = 3000;

/* ── Session ───────────────────────────────────────────────────── */
let sessionId = localStorage.getItem('helpdesk_session') || generateId();
localStorage.setItem('helpdesk_session', sessionId);

function generateId() {
  // FE-001 fix: use crypto.randomUUID for high-entropy session IDs
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'sess_' + crypto.randomUUID().replace(/-/g, '');
  }
  return 'sess_' + Date.now().toString(36) +
    Math.random().toString(36).slice(2, 9) +
    Math.random().toString(36).slice(2, 9);
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
function _sendText() {
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
function escHtmlRaw(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function baseFormat(text) {
  return escHtmlRaw(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\n/g, '<br>');
}

function formatContent(text) {
  if (!text) return '';
  if (text.includes('[RELATÓRIO TÉCNICO DE FREQUÊNCIAS]')) {
    const firstDash = text.indexOf('━━━');
    const secondDash = text.indexOf('━━━', firstDash + 10);
    if (firstDash !== -1 && secondDash !== -1) {
      const lineEnd = text.indexOf('\n', secondDash);
      const splitAt = lineEnd !== -1 ? lineEnd + 1 : secondDash + 35;
      const reportPart = text.substring(0, splitAt).trimEnd();
      const aiPart = text.substring(splitAt).trim();
      return (
        `<div class="freq-report"><pre>${escHtmlRaw(reportPart)}</pre></div>` +
        (aiPart ? baseFormat(aiPart) : '')
      );
    }
  }
  return baseFormat(text);
}

function formatTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function sourceBadge(source) {
  const map = {
    ai:     ['badge-ai',     'IA'],
    faq:    ['badge-faq',   'FAQ'],
    error:  ['badge-error', 'Erro'],
    gemini: ['badge-gemini','Gemini'],
  };
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
    <div class="welcome-icon">🎛️</div>
    <h2>HEAVYBASS.ia</h2>
    <p>Seu engenheiro de som digital.<br>Envie um áudio ou descreva seu problema de mix.</p>
    <div class="quick-actions">
      <button class="quick-btn" onclick="sendQuick('Como deixar o baixo mais presente no mix?')">🔊 Graves fracos</button>
      <button class="quick-btn" onclick="sendQuick('Como configurar um compressor para kick drum?')">🥁 Compressor no kick</button>
      <button class="quick-btn" onclick="sendQuick('Meu vocal está abafado, como resolver com EQ?')">🎤 Vocal abafado</button>
      <button class="quick-btn" onclick="sendQuick('Qual o LUFS ideal para lançar no Spotify?')">📊 LUFS para streaming</button>
      <button class="quick-btn" onclick="sendQuick('Como fazer sidechain de compressor entre kick e baixo?')">⚡ Sidechain kick/bass</button>
      <button class="quick-btn" onclick="sendQuick('Meu mix está muito fechado, como abrir o som?')">🎚️ Mix fechado</button>
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

function _loadSessionCore(sid) {
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
  'Equalização':          '🎚️',
  'Compressão':           '🔊',
  'Loudness e Mastering': '📊',
  'Graves e Sub-bass':    '🎸',
  'Mixagem Vocal':        '🎤',
  'Efeitos':              '🌊',
  'Sidechain':            '⚡',
  'Stems e Exportação':   '💾',
  'Análise de Áudio':     '🔬',
  'Produção Geral':       '🎹',
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

// BUG-006 fix: use event delegation instead of inline onclick with JSON.stringify
$faqBody.addEventListener('click', e => {
  const btn = e.target.closest('.faq-use-btn');
  if (btn) useFaq(btn.dataset.question);
});

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
        <br><button class="faq-use-btn" data-question="${escHtml(faq.question)}">Enviar esta pergunta</button>
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

/* ── Sidebar drawer (mobile) ─────────────────────────────────────── */
const $sidebar = document.querySelector('.sidebar');

function openSidebar() {
  $sidebar.classList.add('open');
  document.getElementById('overlay').classList.add('visible');
}

function closeSidebar() {
  $sidebar.classList.remove('open');
  const faqOpen = document.getElementById('faqDrawer').classList.contains('open');
  if (!faqOpen) document.getElementById('overlay').classList.remove('visible');
}

document.getElementById('menuBtn').addEventListener('click', () => {
  $sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

/* Fechar sidebar ao clicar no overlay (compartilhado com FAQ) */
function closeFaqDrawer() {
  document.getElementById('faqDrawer').classList.remove('open');
  const sidebarOpen = $sidebar.classList.contains('open');
  if (!sidebarOpen) document.getElementById('overlay').classList.remove('visible');
}

document.getElementById('overlay').addEventListener('click', () => {
  closeSidebar();
  closeFaqDrawer();
});

/* Fechar sidebar ao navegar para sessão no mobile */
function loadSession(sid) {
  _loadSessionCore(sid);
  if (window.innerWidth < 640) closeSidebar();
}

/* ── Audio upload ────────────────────────────────────────────────── */
let pendingAudioFile = null;

const $audioBtn   = document.getElementById('audioBtn');
const $audioInput = document.getElementById('audioInput');
const $audioPreview = document.getElementById('audioPreview');
const $audioName  = document.getElementById('audioPreviewName');

$audioBtn.addEventListener('click', () => $audioInput.click());

const MAX_AUDIO_MB = 100;

$audioInput.addEventListener('change', () => {
  const file = $audioInput.files[0];
  if (!file) return;
  // FE-003 fix: reject files above 25 MB before sending to server
  if (file.size > MAX_AUDIO_MB * 1024 * 1024) {
    alert(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite máximo: ${MAX_AUDIO_MB} MB.`);
    $audioInput.value = '';
    return;
  }
  pendingAudioFile = file;
  $audioName.textContent = file.name;
  $audioPreview.style.display = 'flex';
  $audioBtn.classList.add('has-audio');
  $audioInput.value = '';
});

function removeAudio() {
  pendingAudioFile = null;
  $audioPreview.style.display = 'none';
  $audioBtn.classList.remove('has-audio');
}

async function sendAudio(file, message) {
  const form = new FormData();
  form.append('audio', file, file.name);
  form.append('message', message || '');
  form.append('session_id', sessionId);

  showTyping();
  try {
    const res = await fetch('/api/chat/audio', { method: 'POST', body: form });
    hideTyping();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderMessage({
      id: data.id,
      role: 'assistant',
      content: data.message,
      source: data.source,
      timestamp: data.timestamp,
    });
    refreshSessions();
  } catch (err) {
    hideTyping();
    renderMessage({
      role: 'assistant',
      source: 'error',
      timestamp: new Date().toISOString(),
      content: `⚠️ Erro ao processar áudio: ${err.message}`,
    });
  }
}

/* Audio-aware send — calls _sendText() for plain text messages */
function send() {
  if (pendingAudioFile) {
    const text = $input.value.trim();
    hideWelcome();
    renderAudioBubble(pendingAudioFile, text);
    const file = pendingAudioFile;
    $input.value = '';
    resizeInput();
    removeAudio();
    sendAudio(file, text);
    return;
  }
  _sendText();
}

function renderAudioBubble(file, extraText) {
  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  const row = document.createElement('div');
  row.className = 'msg-row user';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '👤';

  const body = document.createElement('div');
  body.className = 'msg-body';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble audio-msg-card';
  bubble.innerHTML =
    `<div class="audio-attach">` +
      `<span class="audio-attach-icon">🎵</span>` +
      `<div class="audio-attach-info">` +
        `<span class="audio-attach-name">${escHtml(file.name)}</span>` +
        `<span class="audio-attach-meta">${sizeMB} MB · Enviado</span>` +
      `</div>` +
      `<span class="audio-attach-check">✓</span>` +
    `</div>` +
    (extraText ? `<div class="audio-attach-text">${escHtml(extraText)}</div>` : '');

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span>${formatTime(new Date().toISOString())}</span>`;

  body.appendChild(bubble);
  body.appendChild(meta);
  row.appendChild(avatar);
  row.appendChild(body);
  $messages.appendChild(row);
  scrollBottom();
}

/* ── Init ────────────────────────────────────────────────────────── */
connect();
loadFAQ();
refreshSessions();
