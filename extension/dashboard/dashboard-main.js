/* Sift Dashboard — Creator Command Center */

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtTime(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

function fmtDate(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return "—"; }
}

function fmtDur(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function cleanText(text, author = "") {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  t = t
    .replace(/\bFeed post\b/gi, "").replace(/\bSuggested\b/gi, "")
    .replace(/\bPremium Profile\b/gi, "").replace(/\bVerified Profile\b/gi, "")
    .replace(/\bLike\s+Comment\s+Repost\s+Send\b/gi, "")
    .replace(/\bLike\b/gi, "").replace(/\bComment\b/gi, "")
    .replace(/\bRepost\b/gi, "").replace(/\bSend\b/gi, "")
    .replace(/\b\d+\s+comments?\b/gi, "").replace(/\b\d+\s+reposts?\b/gi, "")
    .replace(/\bFollow\b/gi, "").replace(/\bEdited\b/gi, "");
  if (author) {
    const esc2 = author.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`^${esc2}\\s*`, "i"), "");
  }
  return t.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Tab routing
// ---------------------------------------------------------------------------

function setupTabs() {
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab").forEach((tab) => (tab.hidden = true));
      const target = $(`tab-${btn.dataset.tab}`);
      if (target) target.hidden = false;
    });
  });
}

// ---------------------------------------------------------------------------
// Session list
// ---------------------------------------------------------------------------

function renderSessions(list, saves) {
  const host = $("sessionsList");
  const empty = $("sessionsEmpty");
  if (!host || !empty) return;

  empty.hidden = list.length > 0;
  host.innerHTML = "";

  if (!list.length) return;

  list.forEach((session, idx) => {
    const posts = Array.isArray(session.posts) ? session.posts : [];
    const totalDwell = posts.reduce((s, p) => s + (p.dwellMs || 0), 0);
    const duration = Math.max(0, (session.endedAt || Date.now()) - (session.startedAt || 0));

    const card = document.createElement("div");
    card.className = "session-card" + (idx === 0 ? " selected" : "");
    card.innerHTML = `
      <div class="sc-date">${esc(fmtDate(session.startedAt))}</div>
      <div class="sc-meta">
        ${esc(fmtDur(duration))} duration · ${esc(String(posts.length))} posts
      </div>
      <div>
        <span class="sc-dwell">${esc(fmtDur(totalDwell))} dwell</span>
        <span class="sc-mode">Research</span>
      </div>
    `;

    card.addEventListener("click", () => {
      document.querySelectorAll(".session-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      renderCommandCenter(session, saves);
    });

    host.appendChild(card);
  });

  if (list.length) renderCommandCenter(list[0], saves);
}

// ---------------------------------------------------------------------------
// Command center (center + right panels)
// ---------------------------------------------------------------------------

function renderCommandCenter(session, saves) {
  const emptyState = $("emptyState");
  const detail = $("sessionDetail");
  const insightPanel = $("insightPanel");

  if (emptyState) emptyState.hidden = true;
  if (detail) detail.hidden = false;
  if (insightPanel) insightPanel.hidden = false;

  const engine = window.SiftEngine;
  if (!engine) {
    detail.innerHTML = `<div class="muted">Recommendation engine not loaded.</div>`;
    return;
  }

  const { recommendation: rec, profile, patterns } = engine.generateRecommendation(session);
  const posts = Array.isArray(session.posts) ? session.posts : [];
  const events = Array.isArray(session.events) ? session.events : [];

  const totalDwell = posts.reduce((s, p) => s + (p.dwellMs || 0), 0);
  const duration = Math.max(0, (session.endedAt || Date.now()) - (session.startedAt || 0));

  // Score and sort posts for evidence
  const scoredPosts = posts
    .map((p) => ({ post: p, score: engine.scorePost(p, events).interestScore }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // ── Center column ──
  detail.innerHTML = buildNBPCard(rec) +
    buildEvidenceSection(rec, patterns) +
    buildHooksSection(rec) +
    buildDraftSection(rec) +
    buildEvidencePostsSection(scoredPosts);

  // ── Right column ──
  insightPanel.innerHTML = buildVoiceCard(profile, rec) +
    buildAvoidCard(rec) +
    buildSwipePreviewCard(saves);

  // Bind interactions after render
  bindCopyButtons();
  bindDraftBuilder(rec);
  bindWritePost(rec);
}

// ---------------------------------------------------------------------------
// Next Best Post card
// ---------------------------------------------------------------------------

function buildNBPCard(rec) {
  const confidenceClass =
    rec.confidence >= 70 ? "" :
    rec.confidence >= 45 ? "confidence-mid" : "confidence-low";

  const hasData = rec.confidence > 0;

  return `
    <div class="nbp-card">
      <div class="nbp-eyebrow">
        <span class="nbp-label">Next Best Post</span>
        ${hasData ? `<span class="confidence-chip ${confidenceClass}">${esc(String(rec.confidence))}% confidence</span>` : ""}
      </div>

      ${hasData ? `
      <div class="nbp-tags">
        <span class="tag-chip"><span class="chip-label">Format</span> ${esc(rec.format)}</span>
        <span class="tag-chip"><span class="chip-label">Topic</span> ${esc(rec.topic)}</span>
        <span class="tag-chip"><span class="chip-label">Angle</span> ${esc(rec.angle)}</span>
      </div>

      <div class="nbp-hook">${esc(rec.suggestedHook)}</div>

      <div class="nbp-reasons">
        <div class="nbp-reason">
          <div class="reason-label">Why this fits your feed</div>
          <div class="reason-text">${esc(rec.whyFeed)}</div>
        </div>
        <div class="nbp-reason">
          <div class="reason-label">Why this fits your voice</div>
          <div class="reason-text">${esc(rec.whyVoice)}</div>
        </div>
      </div>

      <div class="nbp-actions">
        <button class="btn-primary" id="writePostBtn" type="button">Write this post</button>
        <button class="btn-ghost" id="showHooksBtn" type="button">Hook starters</button>
        <button class="btn-ghost" id="showEvidenceBtn" type="button">See evidence</button>
      </div>
      ` : `
      <p class="muted" style="margin:8px 0 4px;">Run a research session to generate your first recommendation.</p>
      `}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Why Sift thinks this
// ---------------------------------------------------------------------------

function buildEvidenceSection(rec, patterns) {
  const maxWeight = patterns.length ? Math.max(...patterns.map((p) => p.weight || 1)) : 1;

  const patternRows = patterns.length
    ? patterns.map((p) => `
        <div class="pattern-item">
          <span class="p-name">${esc(p.pattern)}</span>
          <div class="p-bar-wrap">
            <div class="p-bar" style="width:${Math.round((p.weight / maxWeight) * 100)}%"></div>
          </div>
        </div>
      `).join("")
    : `<div class="muted small">No patterns detected yet.</div>`;

  const signalRows = rec.evidence.strongestSignals.map((s) => `
    <div class="signal-item">
      <span class="sig-label">${esc(s)}</span>
    </div>
  `).join("") || `<div class="muted small">No signals yet.</div>`;

  return `
    <div class="evidence-panel" id="evidenceSection">
      <div class="section-head"><h3>Why Sift thinks this</h3></div>

      <div class="section-eyebrow" style="margin-bottom:8px;">Top patterns detected</div>
      <div class="pattern-list">${patternRows}</div>

      <div class="section-eyebrow" style="margin-bottom:8px;">Signals that influenced this</div>
      <div class="signal-list">${signalRows}</div>

      ${rec.evidence.reasoningSummary ? `
        <div class="reasoning-box">${esc(rec.evidence.reasoningSummary)}</div>
      ` : ""}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Hook starters
// ---------------------------------------------------------------------------

function buildHooksSection(rec) {
  if (!rec.hookStarters.length) return "";

  const cards = rec.hookStarters.map((h, i) => `
    <div class="hook-card">
      <div class="hook-text">${esc(h)}</div>
      <button class="copy-btn" data-copy="${esc(h)}" data-idx="${i}" type="button">Copy</button>
    </div>
  `).join("");

  return `
    <div class="hooks-panel" id="hooksSection">
      <div class="section-head"><h3>Hook Starters</h3></div>
      <div class="hook-cards">${cards}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Draft builder
// ---------------------------------------------------------------------------

function buildDraftSection(rec) {
  return `
    <div class="draft-panel" id="draftSection" hidden>
      <div class="section-head">
        <h3>Draft Builder</h3>
      </div>

      <div class="tone-controls">
        <button class="btn-ghost active" data-tone="casual" type="button">More casual</button>
        <button class="btn-ghost" data-tone="polished" type="button">More polished</button>
        <button class="btn-ghost" data-tone="concise" type="button">More concise</button>
        <button class="btn-ghost" data-tone="vulnerable" type="button">More vulnerable</button>
      </div>

      <textarea
        class="draft-area tone-casual"
        id="draftArea"
        spellcheck="true"
        placeholder="Click 'Write this post' above to generate a draft structure..."
      ></textarea>

      <div class="draft-meta">
        <span class="draft-counter" id="draftCounter">0 characters</span>
        <button class="btn-ghost" id="copyDraftBtn" type="button">Copy draft</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Evidence posts (bottom of center)
// ---------------------------------------------------------------------------

function buildEvidencePostsSection(scoredPosts) {
  if (!scoredPosts.length) return "";

  const cards = scoredPosts.map(({ post, score }) => {
    const text = cleanText(post.cleanedText || post.text || "", post.author || "");
    const hook = post.hookType || (window.SiftEngine ? window.SiftEngine.classifyHook(text) : "");
    return `
      <div class="save-card">
        <div class="head">
          <span>${esc((post.platform || "").toUpperCase())} · ${esc(post.author || "")}</span>
          <span>Score ${esc(String(Math.round(score)))}</span>
        </div>
        ${hook ? `<span class="hook-badge">${esc(hook)}</span>` : ""}
        <div class="txt">${esc(text.slice(0, 240))}</div>
        ${post.url ? `<a href="${esc(post.url)}" target="_blank" rel="noopener" style="font-size:12px;">Open original →</a>` : ""}
      </div>
    `;
  }).join("");

  return `
    <div class="panel" style="padding:20px;">
      <div class="section-head" style="margin-bottom:14px;"><h3>Evidence from this session</h3></div>
      <div class="saves-grid">${cards}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Right panel: voice card
// ---------------------------------------------------------------------------

function buildVoiceCard(profile, rec) {
  const confidence = rec.confidence;
  const circumference = 2 * Math.PI * 22; // r=22
  const offset = circumference - (confidence / 100) * circumference;

  const traitRows = profile.voiceTraits.map((t) => `
    <div class="trait-item">
      <div class="trait-dot"></div>
      <span class="trait-text">${esc(t)}</span>
    </div>
  `).join("") || `<div class="muted small">Run a session to detect your voice.</div>`;

  return `
    <div class="voice-card">
      <div class="voice-match-ring">
        <div class="ring-wrap">
          <svg width="56" height="56" viewBox="0 0 56 56">
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#9dc0ff"/>
                <stop offset="100%" stop-color="#b998ff"/>
              </linearGradient>
            </defs>
            <circle class="ring-bg" cx="28" cy="28" r="22" fill="none" stroke-width="4"/>
            <circle class="ring-fill" cx="28" cy="28" r="22" fill="none" stroke-width="4"
              stroke-dasharray="${circumference.toFixed(1)}"
              stroke-dashoffset="${offset.toFixed(1)}"
            />
          </svg>
          <div class="ring-label">${confidence > 0 ? esc(String(confidence)) : "—"}</div>
        </div>
        <div class="voice-match-info">
          <div class="vm-title">Creator Voice Match</div>
          <div class="vm-sub">${confidence > 0 ? "Based on this session" : "Run a session first"}</div>
        </div>
      </div>

      <div class="section-eyebrow" style="margin-bottom:8px;">Voice traits</div>
      <div class="trait-list">${traitRows}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Right panel: avoid card
// ---------------------------------------------------------------------------

function buildAvoidCard(rec) {
  const items = rec.avoid.length
    ? rec.avoid.map((a) => `
        <div class="avoid-item">
          <span class="avoid-x">✕</span>
          <span>${esc(a)}</span>
        </div>
      `).join("")
    : `<div class="muted small">No patterns to avoid detected yet.</div>`;

  return `
    <div class="avoid-card">
      <div class="section-head" style="margin-bottom:12px;"><h3>What to avoid</h3></div>
      <div class="avoid-list">${items}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Right panel: swipe preview
// ---------------------------------------------------------------------------

function buildSwipePreviewCard(saves) {
  if (!saves || !saves.length) return "";

  const items = saves.slice(0, 3).map((p) => {
    const text = cleanText(p.text || "", p.author || "");
    return `
      <div class="swipe-mini-item">
        <div class="swipe-mini-meta">${esc((p.platform || "").toUpperCase())} · ${esc(p.author || "")}</div>
        <div class="swipe-mini-text">${esc(text)}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="swipe-preview-card">
      <div class="section-head" style="margin-bottom:10px;"><h3>Swipe File</h3></div>
      <div class="swipe-mini-list">${items}</div>
      <button class="btn-ghost" style="margin-top:10px;width:100%;" onclick="document.querySelector('[data-tab=swipe]').click()">
        View all →
      </button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

function bindCopyButtons() {
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 1800);
      });
    });
  });
}

function buildDraftTemplate(rec) {
  return [
    rec.suggestedHook,
    "",
    "[Share what actually happened — the specific moment, number, or shift]",
    "",
    "[What you noticed or learned that surprised you]",
    "",
    "[One thing you'd tell yourself before this happened]"
  ].join("\n");
}

function bindDraftBuilder(rec) {
  const writeBtn = $("writePostBtn");
  const draftSection = $("draftSection");
  const draftArea = $("draftArea");
  const draftCounter = $("draftCounter");
  const copyDraftBtn = $("copyDraftBtn");

  if (writeBtn && draftSection) {
    writeBtn.addEventListener("click", () => {
      draftSection.removeAttribute("hidden");
      if (draftArea && !draftArea.value) {
        draftArea.value = buildDraftTemplate(rec);
        updateCounter();
      }
      draftSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  if (draftArea && draftCounter) {
    draftArea.addEventListener("input", updateCounter);
  }

  function updateCounter() {
    const len = draftArea?.value?.length || 0;
    if (draftCounter) draftCounter.textContent = `${len} characters`;
  }

  if (copyDraftBtn && draftArea) {
    copyDraftBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(draftArea.value).then(() => {
        copyDraftBtn.textContent = "Copied!";
        setTimeout(() => (copyDraftBtn.textContent = "Copy draft"), 1800);
      });
    });
  }

  // Tone controls
  document.querySelectorAll("[data-tone]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-tone]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (draftArea) {
        draftArea.className = `draft-area tone-${btn.dataset.tone}`;
      }
    });
  });

  // Show hooks / evidence scroll
  const showHooksBtn = $("showHooksBtn");
  if (showHooksBtn) {
    showHooksBtn.addEventListener("click", () => {
      $("hooksSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const showEvidenceBtn = $("showEvidenceBtn");
  if (showEvidenceBtn) {
    showEvidenceBtn.addEventListener("click", () => {
      $("evidenceSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function bindWritePost(rec) {
  // already handled inside bindDraftBuilder
}

// ---------------------------------------------------------------------------
// Swipe file tab
// ---------------------------------------------------------------------------

function renderSaves(list) {
  const host = $("savesList");
  const empty = $("savesEmpty");
  if (!host || !empty) return;

  empty.hidden = list.length > 0;
  host.innerHTML = "";

  list.forEach((p) => {
    const text = cleanText(p.text || "", p.author || "");
    const hook = p.hookType || (window.SiftEngine?.classifyHook(text) || "");
    const card = document.createElement("div");
    card.className = "save-card";
    card.innerHTML = `
      <div class="head">
        <span>${esc((p.platform || "unknown").toUpperCase())} · ${esc(p.author || "")}</span>
        <span>${esc(fmtTime(p.savedAt))}</span>
      </div>
      ${hook ? `<span class="hook-badge">${esc(hook)}</span>` : ""}
      <div class="txt">${esc(text.slice(0, 240))}</div>
      ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" style="font-size:12px;">Open original →</a>` : ""}
    `;
    host.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Export / Wipe
// ---------------------------------------------------------------------------

function bindButtons() {
  const exportBtn = $("exportBtn");
  const wipeBtn = $("wipeBtn");

  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      const data = await chrome.storage.local.get(null);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sift-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    });
  }

  if (wipeBtn) {
    wipeBtn.addEventListener("click", async () => {
      if (!confirm("Delete all Sift data on this device?")) return;
      await chrome.runtime.sendMessage({ type: "SIFT_WIPE_ALL" });
      await load();
    });
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function load() {
  const data = await chrome.storage.local.get(["sessions", "saves"]);
  const sessions = data.sessions || {};
  const saves = Array.isArray(data.saves) ? data.saves : [];

  const sortedSessions = Object.values(sessions).sort(
    (a, b) => (b.startedAt || 0) - (a.startedAt || 0)
  );

  renderSessions(sortedSessions, saves);
  renderSaves(saves);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    setupTabs();
    bindButtons();
    await load();
  } catch (err) {
    console.error("[Sift dashboard] init failed", err);
  }
});
