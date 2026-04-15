// Sift — popup controller
const $ = (id) => document.getElementById(id);

async function state() {
  const r = await chrome.runtime.sendMessage({ type: 'SIFT_GET_STATE' });
  return r?.settings || {};
}

async function refresh() {
  const s = await state();
  const active = !!s.researchModeActive;
  $('researchToggle').checked = active;
  $('researchStatus').textContent = active
    ? 'On — capturing this session'
    : 'Off — click to start a research session';

  // site toggles
  document.querySelectorAll('.site-toggle').forEach(el => {
    const host = el.getAttribute('data-host');
    el.checked = s.sitesEnabled?.[host] !== false;
  });

  // today stats: count from sessions + saves
  const data = await chrome.storage.local.get(['sessions', 'saves']);
  const now = Date.now();
  const dayAgo = now - 24 * 3600 * 1000;

  const saves = (data.saves || []).filter(p => (p.savedAt || 0) >= dayAgo);

  const todaysPosts = [];
  let dwell = 0;
  for (const sess of Object.values(data.sessions || {})) {
    if ((sess.startedAt || 0) < dayAgo) continue;
    todaysPosts.push(...(sess.posts || []));
    for (const p of sess.posts || []) dwell += (p.dwellMs || 0);
  }

  if (active || todaysPosts.length || saves.length) {
    $('stats').hidden = false;
    $('statPosts').textContent = String(todaysPosts.length);
    $('statDwell').textContent = humanSeconds(dwell);
    $('statSaves').textContent = String(saves.length);
  }
}

function humanSeconds(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

$('researchToggle').addEventListener('change', async (e) => {
  const on = e.target.checked;
  await chrome.runtime.sendMessage({
    type: on ? 'SIFT_START_SESSION' : 'SIFT_STOP_SESSION'
  });
  refresh();
});

document.querySelectorAll('.site-toggle').forEach(el => {
  el.addEventListener('change', async (e) => {
    const host = el.getAttribute('data-host');
    await chrome.runtime.sendMessage({
      type: 'SIFT_TOGGLE_SITE',
      host,
      enabled: e.target.checked
    });
  });
});

$('openDashboard').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SIFT_OPEN_DASHBOARD' });
});

$('wipe').addEventListener('click', async () => {
  if (!confirm('Delete all Sift data on this device? This cannot be undone.')) return;
  await chrome.runtime.sendMessage({ type: 'SIFT_WIPE_ALL' });
  refresh();
});

refresh();