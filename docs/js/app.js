/* ── FAQ data (loaded from JSON) ────────────────────────────────── */
let allFaqs = [];

async function loadFAQData() {
  const res = await fetch('data/faq.json');
  const data = await res.json();
  allFaqs = data.faqs || [];
  renderFaqCategories();
  renderFaqDrawer(allFaqs);
  setStatus('online');
}

/* ── FAQ search (mirrors backend faq_service logic) ─────────────── */
function faqSearch(query, threshold = 0.25) {
  const q = query.toLowerCase();
  const qWords = new Set(q.split(/\s+/).filter(Boolean));
  const results = [];

  for (const faq of allFaqs) {
    let score = 0;
    const combined = (faq.question + ' ' + faq.keywords.join(' ')).toLowerCase();

    for (const kw of faq.keywords) {
      if (q.includes(kw.toLowerCase())) score += 0.6;
    }

    const faqWords = new Set(combined.split(/\s+/).filter(Boolean));
    const overlap = [...qWords].filter(w => faqWords.has(w)).length / Math.max(qWords.size, 1);
    score = Math.min(score + overlap * 0.4, 1.0);

    if (score >= threshold) results.push({ faq, score });
  }

  return results.sort((a, b) => b.score - a.score);
}

function findBestMatch(query, threshold = 0.55) {
  const results = faqSearch(query, 0.25);
  return results.length && results[0].score >= threshold ? results[0].faq : null;
}

/* ── DOM refs ──────────────────────────────────────────────────── */
const $messages   = document.getElementById('messagesContainer');
const $input      = document.getElementById('messageInput');
const $sendBtn    = document.getElementById('sendBtn');
const $typing     = document.getElementById('typingIndicator');
const $statusDot  = document.getElementById('statusDot');
const $statusText = document.getElementById('statusText');
const $categories = document.getElementById('faqCategories');
const $faqBody    = document.getElementById('faqDrawerBody');
const $sessions   = document.getElementById('sessionsList');

/* ── Send ──────────────────────────────────────────────────────── */
function send() {
  const text = $input.value.trim();
  if (!text) return;

  hideWelcome();
  renderMessage({ role: 'user', content: text, source: 'user', timestamp: new Date().toISOString() });
  addToSessionList(text);

  $input.value = '';
  resizeInput();
  $input.focus();

  showTyping();

  setTimeout(() => {
    hideTyping();
    const match = findBestMatch(text);
    if (match) {
      renderMessage({ role: 'assistant', content: match.answer, source: 'faq', timestamp: new Date().toISOString() });
    } else {
      renderMessage({
        role: 'assistant',
        source: 'error',
        timestamp: new Date().toISOString(),
        content:
          '⚠️ Esta é uma demonstração estática — respostas com IA requerem o backend rodando localmente.\n\n' +
          'Não encontrei uma resposta exata no FAQ para sua pergunta. Tente reformular ou escolha um tópico nas ações rápidas.\n\n' +
          '📞 Suporte humano: Ramal 1234 | 📧 suporte@empresa.com',
      });
    }
  }, 600);
}

function sendQuick(text) { $input.value = text; send(); }

/* ── Render ────────────────────────────────────────────────────── */
function renderMessage({ role, content, source, timestamp }) {
  const row = document.createElement('div');
  row.className = `msg-row ${role}${source ? ' ' + source : ''}`;

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

/* ── Session list (in-memory only for static version) ──────────── */
let msgCount = 0;
function addToSessionList(text) {
  msgCount++;
  if (msgCount === 1) {
    const item = document.createElement('div');
    item.className = 'session-item active';
    item.innerHTML = `
      <span style="font-size:13px">💬</span>
      <span class="session-title">${escHtml(text.slice(0, 45))}</span>
      <span class="session-time">agora</span>`;
    $sessions.innerHTML = '';
    $sessions.appendChild(item);
  }
}

/* ── FAQ Drawer ────────────────────────────────────────────────── */
const CAT_ICONS = {
  'Senhas e Acesso': '🔑', 'Rede e Internet': '🌐', 'E-mail': '📧',
  'Software': '💿', 'Impressoras': '🖨️', 'VPN e Acesso Remoto': '🔒',
  'Hardware': '🖥️', 'Microsoft Office': '📊', 'Backup e Arquivos': '💾',
  'Chamados e Suporte': '🎫',
};

function renderFaqCategories() {
  const cats = [...new Set(allFaqs.map(f => f.category))];
  $categories.innerHTML = '';
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.innerHTML = `<span class="cat-icon">${CAT_ICONS[cat] || '📌'}</span><span>${cat}</span>`;
    btn.onclick = () => { renderFaqDrawer(allFaqs.filter(f => f.category === cat)); openFaqDrawer(); };
    $categories.appendChild(btn);
  });
}

function renderFaqDrawer(faqs) {
  $faqBody.innerHTML = '';
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

function toggleFaq(el) { el.closest('.faq-item').classList.toggle('expanded'); }
function useFaq(q) { closeFaqDrawer(); $input.value = q; send(); }
function openFaqDrawer() {
  document.getElementById('faqDrawer').classList.add('open');
  document.getElementById('overlay').classList.add('visible');
}
function closeFaqDrawer() {
  document.getElementById('faqDrawer').classList.remove('open');
  document.getElementById('overlay').classList.remove('visible');
}

/* ── UI helpers ──────────────────────────────────────────────────── */
function setStatus(state) {
  $statusDot.className = `status-dot ${state === 'online' ? '' : state}`;
  $statusText.textContent = state === 'online' ? 'FAQ Local ativo' : 'Carregando…';
}

function showTyping() { $typing.style.display = 'flex'; scrollBottom(); }
function hideTyping() { $typing.style.display = 'none'; }
function hideWelcome() { const w = document.getElementById('welcomeScreen'); if (w) w.style.display = 'none'; }
function scrollBottom() { $messages.scrollTop = $messages.scrollHeight; }

function resizeInput() {
  $input.style.height = 'auto';
  $input.style.height = Math.min($input.scrollHeight, 140) + 'px';
}

function formatContent(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\n/g, '<br>');
}

function formatTime(ts) {
  try { return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function sourceBadge(source) {
  const map = { ai: ['badge-ai', 'IA'], faq: ['badge-faq', 'FAQ'], error: ['badge-error', 'Info'] };
  const e = map[source]; return e ? `<span class="source-badge ${e[0]}">${e[1]}</span>` : '';
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Input events ────────────────────────────────────────────────── */
$input.addEventListener('input', resizeInput);
$input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
$sendBtn.addEventListener('click', send);

document.getElementById('clearBtn').addEventListener('click', () => {
  $messages.innerHTML = '';
  msgCount = 0;
  $sessions.innerHTML = '';
  const w = document.createElement('div');
  w.id = 'welcomeScreen'; w.className = 'welcome';
  w.innerHTML = `
    <div class="welcome-icon">🤖</div><h2>Help Desk IA</h2>
    <p>Olá! Sou seu assistente de suporte técnico.<br>Como posso ajudar você hoje?</p>
    <div class="quick-actions">
      <button class="quick-btn" onclick="sendQuick('Como resetar minha senha?')">🔑 Resetar senha</button>
      <button class="quick-btn" onclick="sendQuick('Estou sem acesso à internet')">🌐 Sem internet</button>
      <button class="quick-btn" onclick="sendQuick('Impressora não funciona')">🖨️ Impressora</button>
      <button class="quick-btn" onclick="sendQuick('Como conectar à VPN?')">🔒 VPN</button>
      <button class="quick-btn" onclick="sendQuick('Como abrir um chamado?')">🎫 Abrir chamado</button>
      <button class="quick-btn" onclick="sendQuick('Como instalar um programa?')">💿 Instalar software</button>
    </div>`;
  $messages.appendChild(w);
});

document.getElementById('newChatBtn').addEventListener('click', () => {
  document.getElementById('clearBtn').click();
});

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

document.getElementById('overlay').addEventListener('click', () => {
  closeSidebar();
  closeFaqDrawer();
});

document.getElementById('newChatBtn').addEventListener('click', () => {
  document.getElementById('clearBtn').click();
  if (window.innerWidth < 640) closeSidebar();
});

/* ── Init ────────────────────────────────────────────────────────── */
setStatus('connecting');
loadFAQData();
