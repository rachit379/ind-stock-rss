const DATA_URL = "./data/feeds.json";
let refreshTimer = null;

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

function render(items, generatedUTC) {
  const container = document.getElementById("feed");
  const meta = document.getElementById("meta");
  container.innerHTML = "";

  meta.textContent = generatedUTC
    ? `Updated: ${new Date(generatedUTC).toLocaleString()}`
    : "Updated: —";

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
  if (onlyIndia) {
    filtered = filtered.filter(x => x.likely_india_equity);
  }
  if (source !== "ALL") {
    filtered = filtered.filter(x => x.source === source);
  }

  for (const it of filtered) {
    const card = document.createElement("a");
    card.className = "card";
    card.href = it.link || "#";
    card.target = "_blank";
    card.rel = "noopener";

    card.innerHTML = `
      <div class="card-head">
        <span class="source">${it.source || "Unknown"}</span>
        <span class="time">${timeAgo(it.published_utc)}</span>
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
    container.appendChild(card);
  }

  document.getElementById("count").textContent = filtered.length;
}

async function load() {
  try {
    const resp = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    const data = await resp.json();
    const items = data.items || [];
    render(items, data.generated_utc);

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
