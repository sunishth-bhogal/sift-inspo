// Sift — Dashboard controller
const $ = (id) => document.getElementById(id);

document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.hidden = true);
    $(`tab-${btn.dataset.tab}`).hidden = false;
  });
});

async function load() {
  const { sessions = {}, saves = [] } = await chrome.storage.local.get(['sessions', 'saves']);
  renderSessions(Object.values(sessions).sort((a, b) => b.startedAt - a.startedAt));
  renderSaves(saves);
}

function fmtDur(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function renderSessions(list) {
  const host = $('sessionsList');
  host.innerHTML = '';
  $('sessionsEmpty').hidden = list.length > 0;
  if (!list.length) { $('sessionDetail').innerHTML = ''; return; }

  for (const s of list) {
    const end = s.endedAt || Date.now();
    const dwell = (s.posts || []).reduce((a, p) => a + (p.dwellMs || 0), 0);
    const card = document.createElement('div');
    card.className = 'session-card';
    card.innerHTML = `
      <div>
        <div class="title">${fmtTime(s.startedAt)} ${s.endedAt ? '' : '<span style="color:#2ecc71">(live)</span>'}</div>
        <div class="sub">${fmtDur(end - s.startedAt)} · ${(s.posts||[]).length} posts · ${(s.events||[]).length} events</div>
      </div>
      <div class="stat">${fmtDur(dwell)} dwell</div>
    `;
    card.addEventListener('click', () => renderDetail(s));
    host.appendChild(card);
  }
  renderDetail(list[0]);
}

function renderDetail(s) {
  if (!s) { $('sessionDetail').innerHTML = ''; return; }
  const summary = window.SiftAnalyzer.summarizeSession(s);

  $('sessionDetail').innerHTML = `
    <h2>Session summary</h2>
    <div class="muted">Started ${fmtTime(s.startedAt)} · ${s.endedAt ? `ended ${fmtTime(s.endedAt)}` : 'still running'} · confidence: <span class="confidence ${summary.confidence}">${summary.confidence}</span></div>

    <div class="kpis">
      <div class="kpi"><div class="n">${summary.postCount}</div><div class="l">posts seen</div></div>
      <div class="kpi"><div class="n">${fmtDur(summary.durationMs)}</div><div class="l">session length</div></div>
      <div class="kpi"><div class="n">${summary.pausedOn.length}</div><div class="l">you paused on</div></div>
      <div class="kpi"><div class="n">${summary.recurringPatterns.length}</div><div class="l">recurring patterns</div></div>
    </div>

    <div class="section-title">Posts you likely paused on</div>
    <div class="paused-list">
      ${summary.pausedOn.map(p => `
        <div class="paused-card">
          <div class="meta">${p.platform.toUpperCase()} · ${escapeHtml(p.author || 'unknown')} · ${fmtDur(p.dwellMs)} dwell</div>
          <div class="txt">${escapeHtml(p.text || '(no text)')}</div>
          <div class="row">
            <span class="hook-chip">${window.SiftAnalyzer.hookLabel(p.hook)}</span>
            ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener">Open original →</a>` : ''}
          </div>
        </div>
      `).join('') || '<div class="muted">No posts with significant dwell yet.</div>'}
    </div>

    <div class="section-title">Recurring patterns in your attention</div>
    <div class="patterns">
      ${summary.recurringPatterns.map(p => `
        <div class="pattern-row">
          <div class="label">${window.SiftAnalyzer.hookLabel(p.hook)}<span class="confidence ${p.confidence}">${p.confidence}</span></div>
          <div class="count">${p.count} posts</div>
        </div>
      `).join('') || '<div class="muted">Not enough data yet.</div>'}
    </div>

    <div class="section-title">Topics your feed is training you toward <span class="confidence low">low</span></div>
    <div class="patterns">
      ${summary.topicsFeedIsTraining.map(t => `
        <div class="pattern-row"><div class="label">${escapeHtml(t.term)}</div><div class="count">signal</div></div>
      `).join('') || '<div class="muted">Not enough data yet.</div>'}
    </div>

    <div class="section-title">Draft post ideas based on today's attention</div>
    <div class="draft-ideas">
      ${summary.draftIdeas.map(d => `
        <div class="draft-card">${escapeHtml(d.angle)} <span class="confidence low">low confidence</span></div>
      `).join('') || '<div class="muted">Pause on a few posts and the generator will have something to work with.</div>'}
    </div>
  `;
}

function renderSaves(list) {
  const host = $('savesList');
  host.innerHTML = '';
  $('savesEmpty').hidden = list.length > 0;
  for (const p of list) {
    const card = document.createElement('div');
    card.className = 'save-card';
    card.innerHTML = `
      <div class="head">
        <span>${p.platform.toUpperCase()} · ${escapeHtml(p.author || 'unknown')}</span>
        <span>${fmtTime(p.savedAt)}</span>
      </div>
      <div class="hook">${escapeHtml(window.SiftAnalyzer.hookLabel(p.hook || 'unknown'))}</div>
      <div class="txt">${escapeHtml((p.text || '').slice(0, 420))}</div>
      ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener">Open original →</a>` : ''}
    `;
    host.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

$('exportBtn').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sift-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

$('wipeBtn').addEventListener('click', async () => {
  if (!confirm('Delete all Sift data on this device?')) return;
  await chrome.runtime.sendMessage({ type: 'SIFT_WIPE_ALL' });
  load();
});

load();