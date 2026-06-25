/* Sift Dashboard — V2 main controller */

const $ = (id) => document.getElementById(id);

// ─────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────

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

function fmtPct(n) {
  return n == null ? "—" : `${(n * 100).toFixed(1)}%`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function cleanText(text, author = "") {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  t = t.replace(/\bFeed post\b/gi,"").replace(/\bSuggested\b/gi,"")
       .replace(/\bPremium Profile\b/gi,"").replace(/\bLike\s+Comment\s+Repost\s+Send\b/gi,"")
       .replace(/\bLike\b/gi,"").replace(/\bComment\b/gi,"").replace(/\bRepost\b/gi,"")
       .replace(/\b\d+\s+comments?\b/gi,"").replace(/\bFollow\b/gi,"");
  if (author) t = t.replace(new RegExp(`^${author.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\s*`,"i"),"");
  return t.replace(/\s+/g," ").trim();
}

// ─────────────────────────────────────────
// State
// ─────────────────────────────────────────

const State = {
  importedPosts: [],      // LinkedInPost[]
  importedAnalyses: [],   // PostAnalysis[]
  importedPerfs: [],      // PostPerformance[]
  activeRec: null,        // ContentRecommendation
  creatorVoice: null,     // CreatorVoice
  patterns: [],           // CreatorPattern[]
  currentDraftTone: "casual"
};

// ─────────────────────────────────────────
// View / tab routing
// ─────────────────────────────────────────

function setupViews() {
  document.querySelectorAll(".top-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".top-tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
      const target = $(`view-${btn.dataset.view}`);
      if (target) target.hidden = false;
    });
  });
}

function setupSubTabs() {
  document.querySelectorAll(".sub-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sub-tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".subtab-panel").forEach((p) => (p.hidden = true));
      const target = $(`subtab-${btn.dataset.subtab}`);
      if (target) target.hidden = false;
    });
  });
}

// ─────────────────────────────────────────
// Session sidebar
// ─────────────────────────────────────────

function renderSessions(sessions) {
  const list   = $("sessionsList");
  const empty  = $("sessionsEmpty");
  const detail = $("sessionDetail");
  const splash = $("emptyState");
  if (!list) return;

  list.innerHTML = "";
  empty.hidden = sessions.length > 0;

  if (!sessions.length) return;
  splash.hidden = true;
  detail.hidden = false;

  sessions.forEach((session, idx) => {
    const posts     = Array.isArray(session.posts) ? session.posts : [];
    const totalDwell = posts.reduce((s, p) => s + (p.dwellMs || 0), 0);
    const dur       = Math.max(0, (session.endedAt || Date.now()) - (session.startedAt || 0));

    const card = document.createElement("div");
    card.className = "session-card" + (idx === 0 ? " selected" : "");
    card.innerHTML = `
      <div class="sc-date">${esc(fmtDate(session.startedAt))}</div>
      <div class="sc-meta">${esc(fmtDur(dur))} · ${esc(String(posts.length))} posts</div>
      <div class="sc-chips">
        <span class="sc-chip chip-dwell">${esc(fmtDur(totalDwell))} dwell</span>
        <span class="sc-chip chip-mode">Research</span>
      </div>`;
    card.addEventListener("click", () => {
      document.querySelectorAll(".session-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      renderCommandCenter(session);
    });
    list.appendChild(card);
  });

  renderCommandCenter(sessions[0]);
}

// ─────────────────────────────────────────
// Command center
// ─────────────────────────────────────────

function renderCommandCenter(session) {
  $("emptyState").hidden = true;
  $("sessionDetail").hidden = false;

  const engine = window.SiftEngine;
  const li     = window.SiftLinkedIn;
  if (!engine || !li) return;

  const posts  = Array.isArray(session.posts)  ? session.posts  : [];
  const events = Array.isArray(session.events) ? session.events : [];

  // Generate recommendation combining session + imported history
  let rec;
  if (State.importedPosts.length) {
    rec = li.generateRecommendationFromPatterns({
      sessionSignals:    engine.generateRecommendation(session).recommendation,
      linkedInPosts:     State.importedPosts,
      analyses:          State.importedAnalyses,
      performances:      State.importedPerfs,
      swipeFile:         window.SiftMock?.swipeFile || [],
      creatorVoice:      State.creatorVoice
    });
  } else {
    rec = engine.generateRecommendation(session).recommendation;
    // Normalise to V2 schema
    rec.signalStrength    = rec.confidence >= 70 ? "Strong" : rec.confidence >= 40 ? "Emerging" : "Low sample size";
    rec.sampleSize        = posts.length;
    rec.sampleHook        = rec.suggestedHook || rec.hookStarters?.[0] || "";
    rec.whyThisFitsYourFeed   = rec.whyFeed  || "";
    rec.whyThisFitsYourVoice  = rec.whyVoice || "";
    rec.draftPreview      = rec.draftPreview  || _buildFallbackDraft(rec);
  }

  State.activeRec = rec;

  // Score + sort top evidence posts
  const scoredPosts = posts
    .map((p) => ({ post: p, score: engine.scorePost(p, events).interestScore }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  // Voice profile
  const profile = State.creatorVoice
    || (State.importedAnalyses.length
        ? li.detectCreatorVoice(State.importedAnalyses, State.importedPerfs)
        : engine.buildCreatorProfile(posts.map((p) => engine.extractFeature(p))));
  State.creatorVoice = profile;

  renderHeroCard(rec);
  renderSubtabRecommendation(rec);
  renderSubtabEvidence(rec, scoredPosts, engine, events);
  renderSubtabHooks(rec);
  renderSubtabDraft(rec);
  renderDNAPanel(profile, rec);

  setupSubTabs();
  bindCopyButtons();
  bindDraftControls(rec);
}

// ─────────────────────────────────────────
// Hero card
// ─────────────────────────────────────────

function renderHeroCard(rec) {
  const card = $("heroCard");
  if (!card) return;

  const sigClass = rec.signalStrength === "Strong"   ? "signal-strong"
                 : rec.signalStrength === "Emerging"  ? "signal-emerging"
                 : "signal-low";
  const sigLabel = rec.signalStrength === "Low sample size"
    ? `Low sample size (${rec.sampleSize} post${rec.sampleSize === 1 ? "" : "s"})`
    : rec.signalStrength === "Emerging"
    ? `Emerging signal · ${rec.sampleSize} posts`
    : `Strong signal · ${rec.sampleSize} posts`;

  card.innerHTML = `
    <div class="hero-eyebrow">
      <span class="hero-label">Your next post</span>
      <span class="signal-chip ${sigClass}">${esc(sigLabel)}</span>
    </div>

    <div class="hero-title">${esc(rec.title)}</div>

    <div class="hero-tags">
      <span class="hero-tag"><span class="hero-tag-key">Format</span>${esc(rec.format)}</span>
      <span class="hero-tag"><span class="hero-tag-key">Topic</span>${esc(rec.topic)}</span>
      <span class="hero-tag"><span class="hero-tag-key">Angle</span>${esc(rec.angle)}</span>
    </div>

    ${rec.sampleHook ? `<div class="hero-sample">${esc(rec.sampleHook)}</div>` : ""}

    <div class="hero-why">
      <div class="hero-why-box">
        <div class="hero-why-label">Why this fits your feed</div>
        <div class="hero-why-text">${esc(rec.whyThisFitsYourFeed)}</div>
      </div>
      <div class="hero-why-box">
        <div class="hero-why-label">Why this fits your voice</div>
        <div class="hero-why-text">${esc(rec.whyThisFitsYourVoice)}</div>
      </div>
    </div>

    <div class="hero-actions">
      <button class="btn-accent" data-goto-subtab="draft" type="button">Generate draft</button>
      <button class="btn-ghost"  data-goto-subtab="hooks" type="button">Make hooks</button>
      <button class="btn-ghost"  data-goto-subtab="evidence" type="button">View evidence</button>
      <button class="btn-ghost"  id="savePatternBtn" type="button">Save pattern</button>
    </div>`;

  card.querySelectorAll("[data-goto-subtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.gotoSubtab;
      document.querySelectorAll(".sub-tabs button").forEach((b) => {
        b.classList.toggle("active", b.dataset.subtab === target);
      });
      document.querySelectorAll(".subtab-panel").forEach((p) => {
        p.hidden = p.id !== `subtab-${target}`;
      });
      $(`subtab-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  $("savePatternBtn")?.addEventListener("click", () => {
    $("savePatternBtn").textContent = "Saved ✓";
    $("savePatternBtn").classList.add("on");
  });
}

// ─────────────────────────────────────────
// Subtab: Recommendation
// ─────────────────────────────────────────

function renderSubtabRecommendation(rec) {
  const el = $("subtab-recommendation");
  if (!el) return;

  const whyPastHtml = rec.whyThisFitsYourPastPosts ? `
    <div class="why-card">
      <div class="wc-label">Why this fits your past posts</div>
      <div class="wc-text">${esc(rec.whyThisFitsYourPastPosts)}</div>
    </div>` : "";

  const avoidHtml = rec.avoid?.length ? rec.avoid.map((a) => `
    <div class="avoid-item"><span class="avoid-x">✕</span><span>${esc(a)}</span></div>`
  ).join("") : "";

  el.innerHTML = `
    <div class="rec-grid" style="padding-top:14px;">
      <div class="why-card">
        <div class="wc-label">Why this fits your feed</div>
        <div class="wc-text">${esc(rec.whyThisFitsYourFeed)}</div>
      </div>
      <div class="why-card">
        <div class="wc-label">Why this fits your voice</div>
        <div class="wc-text">${esc(rec.whyThisFitsYourVoice)}</div>
      </div>
      ${whyPastHtml}
      ${avoidHtml ? `
      <div class="content-panel" style="padding:16px;">
        <div class="section-hd"><h3>What to avoid</h3></div>
        <div class="avoid-list">${avoidHtml}</div>
      </div>` : ""}
      ${rec.guardrail ? `
      <div class="reasoning-box">⚠ Guardrail: ${esc(rec.guardrail)}</div>` : ""}
    </div>`;
}

// ─────────────────────────────────────────
// Subtab: Evidence
// ─────────────────────────────────────────

function renderSubtabEvidence(rec, scoredPosts, engine, events) {
  const el = $("subtab-evidence");
  if (!el) return;

  const evidence = rec.evidence || {};
  const maxWeight = evidence.topPatterns?.length || 1;

  const patternRows = (evidence.topPatterns || []).map((p, i) => {
    const w = Math.round(100 - i * 18);
    return `
      <div class="pattern-item">
        <span class="p-name">${esc(p)}</span>
        <div class="p-bar-wrap"><div class="p-bar" style="width:${w}%"></div></div>
        <span class="p-score">${w}%</span>
      </div>`;
  }).join("") || `<div class="muted" style="font-size:13px;">No patterns detected yet.</div>`;

  const signalRows = (evidence.strongestSignals || []).map((s) => `
    <div class="signal-row"><span class="sr-label">${esc(s)}</span></div>`
  ).join("");

  const evidencePostsHtml = scoredPosts.length ? `
    <div style="margin-top:18px;">
      <div class="section-hd"><h3>Top posts from this session</h3></div>
      <div class="evidence-post-grid">
        ${scoredPosts.map(({ post, score }) => {
          const text = cleanText(post.cleanedText || post.text || "", post.author || "");
          const hook = post.hookType || engine.classifyHook(text);
          return `
            <div class="evidence-post">
              <div class="ep-meta">
                <span>${esc((post.platform||"").toUpperCase())} · ${esc(post.author||"")}</span>
                <span class="ep-score">${Math.round(score)}</span>
              </div>
              ${hook ? `<span class="ep-badge">${esc(hook)}</span>` : ""}
              <div class="ep-text">${esc(text.slice(0,300))}</div>
              ${post.url ? `<a href="${esc(post.url)}" target="_blank" rel="noopener" style="font-size:11px;margin-top:8px;display:block;">Open →</a>` : ""}
            </div>`;
        }).join("")}
      </div>
    </div>` : "";

  el.innerHTML = `
    <div style="padding-top:14px; display:grid; gap:14px;">
      <div class="content-panel">
        <div class="section-hd"><h3>Patterns detected</h3></div>
        <div class="pattern-list">${patternRows}</div>
      </div>
      ${signalRows ? `
      <div class="content-panel">
        <div class="section-hd"><h3>Signals that influenced this</h3></div>
        <div class="signal-list">${signalRows}</div>
        ${evidence.reasoningSummary ? `<div class="reasoning-box">${esc(evidence.reasoningSummary)}</div>` : ""}
      </div>` : ""}
      ${evidencePostsHtml}
    </div>`;
}

// ─────────────────────────────────────────
// Subtab: Hooks
// ─────────────────────────────────────────

function renderSubtabHooks(rec) {
  const el = $("subtab-hooks");
  if (!el) return;

  const hooks = rec.hookStarters || [];
  const cards = hooks.map((h, i) => `
    <div class="hook-card">
      <div class="hook-text">${esc(h)}</div>
      <button class="copy-btn" data-copy="${esc(h)}" data-idx="${i}" type="button">Copy</button>
    </div>`
  ).join("") || `<div class="muted" style="font-size:13px;padding:14px 0;">No hooks generated yet.</div>`;

  el.innerHTML = `
    <div style="padding-top:14px;">
      <div class="content-panel">
        <div class="section-hd">
          <h3>Hook Starters</h3>
          <span class="eyebrow">Click to copy</span>
        </div>
        <div class="hook-grid">${cards}</div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────
// Subtab: Draft
// ─────────────────────────────────────────

function renderSubtabDraft(rec) {
  const el = $("subtab-draft");
  if (!el) return;

  const draft = rec.draftPreview || "";

  el.innerHTML = `
    <div style="padding-top:14px;">
      <div class="content-panel">
        <div class="section-hd"><h3>Draft Builder</h3></div>
        <div class="tone-bar">
          <button class="btn-ghost on" data-tone="casual" type="button">More casual</button>
          <button class="btn-ghost" data-tone="polished" type="button">More polished</button>
          <button class="btn-ghost" data-tone="concise" type="button">More concise</button>
          <button class="btn-ghost" data-tone="sharper" type="button">Sharper hook</button>
        </div>
        <textarea class="draft-area" id="draftArea" spellcheck="true">${esc(draft)}</textarea>
        <div class="draft-footer">
          <span class="draft-count" id="draftCount">${draft.length} characters</span>
          <button class="btn-ghost" id="copyDraftBtn" type="button">Copy draft</button>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────
// DNA Panel (right column)
// ─────────────────────────────────────────

function renderDNAPanel(profile, rec) {
  const panel = $("dnaPanel");
  if (!panel) return;
  panel.hidden = false;

  const confidence = rec.confidence ?? rec.sampleSize ?? 0;
  const score = typeof rec.confidence === "number" ? rec.confidence
              : rec.signalStrength === "Strong" ? 80
              : rec.signalStrength === "Emerging" ? 55 : 30;

  const circ = 2 * Math.PI * 22;
  const offset = circ - (score / 100) * circ;

  const traitRows = (profile.traits || profile.voiceTraits || []).map((t) => `
    <div class="trait-row"><div class="trait-dot"></div><span class="trait-name">${esc(t)}</span></div>`
  ).join("") || `<div class="muted" style="font-size:12px;">Run a session to detect voice.</div>`;

  const strengthRows = (profile.strengths || []).map((s) => `
    <div class="strength-item">${esc(s)}</div>`
  ).join("");

  const avoidRows = (profile.avoid || profile.avoidedStyles || rec.avoid || []).slice(0,4).map((a) => `
    <div class="avoid-item"><span class="avoid-x">✕</span><span>${esc(a)}</span></div>`
  ).join("");

  const swipeItems = (window.SiftMock?.swipeFile || []).slice(0,3).map((s) => `
    <div class="swipe-mini-card">
      <div class="swipe-mini-meta">${esc(s.topic)} · ${esc(s.hookType)}</div>
      <div class="swipe-mini-text">${esc(s.text)}</div>
    </div>`).join("");

  panel.innerHTML = `
    <!-- Voice ring -->
    <div class="dna-panel">
      <div class="voice-ring-row">
        <div class="ring-wrap">
          <svg width="54" height="54" viewBox="0 0 54 54">
            <defs>
              <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#8ba8ff"/>
                <stop offset="100%" stop-color="#b59cff"/>
              </linearGradient>
            </defs>
            <circle class="ring-bg" cx="27" cy="27" r="22" fill="none" stroke-width="4"/>
            <circle class="ring-fill" cx="27" cy="27" r="22" fill="none" stroke-width="4"
              stroke-dasharray="${circ.toFixed(1)}"
              stroke-dashoffset="${offset.toFixed(1)}"/>
          </svg>
          <div class="ring-num">${score > 0 ? score : "—"}</div>
        </div>
        <div class="voice-ring-info">
          <div class="vri-title">Creator DNA</div>
          <div class="vri-sub">${esc(rec.signalStrength || "Detecting…")}</div>
        </div>
      </div>
      <div class="eyebrow" style="margin-bottom:8px;">Voice traits</div>
      <div class="trait-grid">${traitRows}</div>
    </div>

    <!-- Writing strengths -->
    ${strengthRows ? `
    <div class="dna-panel">
      <div class="eyebrow" style="margin-bottom:10px;">Writing strengths</div>
      <div class="strength-list">${strengthRows}</div>
    </div>` : ""}

    <!-- Avoid -->
    ${avoidRows ? `
    <div class="dna-panel">
      <div class="eyebrow" style="margin-bottom:10px;">What to avoid</div>
      <div class="avoid-list">${avoidRows}</div>
    </div>` : ""}

    <!-- Swipe preview -->
    ${swipeItems ? `
    <div class="dna-panel">
      <div class="section-hd" style="margin-bottom:10px;">
        <h3 style="font-size:13px;">Swipe File</h3>
        <button class="btn-ghost" style="font-size:11px;padding:4px 9px;"
          onclick="document.querySelector('[data-view=research]').click()">View all</button>
      </div>
      <div class="swipe-mini">${swipeItems}</div>
    </div>` : ""}`;
}

// ─────────────────────────────────────────
// Interactions
// ─────────────────────────────────────────

function bindCopyButtons() {
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const text = btn.dataset.copy;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        btn.classList.add("done");
        setTimeout(() => { btn.textContent = orig; btn.classList.remove("done"); }, 1800);
      });
    });
    // Also copy on card click
    btn.closest?.(".hook-card")?.addEventListener("click", (e) => {
      if (e.target.classList.contains("copy-btn")) return;
      btn.click();
    });
  });
}

function bindDraftControls(rec) {
  const area  = $("draftArea");
  const count = $("draftCount");
  const copy  = $("copyDraftBtn");

  if (area && count) {
    area.addEventListener("input", () => { count.textContent = `${area.value.length} characters`; });
  }

  if (copy && area) {
    copy.addEventListener("click", () => {
      navigator.clipboard.writeText(area.value).then(() => {
        copy.textContent = "Copied!";
        setTimeout(() => (copy.textContent = "Copy draft"), 1800);
      });
    });
  }

  document.querySelectorAll("[data-tone]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-tone]").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      State.currentDraftTone = btn.dataset.tone;
      if (area && rec) {
        area.value = _toneVariant(rec.draftPreview || "", btn.dataset.tone);
        if (count) count.textContent = `${area.value.length} characters`;
      }
    });
  });
}

function _toneVariant(draft, tone) {
  if (!draft) return "";
  if (tone === "concise") {
    return draft.split("\n\n").slice(0, 3).join("\n\n");
  }
  if (tone === "polished") {
    return draft.replace(/\[/g, "").replace(/\]/g, "").replace(/\bI\b/g, "I");
  }
  if (tone === "sharper") {
    const lines = draft.split("\n");
    const firstLine = lines[0];
    return [firstLine, "", ...lines.slice(1)].join("\n");
  }
  return draft;
}

function _buildFallbackDraft(rec) {
  return [
    rec.sampleHook || rec.suggestedHook || "",
    "",
    "[Your specific moment — one detail that makes the outcome real]",
    "",
    "[What you noticed that changed how you think about this]",
    "",
    "[One sentence — what this means for how you work now]"
  ].join("\n");
}

// ─────────────────────────────────────────
// LinkedIn Import view
// ─────────────────────────────────────────

function setupLinkedInImport() {
  // Method card switching (UI only for CSV/URL for MVP)
  document.querySelectorAll(".import-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".import-card").forEach((c) => c.classList.remove("active-card"));
      card.classList.add("active-card");
    });
  });

  // Submit paste form
  $("importSubmitBtn")?.addEventListener("click", () => {
    const text = $("importPostText")?.value?.trim();
    if (!text) return;

    const post = {
      id: `li_${Date.now()}`,
      text,
      date: $("importDate")?.value || new Date().toISOString().slice(0,10),
      impressions: parseInt($("importImpressions")?.value) || undefined,
      reactions:   parseInt($("importReactions")?.value)  || undefined,
      comments:    parseInt($("importComments")?.value)   || undefined,
      reposts:     parseInt($("importReposts")?.value)    || undefined,
      newFollowers:parseInt($("importFollowers")?.value)  || undefined
    };

    importPost(post);
    clearImportForm();
  });

  // Load mock data
  $("loadMockBtn")?.addEventListener("click", () => {
    const mock = window.SiftMock;
    if (!mock) return;
    State.importedPosts    = [...mock.linkedInPosts];
    State.importedAnalyses = [...mock.postAnalyses];
    State.importedPerfs    = [...mock.performances];
    State.creatorVoice     = mock.creatorVoice;
    State.patterns         = mock.patterns;
    renderImportedSection();
  });

  // Generate recommendation from history
  $("generateFromHistoryBtn")?.addEventListener("click", () => {
    const li = window.SiftLinkedIn;
    if (!li) return;
    const rec = li.generateRecommendationFromPatterns({
      linkedInPosts: State.importedPosts,
      analyses:      State.importedAnalyses,
      performances:  State.importedPerfs,
      swipeFile:     window.SiftMock?.swipeFile || [],
      creatorVoice:  State.creatorVoice
    });
    State.activeRec = rec;
    renderHistoryCommandCenter(rec);
    // Switch to sessions view to show result
    document.querySelector("[data-view=sessions]")?.click();
  });
}

function importPost(post) {
  const li = window.SiftLinkedIn;
  if (!li) return;
  const analysis = li.analyzePost(post);
  const perf     = li.calculatePostPerformanceScore(post);
  State.importedPosts.push(post);
  State.importedAnalyses.push(analysis);
  State.importedPerfs.push(perf);

  // Refresh patterns + voice
  if (State.importedPosts.length >= 2) {
    State.patterns     = li.analyzeWinningPatterns(State.importedPosts, State.importedPerfs, State.importedAnalyses);
    State.creatorVoice = li.detectCreatorVoice(State.importedAnalyses, State.importedPerfs);
  }

  renderImportedSection();
}

function renderImportedSection() {
  const section = $("importedSection");
  if (section) section.hidden = false;

  // Render post list
  const list = $("importedList");
  if (list) {
    list.innerHTML = State.importedPosts.map((post, i) => {
      const perf     = State.importedPerfs[i];
      const analysis = State.importedAnalyses[i];
      const score    = perf?.performanceScore ?? 0;
      const scoreClass = score >= 70 ? "score-high" : score >= 45 ? "score-mid" : "score-low";
      const scoreLabel = score >= 70 ? `Top performer (${score})` : score >= 45 ? `Solid (${score})` : `Learning (${score})`;

      const metrics = [
        post.impressions != null ? `<div class="ic-metric"><span>${post.impressions.toLocaleString()}</span>impr.</div>` : "",
        post.reactions   != null ? `<div class="ic-metric"><span>${post.reactions}</span>react.</div>` : "",
        post.comments    != null ? `<div class="ic-metric"><span>${post.comments}</span>comments</div>` : "",
        post.reposts     != null ? `<div class="ic-metric"><span>${post.reposts}</span>reposts</div>` : "",
        perf             != null ? `<div class="ic-metric"><span>${fmtPct(perf.engagementRate)}</span>eng. rate</div>` : ""
      ].filter(Boolean).join("");

      const tags = [analysis?.hookType, analysis?.tone, analysis?.topic]
        .filter(Boolean).map((t) => `<span class="ic-tag">${esc(t)}</span>`).join("");

      return `
        <div class="imported-card">
          <div class="ic-header">
            <div class="ic-date">${esc(post.date)}</div>
            ${score > 0 ? `<span class="ic-score ${scoreClass}">${esc(scoreLabel)}</span>` : ""}
          </div>
          <div class="ic-text">${esc(post.text)}</div>
          ${metrics ? `<div class="ic-metrics">${metrics}</div>` : ""}
          ${tags    ? `<div class="ic-tags">${tags}</div>`       : ""}
        </div>`;
    }).join("");
  }

  // Render patterns
  const patternEl = $("patternsList");
  if (patternEl) {
    patternEl.innerHTML = State.patterns.map((p) => `
      <div class="pattern-card">
        <div class="pc-name">${esc(p.name)}</div>
        <div class="pc-desc">${esc(p.description)}</div>
        <div class="pc-bar-wrap"><div class="pc-bar" style="width:${p.strength}%"></div></div>
        <div class="pc-strength">Strength: <span>${p.strength}%</span></div>
      </div>`
    ).join("") || `<div class="muted" style="font-size:13px;">Import more posts to detect patterns.</div>`;
  }

  // Render voice traits
  const voiceEl = $("voiceFromHistory");
  if (voiceEl && State.creatorVoice) {
    voiceEl.innerHTML = (State.creatorVoice.traits || []).map((t) => `
      <div class="vh-trait"><div class="vh-dot"></div><span class="vh-text">${esc(t)}</span></div>`
    ).join("");
  }
}

function renderHistoryCommandCenter(rec) {
  // Show session detail area with history-based recommendation
  $("emptyState").hidden = true;
  $("sessionDetail").hidden = false;

  State.activeRec = rec;

  renderHeroCard(rec);
  renderSubtabRecommendation(rec);

  const evidenceEl = $("subtab-evidence");
  if (evidenceEl) {
    const evidence = rec.evidence || {};
    const signalRows = (evidence.strongestSignals || []).map((s) => `
      <div class="signal-row"><span class="sr-label">${esc(s)}</span></div>`).join("");
    evidenceEl.innerHTML = `
      <div style="padding-top:14px; display:grid; gap:14px;">
        <div class="content-panel">
          <div class="section-hd"><h3>Signals from your history</h3></div>
          <div class="signal-list">${signalRows}</div>
          ${evidence.reasoningSummary ? `<div class="reasoning-box">${esc(evidence.reasoningSummary)}</div>` : ""}
        </div>
      </div>`;
  }

  renderSubtabHooks(rec);
  renderSubtabDraft(rec);
  renderDNAPanel(State.creatorVoice || { traits: [], strengths: [], avoid: [] }, rec);

  setupSubTabs();
  bindCopyButtons();
  bindDraftControls(rec);
}

function clearImportForm() {
  ["importPostText","importDate","importImpressions","importReactions",
   "importComments","importReposts","importFollowers"].forEach((id) => {
    const el = $(id);
    if (el) el.value = "";
  });
}

// ─────────────────────────────────────────
// Research / Swipe File view
// ─────────────────────────────────────────

function renderResearchView() {
  const list = $("swipeList");
  if (!list) return;

  const entries = window.SiftMock?.swipeFile || [];
  list.innerHTML = entries.map((s) => `
    <div class="swipe-card">
      <div class="swipe-header">
        <span class="swipe-author">${esc(s.source.toUpperCase())} · ${esc(s.author || "Anonymous")}</span>
        <span class="swipe-hook-badge">${esc(s.hookType)}</span>
      </div>
      <div class="swipe-text">${esc(s.text)}</div>
      <div class="swipe-analysis">
        <div class="swipe-analysis-row">
          <span class="swipe-analysis-label">Topic</span>
          <span class="swipe-analysis-val">${esc(s.topic)}</span>
        </div>
        <div class="swipe-analysis-row">
          <span class="swipe-analysis-label">Format</span>
          <span class="swipe-analysis-val">${esc(s.format)}</span>
        </div>
        <div class="swipe-analysis-row">
          <span class="swipe-analysis-label">Why it worked</span>
          <span class="swipe-analysis-val">${esc(s.whyItWorked)}</span>
        </div>
      </div>
      <div class="swipe-pattern">
        <strong>Reusable pattern:</strong> ${esc(s.reusablePattern)}
      </div>
    </div>`
  ).join("") || `<div class="muted">No swipe file entries yet.</div>`;
}

// ─────────────────────────────────────────
// Export / Wipe
// ─────────────────────────────────────────

function bindButtons() {
  $("exportBtn")?.addEventListener("click", async () => {
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify({ ...data, importedPosts: State.importedPosts }, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `sift-export-${new Date().toISOString().slice(0,10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });

  $("wipeBtn")?.addEventListener("click", async () => {
    if (!confirm("Delete all Sift data on this device?")) return;
    await chrome.runtime.sendMessage({ type: "SIFT_WIPE_ALL" });
    State.importedPosts    = [];
    State.importedAnalyses = [];
    State.importedPerfs    = [];
    State.activeRec        = null;
    State.creatorVoice     = null;
    State.patterns         = [];
    await load();
  });
}

// ─────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────

async function load() {
  const data     = await chrome.storage.local.get(["sessions", "saves"]);
  const sessions = Object.values(data.sessions || {}).sort((a, b) => (b.startedAt||0) - (a.startedAt||0));
  renderSessions(sessions);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    setupViews();
    setupLinkedInImport();
    renderResearchView();
    bindButtons();
    await load();
  } catch (err) {
    console.error("[Sift] init failed", err);
  }
});
