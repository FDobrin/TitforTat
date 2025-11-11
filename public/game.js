const API = "https://titfortat-gecs.onrender.com"; // replace with your deployed server
const POLL_MS = 2000;
const MAX_SCORE = 150;

let gameId = null;
let myRole = "A";
let pollTimer = null;
let spectating = false;

const refs = {
  lobby: document.getElementById('lobby'),
  playerView: document.getElementById('playerView'),
  spectatorView: document.getElementById('spectatorView'),
  gameList: document.getElementById('gameList'),
  joinId: document.getElementById('joinId'),
  role: document.getElementById('role'),
  name: document.getElementById('name'),
  labelA: document.getElementById('labelA'),
  labelB: document.getElementById('labelB'),
  scoreA: document.getElementById('scoreA'),
  scoreB: document.getElementById('scoreB'),
  barA: document.getElementById('barA'),
  barB: document.getElementById('barB'),
  round: document.getElementById('round'),
  result: document.getElementById('result'),
  historyList: document.getElementById('historyList'),
  spectatorBoard: document.getElementById('spectatorBoard')
};

// ===== Utilities =====
async function safeFetch(url, options) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    showToast("Network or server error.");
    return null;
  }
}
function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = "position:fixed; bottom:20px; left:20px; background:#333; color:#fff; padding:8px 12px; border-radius:8px;";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function toggleDisabled(id, disabled) {
  const el = document.getElementById(id);
  if (el) el.disabled = disabled;
}

// ===== Lobby actions =====
async function createGame() {
  const data = await safeFetch(API + "/create", { method: "POST" });
  if (!data) return;
  gameId = data.gameId;
  alert("Game created! Share this room code: " + gameId);
  enterPlayerView();
}
async function joinGame() {
  const id = refs.joinId.value.trim();
  if (!id) return alert("Enter a room code.");
  const state = await safeFetch(`${API}/state/${id}`);
  if (!state) return;
  gameId = id;
  enterPlayerView();
}
async function loadLobby() {
  const list = await safeFetch(API + "/games");
  if (!list) return;
  refs.gameList.innerHTML = list.map(g => `
    <div style="margin:6px 0;">
      <code>${g.id}</code> — ${escapeHtml(g.names.A)} vs ${escapeHtml(g.names.B)}, Round ${g.round} ${g.finished ? '(Finished)' : ''}
      <button onclick="watchGame('${g.id}')">Watch</button>
      <button onclick="joinExisting('${g.id}')">Join</button>
    </div>
  `).join('');
}
async function joinExisting(id) {
  const state = await safeFetch(`${API}/state/${id}`);
  if (!state) return;
  gameId = id;
  enterPlayerView();
}

// ===== Modes =====
function enterPlayerView() {
  spectating = false;
  refs.lobby.style.display = 'none';
  refs.playerView.style.display = 'block';
  refs.spectatorView.style.display = 'none';
  startPolling();
}
function enterSpectatorView() {
  spectating = true;
  refs.lobby.style.display = 'none';
  refs.playerView.style.display = 'none';
  refs.spectatorView.style.display = 'block';
  startPolling();
}
async function watchGame(id) {
  gameId = id;
  enterSpectatorView();
}
function backToLobby() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  gameId = null;
  spectating = false;
  refs.lobby.style.display = 'block';
  refs.playerView.style.display = 'none';
  refs.spectatorView.style.display = 'none';
  loadLobby();
}

// ===== Player actions =====
async function setName() {
  myRole = refs.role.value;
  const name = refs.name.value.trim();
  if (!gameId) return alert("Join or create a game first.");
  await safeFetch(`${API}/setName/${gameId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: myRole, name })
  });
  await refresh();
}
async function sendChoice(color) {
  if (!gameId) return alert("Join or create a game first.");
  await safeFetch(`${API}/choice/${gameId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: myRole, color })
  });
  await refresh();
}
async function replay() {
  if (!gameId) return;
  await safeFetch(`${API}/replay/${gameId}`, { method: "POST" });
  await refresh();
}
async function reset() {
  if (!gameId) return;
  await safeFetch(`${API}/reset/${gameId}`, { method: "POST" });
  await refresh();
}

// ===== Polling =====
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, POLL_MS);
  refresh(); // immediate
}
async function refresh() {
  if (!gameId) return;
  const endpoint = spectating ? `/spectate/${gameId}` : `/state/${gameId}`;
  const state = await safeFetch(API + endpoint);
  if (!state) return;
  renderState(state);
}

// ===== Rendering =====
function renderState(state) {
  if (!spectating) {
    refs.labelA.textContent = state.names.A;
    refs.labelB.textContent = state.names.B;
    refs.scoreA.textContent = state.scoreA;
    refs.scoreB.textContent = state.scoreB;
    refs.round.textContent = Math.min(state.round, 30);

    const pctA = Math.min(100, (state.scoreA / MAX_SCORE) * 100);
    const pctB = Math.min(100, (state.scoreB / MAX_SCORE) * 100);
    refs.barA.style.width = pctA + '%';
    refs.barB.style.width = pctB + '%';
    refs.barA.textContent = Math.round(pctA) + '%';
    refs.barB.textContent = Math.round(pctB) + '%';

    refs.result.textContent = state.message || '';

    const aCanPlay = !state.finished && myRole === 'A' && !state.choices?.A;
    const bCanPlay = !state.finished && myRole === 'B' && !state.choices?.B;
    toggleDisabled('btnARed', !aCanPlay);
    toggleDisabled('btnAGreen', !aCanPlay);
    toggleDisabled('btnBRed', !bCanPlay);
    toggleDisabled('btnBGreen', !bCanPlay);
  }

  refs.historyList.innerHTML = state.history.map(item => `
    <div>
      Round ${item.round}: ${escapeHtml(state.names.A)} chose ${escapeHtml(item.aChoice)}, 
      ${escapeHtml(state.names.B)} chose ${escapeHtml(item.bChoice)} 
      → ${escapeHtml(state.names.A)}: ${item.scoreA}, ${escapeHtml(state.names.B)}: ${item.scoreB}
    </div>
  `).join('');
  const historyPanel = document.getElementById('history');
  historyPanel.scrollTop = historyPanel.scrollHeight;

  if (spectating) {
    const pctA = Math.min(100, (state.scoreA / MAX_SCORE) * 100);
    const pctB = Math.min(100, (state.scoreB / MAX_SCORE) * 100);
    refs.spectatorBoard.innerHTML = `
      <div style="font-size:20px; margin-bottom:10px;">
        Round ${Math.min(state.round, 30)} / 30
      </div>
      <div style="display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:center;">
        <div style="text-align:left; font-weight:bold;">${escapeHtml(state.names.A)}</div>
        <div>${state.scoreA}</div>
      </div>
      <div class="progress"><div class="bar"
