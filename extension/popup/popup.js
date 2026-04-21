// Sift — popup controller

const $ = (id) => document.getElementById(id);

const els = {
  researchToggle: $("researchToggle"),
  researchStatus: $("researchStatus"),
  stats: $("stats"),
  statPosts: $("statPosts"),
  statDwell: $("statDwell"),
  statSaves: $("statSaves"),
  openDashboard: $("openDashboard"),
  wipe: $("wipe"),
};

function setStatus(text, isError = false) {
  if (!els.researchStatus) return;
  els.researchStatus.textContent = text;
  els.researchStatus.style.color = isError ? "#ff8a8a" : "";
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

async function sendMessage(message) {
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok && response?.reason) {
      throw new Error(response.reason);
    }
    if (!response?.ok && response?.error) {
      throw new Error(response.error);
    }
    return response;
  } catch (err) {
    console.error("Sift popup message failed:", message?.type, err);
    throw err;
  }
}

async function getState() {
  const response = await sendMessage({ type: "SIFT_GET_STATE" });
  return response?.settings || {};
}

async function getTodayData() {
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

  return {
    savesCount: saves.length,
    postsCount: todaysPosts.length,
    dwellMs: dwell,
  };
}

function updateStatsUI({ postsCount, dwellMs, savesCount }) {
  if (!els.stats || !els.statPosts || !els.statDwell || !els.statSaves) return;

  const hasAnyData = postsCount > 0 || dwellMs > 0 || savesCount > 0;
  els.stats.hidden = !hasAnyData;

  if (!hasAnyData) return;

  els.statPosts.textContent = String(postsCount);
  els.statDwell.textContent = humanSeconds(dwellMs);
  els.statSaves.textContent = String(savesCount);
}

function updateSiteToggles(settings) {
  document.querySelectorAll(".site-toggle").forEach((el) => {
    const host = el.getAttribute("data-host");
    el.checked = settings.sitesEnabled?.[host] !== false;
  });
}

async function refresh() {
  try {
    const settings = await getState();
    const active = !!settings.researchModeActive;

    if (els.researchToggle) {
      els.researchToggle.checked = active;
    }

    setStatus(
      active
        ? "On — capturing this session"
        : "Off — click to start a research session"
    );

    updateSiteToggles(settings);

    const todayData = await getTodayData();
    updateStatsUI(todayData);
  } catch (err) {
    console.error("Sift popup refresh failed:", err);
    setStatus("Something went wrong. Refresh the extension.", true);
  }
}

async function handleResearchToggle(event) {
  const on = !!event.target.checked;

  try {
    if (els.researchToggle) els.researchToggle.disabled = true;

    setStatus(on ? "Starting research session..." : "Ending research session...");

    await sendMessage({
      type: on ? "SIFT_START_SESSION" : "SIFT_STOP_SESSION",
    });

    await refresh();
  } catch (err) {
    console.error("Failed to toggle research mode:", err);
    setStatus("Could not update research mode.", true);
    await refresh();
  } finally {
    if (els.researchToggle) els.researchToggle.disabled = false;
  }
}

async function handleSiteToggle(event) {
  const el = event.currentTarget;
  const host = el.getAttribute("data-host");

  try {
    await sendMessage({
      type: "SIFT_TOGGLE_SITE",
      host,
      enabled: !!el.checked,
    });
  } catch (err) {
    console.error("Failed to toggle site:", host, err);
    setStatus(`Could not update ${host}.`, true);
  }
}

async function handleOpenDashboard() {
  try {
    await sendMessage({ type: "SIFT_OPEN_DASHBOARD" });
    window.close();
  } catch (err) {
    console.error("Failed to open dashboard:", err);
    setStatus("Could not open dashboard.", true);
  }
}

async function handleWipe() {
  const ok = confirm("Delete all Sift data on this device? This cannot be undone.");
  if (!ok) return;

  try {
    await sendMessage({ type: "SIFT_WIPE_ALL" });
    await refresh();
    setStatus("All local Sift data deleted.");
  } catch (err) {
    console.error("Failed to wipe Sift data:", err);
    setStatus("Could not delete data.", true);
  }
}

function bindEvents() {
  if (els.researchToggle) {
    els.researchToggle.addEventListener("change", handleResearchToggle);
  }

  document.querySelectorAll(".site-toggle").forEach((el) => {
    el.addEventListener("change", handleSiteToggle);
  });

  if (els.openDashboard) {
    els.openDashboard.addEventListener("click", handleOpenDashboard);
  }

  if (els.wipe) {
    els.wipe.addEventListener("click", handleWipe);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  await refresh();
});