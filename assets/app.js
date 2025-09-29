const DATA_URL = "./data/feeds.json";
let refreshTimer = null;

const PAGE_SIZE = 25; // items per section initially
const state = { today: PAGE_SIZE, yesterday: PAGE_SIZE, earlier: PAGE_SIZE };
let currentItems = []; // filtered + sorted items

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

function startOfDayIST(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function istNow() {
  const s = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  return new Date(s);
}

function sortDescByTime(items) {
  return items.slice().sort((a, b) => {
    const ta = a.published_utc ? Date.parse(a.published_utc) : 0;
    const tb = b.published_utc ? Date.parse(b.published_utc) : 0;
    return tb - ta;
  });
}

function groupByDay(items) {
  const now = istNow();
  const todayStart = startOfDayIST(now);
  const yesterdayStart = new Date(todayStart.getTime() - 24*60*60*1000);

  const groups = { today: [], yesterday: [], earlier: [] };

  for (const it of items) {
    const d = toISTDateObj(it.published_utc);
    if (!d) { groups.earlier.push(it); continue; }
    if (d >= todayStart) groups.today.push(it);
    else if (d >= yesterdayStart) groups.yesterday.push(it);
    else groups.earlier.push(it);
  }

  return groups;
}

function renderSection(container, title, key, items) {
  const header = document.createElement('div');
  header.className = 'section';
  header.innerHTML = `<div class="section-title">${title}</div><div class="section-meta">${items.length} stories</div>`;
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'grid';
  container.appendChild(grid);

  const visible = items.slice(0, state[key]);
  for (const it of visible) {
    const card = document.createElement("a");
    card.className = "card";
    card.href = it.link || "#";
    card.target = "_blank";
    card.rel = "noopener";

    const ist = istDate(it.published_utc);
    card.innerHTML = `
      <div class="card-head">
        <span class="source">${it.source || "Unknown"}</span>
        <span class="time">
          <span>${timeAgo(it.published_utc)}</span>
          ${ist ? `<small class="datechip">${ist} IST</small>` : ""}
        </span>
      </div>
      <div class="title">${it.title || "No title"}</div>
      ${it.summary ? `<div class="summary">${it.summary}</div>` : ""}
      <div class="meta-row">
        <span class="badge ${it.likely_india_equity ? "yes" : "no"}">
          ${it.likely_india_equity ? "INDIA / EQUITY" : "GENERAL"}
        </span>
        ${it.published_ist ? `<span class="ist">IST: ${it.published_ist}</span>` : ""}
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
      render(currentItems, window.__lastGeneratedUTC);
    });
    container.appendChild(btn);
  }
}

function render(items, generatedUTC) {
  window.__lastGeneratedUTC = generatedUTC;
  const root = document.getElementById("feed");
  const meta = document.getElementById("meta");
  root.innerHTML = "";

  // latest → oldest
  items = sortDescByTime(items);
  currentItems = items;

  meta.textContent = generatedUTC
    ? `Updated: ${new Date(generatedUTC).toLocaleString()}`
    : "Updated: —";

  // filters
  const q = document.getElementById("search").value.trim().toLowerCase();
  const onlyIndia = document.getElementById("onlyIndia").checked;
  const source = document.getElementById("source").value;

  let filtered = items;
  if (q) {
    filtered = filtered.filter(x =>
      (x.title || "").toLowerCase().includes(q) ||
      (x.summary || "").toLowerCase().includes(q) ||
      (x.source || "").toLowerCase().includes(q)
    );
  }
  if (onlyIndia) filtered = filtered.filter(x => x.likely_india_equity);
  if (source !== "ALL") filtered = filtered.filter(x => x.source === source);

  // reset section sizes on new filter
  state.today = PAGE_SIZE; state.yesterday = PAGE_SIZE; state.earlier = PAGE_SIZE;

  const groups = groupByDay(filtered);

  const order = [
    ["Today", "today"],
    ["Yesterday", "yesterday"],
    ["Earlier", "earlier"],
  ];
  for (const [title, key] of order) {
    const arr = groups[key];
    if (arr && arr.length) renderSection(root, title, key, arr);
  }

  document.getElementById("count").textContent = filtered.length;

  const sel = document.getElementById("source");
  if (sel.options.length === 1) {
    const uniqueSources = Array.from(new Set(items.map(x => x.source))).sort();
    for (const s of uniqueSources) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    }
  }
}

async function load() {
  try {
    const resp = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    const data = await resp.json();
    const items = data.items || [];
    render(items, data.generated_utc);
  } catch (e) {
    console.error(e);
    document.getElementById("meta").textContent = "Failed to load data.";
  }
}

function manualRefresh() { load(); }
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(load, 60 * 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refresh").addEventListener("click", manualRefresh);
  document.getElementById("search").addEventListener("input", load);
  document.getElementById("onlyIndia").addEventListener("change", load);
  document.getElementById("source").addEventListener("change", load);
  load();
  startAutoRefresh();
});
