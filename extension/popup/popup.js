// Sift — popup controller (safe version)

const $ = (id) => document.getElementById(id);

function runtimeAvailable() {
  return typeof chrome !== "undefined" && !!chrome?.runtime?.id;
}

async function safeSendMessage(message) {
  if (!runtimeAvailable()) {
    return { ok: false, reason: "runtime-unavailable" };
  }

  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    const msg = String(err?.message || err);

    if (
      msg.includes("Extension context invalidated") ||
      msg.includes("Receiving end does not exist") ||
      msg.includes("message port closed")
    ) {
      return { ok: false, reason: "runtime-invalidated" };
    }

    console.error("[Sift popup] sendMessage failed", err);
    return { ok: false, reason: "send-failed", error: msg };
  }
}

function humanSeconds(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

async function getState() {
  const r = await safeSendMessage({ type: "SIFT_GET_STATE" });
  return r?.settings || {};
}

async function refresh() {
  const s = await getState();
  const active = !!s.researchModeActive;

  const researchToggle = $("researchToggle");
  const researchStatus = $("researchStatus");
  const stats = $("stats");
  const statPosts = $("statPosts");
  const statDwell = $("statDwell");
  const statSaves = $("statSaves");

  if (researchToggle) researchToggle.checked = active;
  if (researchStatus) {
    researchStatus.textContent = active
      ? "On — capturing this session"
      : "Off — click to start a research session";
  }

  document.querySelectorAll(".site-toggle").forEach((el) => {
    const host = el.getAttribute("data-host");
    el.checked = s.sitesEnabled?.[host] !== false;
  });

  const data = await chrome.storage.local.get(["sessions", "saves"]);
  const now = Date.now();
  const dayAgo = now - 24 * 3600 * 1000;

  const saves = (data.saves || []).filter((p) => (p.savedAt || 0) >= dayAgo);

  const todaysPosts = [];
  let dwell = 0;

  for (const sess of Object.values(data.sessions || {})) {
    if ((sess.startedAt || 0) < dayAgo) continue;
    for (const p of sess.posts || []) {
      todaysPosts.push(p);
      dwell += p.dwellMs || 0;
    }
  }

  if (stats) {
    stats.hidden = !(active || todaysPosts.length || saves.length);
  }

  if (statPosts) statPosts.textContent = String(todaysPosts.length);
  if (statDwell) statDwell.textContent = humanSeconds(dwell);
  if (statSaves) statSaves.textContent = String(saves.length);
}

async function onToggleResearch(e) {
  const on = !!e.target.checked;
  const result = await safeSendMessage({
    type: on ? "SIFT_START_SESSION" : "SIFT_STOP_SESSION",
  });

  if (!result?.ok) {
    e.target.checked = !on;
    console.error("[Sift popup] failed to toggle research mode", result);
  }

  await refresh();
}

async function onToggleSite(e) {
  const host = e.target.getAttribute("data-host");
  await safeSendMessage({
    type: "SIFT_TOGGLE_SITE",
    host,
    enabled: e.target.checked,
  });
}

async function onOpenDashboard() {
  const result = await safeSendMessage({ type: "SIFT_OPEN_DASHBOARD" });
  if (!result?.ok) {
    console.error("[Sift popup] failed to open dashboard", result);
  }
}

async function onWipe() {
  const ok = confirm("Delete all Sift data on this device? This cannot be undone.");
  if (!ok) return;

  const result = await safeSendMessage({ type: "SIFT_WIPE_ALL" });
  if (!result?.ok) {
    console.error("[Sift popup] failed to wipe data", result);
  }

  await refresh();
}

function bind() {
  const researchToggle = $("researchToggle");
  const openDashboard = $("openDashboard");
  const wipe = $("wipe");

  if (researchToggle) {
    researchToggle.addEventListener("change", onToggleResearch);
  }

  document.querySelectorAll(".site-toggle").forEach((el) => {
    el.addEventListener("change", onToggleSite);
  });

  if (openDashboard) {
    openDashboard.addEventListener("click", onOpenDashboard);
  }

  if (wipe) {
    wipe.addEventListener("click", onWipe);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  bind();
  await refresh();
});