// UI state & constants
const DATA_URL = "./data/feeds.json";
let refreshTimer = null;
let countdownTimer = null;

const PAGE_SIZE = 25;
const state = {
  today: PAGE_SIZE,
  yesterday: PAGE_SIZE,
  earlier: PAGE_SIZE,
  older: PAGE_SIZE,
  relativeTime: true,
  unreadOnly: false,
};

let currentItems = [];
let lastGeneratedUTC = null;
let seenIds = new Set(JSON.parse(localStorage.getItem("seen_ids_v1") || "[]"));

function saveSeen() {
  localStorage.setItem("seen_ids_v1", JSON.stringify(Array.from(seenIds)));
}

// Time helpers
function timeAgo(utcString) {
  if (!utcString) return "—";
  const dt = new Date(utcString);
  const now = new Date();
  const diffMs = now - dt;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}
function istDate(utcString) {
  if (!utcString) return null;
  const opts = { timeZone: 'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false };
  return new Intl.DateTimeFormat('en-GB', opts).format(new Date(utcString)).replace(',', '');
}
function toISTDateObj(utcString) {
  if (!utcString) return null;
  const istString = new Date(utcString).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  return new Date(istString);
}
function startOfDayIST(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function istNow() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })); }

// Sorting/grouping
function sortDescByTime(items) {
  return items.slice().sort((a, b) => {
    const ta = a.published_utc ? Date.parse(a.published_utc) : 0;
    const tb = b.published_utc ? Date.parse(b.published_utc) : 0;
    return tb - ta;
  });
}
function groupByBuckets(items) {
  const now = istNow();
  const todayStart = startOfDayIST(now);
  const yesterdayStart = new Date(todayStart.getTime() - 24*60*60*1000);
  const sevenDaysStart = new Date(todayStart.getTime() - 7*24*60*60*1000);

  const g = { today: [], yesterday: [], earlier: [], older: [] };
  for (const it of items) {
    const d = toISTDateObj(it.published_utc);
    if (!d) { g.older.push(it); continue; }
    if (d >= todayStart) g.today.push(it);
    else if (d >= yesterdayStart) g.yesterday.push(it);
    else if (d >= sevenDaysStart) g.earlier.push(it);
    else g.older.push(it);
  }
  return g;
}

// Highlight
function hi(text, q) {
  if (!text || !q) return text || "";
  const words = q.trim().split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return text;
  const re = new RegExp('(' + words.join('|') + ')', 'ig');
  return (text || '').replace(re, '<mark>$1</mark>');
}

// Rendering
function renderSection(container, title, key, items, q) {
  const header = document.createElement('div');
  header.className = 'section';
  header.innerHTML = `<div class="section-title">${title}</div><div class="section-meta">${items.length} stories</div>`;
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'grid';
  container.appendChild(grid);

  const visible = items.slice(0, state[key]);
  for (const it of visible) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = it.link || '#';
    card.target = '_blank';
    card.rel = 'noopener';
    card.addEventListener('click', () => { if (it.id) { seenIds.add(it.id); saveSeen(); } });

    const isUnread = it.id ? !seenIds.has(it.id) : false;
    const dot = isUnread ? '<span class="unread-dot" aria-hidden="true"></span>' : '';

    const istChip = it.published_utc ? istDate(it.published_utc) : (it.published_ist || null);
    const timeLabel = state.relativeTime
      ? (it.published_utc ? timeAgo(it.published_utc) : '—')
      : (istChip || '—');

    const titleHTML = hi(it.title || 'No title', q);
    const summaryHTML = hi(it.summary || '', q);

    card.innerHTML = `
      ${dot}
      <div class="card-head">
        <span class="source">
          <svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/></svg>
          ${it.source || 'Unknown'}
        </span>
        <span class="time">
          <span>${timeLabel}</span>
          ${istChip ? `<small class="datechip">${istChip} IST</small>` : ''}
        </span>
      </div>
      <div class="title">${titleHTML}</div>
      ${it.summary ? `<div class="summary">${summaryHTML}</div>` : ''}
      <div class="meta-row">
        <span class="badge ${it.likely_india_equity ? 'yes' : 'no'}">${it.likely_india_equity ? 'INDIA / EQUITY' : 'GENERAL'}</span>
        ${it.published_ist ? `<span class="ist" style="color:var(--muted);font-size:12px;">IST: ${it.published_ist}</span>` : ''}
      </div>
    `;
    grid.appendChild(card);
  }

  if (items.length > state[key]) {
    const btn = document.createElement('button');
    btn.className = 'load-more';
    btn.textContent = `Show more (${items.length - state[key]} more)`;
    btn.addEventListener('click', () => {
      state[key] += PAGE_SIZE;
      render(currentItems, lastGeneratedUTC);
    });
    container.appendChild(btn);
  }
}

function render(items, generatedUTC) {
  lastGeneratedUTC = generatedUTC;
  const root = document.getElementById('feed');
  const updated = document.getElementById('updated');
  root.innerHTML = '';

  items = sortDescByTime(items);
  currentItems = items;

  updated.textContent = generatedUTC ? `Updated: ${new Date(generatedUTC).toLocaleString()}` : 'Updated: —';

  const q = document.getElementById('search').value.trim().toLowerCase();
  const onlyIndia = document.getElementById('onlyIndia').checked;
  const source = document.getElementById('source').value;
  const unreadOnly = document.getElementById('unreadOnly').checked;
  const relativeTime = document.getElementById('relativeTime').checked;
  state.unreadOnly = unreadOnly;
  state.relativeTime = relativeTime;

  let filtered = items;
  if (q) filtered = filtered.filter(x => (x.title||'').toLowerCase().includes(q) || (x.summary||'').toLowerCase().includes(q) || (x.source||'').toLowerCase().includes(q));
  if (onlyIndia) filtered = filtered.filter(x => x.likely_india_equity);
  if (source !== 'ALL') filtered = filtered.filter(x => x.source === source);
  if (unreadOnly) filtered = filtered.filter(x => x.id && !seenIds.has(x.id));

  // reset paging
  state.today = PAGE_SIZE; state.yesterday = PAGE_SIZE; state.earlier = PAGE_SIZE; state.older = PAGE_SIZE;

  const groups = groupByBuckets(filtered);
  const order = [
    ['Today', 'today'],
    ['Yesterday', 'yesterday'],
    ['Earlier', 'earlier'],
    ['Older', 'older'],
  ];
  for (const [title, key] of order) {
    const arr = groups[key];
    if (arr && arr.length) renderSection(root, title, key, arr, q);
  }

  document.getElementById('count').textContent = filtered.length;

  const sel = document.getElementById('source');
  if (sel.options.length === 1) {
    const uniqueSources = Array.from(new Set(items.map(x => x.source))).sort();
    for (const s of uniqueSources) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    }
  }
}

// Load & timers
async function load() {
  try {
    const resp = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    const data = await resp.json();
    const items = data.items || [];
    render(items, data.generated_utc);
  } catch (e) {
    console.error(e);
    document.getElementById('updated').textContent = 'Failed to load data.';
  }
}
function manualRefresh() { load(); }
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(load, 60 * 1000);
  if (countdownTimer) clearInterval(countdownTimer);
  let left = 60;
  const node = document.getElementById('countdown');
  node.textContent = String(left);
  countdownTimer = setInterval(() => {
    left = left - 1;
    if (left <= 0) left = 60;
    node.textContent = String(left);
  }, 1000);
}

// Wire up controls
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh').addEventListener('click', manualRefresh);
  document.getElementById('clearSeen').addEventListener('click', () => { seenIds = new Set(); saveSeen(); render(currentItems, lastGeneratedUTC); });
  document.getElementById('search').addEventListener('input', load);
  document.getElementById('onlyIndia').addEventListener('change', load);
  document.getElementById('source').addEventListener('change', load);
  document.getElementById('relativeTime').addEventListener('change', () => render(currentItems, lastGeneratedUTC));
  document.getElementById('unreadOnly').addEventListener('change', load);

  load();
  startAutoRefresh();
});
