console.log("SIFT DASHBOARD MAIN CREATOR MODE LOADED");

const $ = (id) => document.getElementById(id);

function fmtTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

function fmtDur(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function cleanText(text, author = "") {
  let t = String(text || "").replace(/\s+/g, " ").trim();

  t = t
    .replace(/\bFeed post\b/gi, "")
    .replace(/\bSuggested\b/gi, "")
    .replace(/\bPremium Profile\b/gi, "")
    .replace(/\bVerified Profile\b/gi, "")
    .replace(/\bReaction button state:[^A-Z]*/gi, "")
    .replace(/\bLike\s+Comment\s+Repost\s+Send\b/gi, "")
    .replace(/\bLike\s+Comment\s+Send\b/gi, "")
    .replace(/\bLike\b/gi, "")
    .replace(/\bComment\b/gi, "")
    .replace(/\bRepost\b/gi, "")
    .replace(/\bSend\b/gi, "")
    .replace(/\b\d+\s+comments?\b/gi, "")
    .replace(/\b\d+\s+reposts?\b/gi, "")
    .replace(/\b\d+\s+others?\b/gi, "")
    .replace(/\bFollow\b/gi, "")
    .replace(/\bEdited\b/gi, "");

  if (author) {
    const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`^${escaped}\\s*`, "i"), "");
  }

  return t.replace(/\s+/g, " ").trim();
}

function classifyHook(text = "") {
  const t = String(text || "").trim();
  if (!t) return "Unknown";
  if (/\?$/.test(t) || /^(why|what|how|should|can|is|are)\b/i.test(t)) return "Question";
  if (/^\d+(\+)?\s/.test(t) || /\b\d+\s+(ways|reasons|lessons|mistakes|tips)\b/i.test(t)) return "Listicle";
  if (/^(stop|start|never|always|do|build|write|learn|try)\b/i.test(t)) return "Imperative";
  if (/^(i|we)\b/i.test(t)) return "Story";
  if (/^(everyone|most people|unpopular opinion|hot take)\b/i.test(t)) return "Contrarian";
  if (/\b(test|grew|dropped|increased|decreased|%|\d+x|\d+\.\d+)\b/i.test(t)) return "Data-led";
  if (/^(how to|here's how|guide|tutorial)\b/i.test(t)) return "How-to";
  return "Statement";
}

function setupTabs() {
  const buttons = document.querySelectorAll(".tabs button");
  const tabs = document.querySelectorAll(".tab");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      tabs.forEach((tab) => {
        tab.hidden = true;
      });

      const target = document.getElementById(`tab-${btn.dataset.tab}`);
      if (target) target.hidden = false;
    });
  });
}

function normalizePostsForView(session) {
  const posts = Array.isArray(session?.posts) ? session.posts : [];
  const summary = session?.summary || {};
  const analysis = session?.analysis || {};

  const strongestPostsSource =
    Array.isArray(analysis.strongestPosts) && analysis.strongestPosts.length
      ? analysis.strongestPosts
      : Array.isArray(summary.topPosts) && summary.topPosts.length
        ? summary.topPosts
        : posts;

  return strongestPostsSource
    .map((p) => {
      const text = cleanText(p.cleanedText || p.text || "", p.author || "");
      return {
        id: p.id || "",
        platform: p.platform || "unknown",
        author: (p.author || "unknown").trim() || "unknown",
        dwellMs: p.dwellMs || 0,
        hook: p.hook || p.hookType || classifyHook(text),
        text,
        url: p.url || null,
      };
    })
    .filter((p) => p.text)
    .sort((a, b) => (b.dwellMs || 0) - (a.dwellMs || 0))
    .slice(0, 6);
}

function countMatches(texts, patterns) {
  let count = 0;
  for (const text of texts) {
    if (patterns.some((re) => re.test(text))) count += 1;
  }
  return count;
}

function inferTheme(posts) {
  const texts = posts.map((p) => p.text.toLowerCase());

  const buckets = [
    {
      label: "career milestones",
      score: countMatches(texts, [
        /\bintern(ship)?\b/,
        /\bjob\b/,
        /\boffer\b/,
        /\bjoined?\b/,
        /\bjoining\b/,
        /\brole\b/,
        /\bgraduat(ed|ing)?\b/,
        /\bfull[- ]time\b/,
        /\bcareer\b/,
        /\binterview\b/
      ]),
    },
    {
      label: "building and launching",
      score: countMatches(texts, [
        /\bbuild(ing)?\b/,
        /\blaunch(ed|ing)?\b/,
        /\bproduct\b/,
        /\bapp\b/,
        /\busers?\b/,
        /\bgrowth\b/,
        /\bship(ped|ping)?\b/,
        /\bfeature\b/,
        /\bstartup\b/
      ]),
    },
    {
      label: "lessons and reflections",
      score: countMatches(texts, [
        /\blearn(ed|ing)?\b/,
        /\brealized?\b/,
        /\bnoticed?\b/,
        /\bsurprised?\b/,
        /\bthought\b/,
        /\bmistake\b/,
        /\blesson\b/,
        /\bchanged\b/
      ]),
    },
    {
      label: "proof and results",
      score: countMatches(texts, [
        /%/,
        /\b\d+x\b/,
        /\bgrew\b/,
        /\bincreased\b/,
        /\bdropped\b/,
        /\bresult(s)?\b/,
        /\btest(s)?\b/,
        /\bmetrics?\b/
      ]),
    }
  ];

  buckets.sort((a, b) => b.score - a.score);
  return buckets[0]?.score ? buckets[0].label : "personal proof";
}

function inferVoice(posts) {
  const texts = posts.map((p) => p.text.toLowerCase());

  const firstPerson = countMatches(texts, [/\bi\b/, /\bmy\b/, /\bme\b/, /\bwe\b/, /\bour\b/]);
  const reflective = countMatches(texts, [/\bi used to think\b/, /\bnoticed\b/, /\brealized\b/, /\blearned\b/, /\bsurprised\b/]);
  const direct = countMatches(texts, [/^(stop|start|never|always|do|build|write|learn|try)\b/i]);
  const tactical = countMatches(texts, [/\bhow to\b/, /\bmistakes\b/, /\blessons\b/, /\bways\b/, /\breasons\b/, /\bguide\b/]);

  if (reflective >= direct && reflective >= tactical) {
    return "reflective, first-person";
  }
  if (tactical > reflective) {
    return "practical and takeaway-driven";
  }
  if (direct > reflective) {
    return "direct and punchy";
  }
  if (firstPerson > 0) {
    return "personal and first-person";
  }
  return "clean and direct";
}

function uniqueStrings(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function buildDirectionCards(session) {
  const posts = normalizePostsForView(session);
  const analysis = session?.analysis || {};
  const summary = session?.summary || {};

  const mainHook =
    analysis.topHooks?.[0]?.hook ||
    summary.topPatterns?.[0]?.pattern ||
    (posts[0]?.hook || "Statement");

  const theme = inferTheme(posts);
  const voice = inferVoice(posts);

  const feedWhy = [];
  if (/Story/i.test(mainHook)) {
    feedWhy.push("Your strongest posts leaned personal and outcome-based.");
  } else if (/Data-led/i.test(mainHook)) {
    feedWhy.push("You paused on posts with proof, numbers, or visible results.");
  } else if (/Listicle|How-to/i.test(mainHook)) {
    feedWhy.push("You gave attention to structured posts that promise quick value.");
  } else {
    feedWhy.push("You mainly paused on fast, easy-to-parse statements with a clear point.");
  }

  if ((analysis.signals?.saves || 0) > 0 || (summary.saves || 0) > 0) {
    feedWhy.push("Saved posts suggest you value ideas you can reuse, not just consume.");
  }
  if ((analysis.signals?.linkClicks || 0) > 0 || (summary.linkClicks || 0) > 0 || (summary.profileClicks || 0) > 0) {
    feedWhy.push("Some posts built enough trust or curiosity to make you explore further.");
  }

  const whyFeed = feedWhy.join(" ");
  const whyVoice = `This fits a ${voice} style better than generic copied hooks.`;

  return [
    {
      title: "Personal result + hidden lesson",
      whyFeed,
      whyVoice,
      starters: [
        `I used to think ${theme} was about the visible result, but what actually changed things was ___`,
        `The part people do not see about ${theme} is ___`,
        `What changed for me after ___ was not what I expected`
      ],
      guardrail: "Do not copy someone else's milestone. Use your own result, tension, or lesson."
    },
    {
      title: "Break down one thing that actually worked",
      whyFeed: `Your feed did not just reward topics. It rewarded clarity, proof, and easy-to-extract value around ${theme}.`,
      whyVoice: "This lets you sound helpful without becoming generic or overly polished.",
      starters: [
        `3 things that mattered more than I expected in ${theme}`,
        `One thing I got wrong about ${theme}`,
        `If I had to explain ${theme} simply, I would say ___`
      ],
      guardrail: "Make the takeaway come from your lived experience, not from copied advice."
    },
    {
      title: "Short belief shift / perspective post",
      whyFeed: "Attention often followed clean statements that created tension fast and resolved it quickly.",
      whyVoice: "This works well if you want to sound thoughtful, not robotic.",
      starters: [
        `I used to optimize for ___, but ___ mattered more`,
        `Most people talk about ${theme} as if ___, but what I have seen is ___`,
        `What surprised me about ${theme} is how often ___`
      ],
      guardrail: "Keep it specific. One shift, one insight, one example."
    }
  ];
}

function buildHeroSummary(session) {
  const posts = normalizePostsForView(session);
  const analysis = session?.analysis || {};
  const summary = session?.summary || {};

  const mainHook =
    analysis.topHooks?.[0]?.hook ||
    summary.topPatterns?.[0]?.pattern ||
    (posts[0]?.hook || "Statement");

  const theme = inferTheme(posts);

  let move = "write a short first-person post with one visible result and one hidden lesson";
  if (/Data-led/i.test(mainHook)) {
    move = "write a proof-backed insight post with one clear metric and one takeaway";
  } else if (/Listicle|How-to/i.test(mainHook)) {
    move = "write a practical breakdown with 2 to 3 sharp takeaways from your own experience";
  } else if (/Story/i.test(mainHook)) {
    move = "write a personal story with a concrete before-and-after shift";
  }

  return `Best next move: ${move} around ${theme}.`;
}

function getSessionView(session) {
  const posts = Array.isArray(session?.posts) ? session.posts : [];
  const events = Array.isArray(session?.events) ? session.events : [];
  const summary = session?.summary || {};
  const analysis = session?.analysis || {};
  const evidencePosts = normalizePostsForView(session);

  const totalPosts = posts.length;
  const totalEvents = events.length || summary.totalEvents || 0;
  const totalDwell =
    summary.totalDwellMs || posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0);
  const durationMs = Math.max(
    0,
    (session?.endedAt || Date.now()) - (session?.startedAt || Date.now())
  );

  const signals = analysis.signals || {
    commentClicks: summary.commentClicks || 0,
    linkClicks: (summary.linkClicks || 0) + (summary.profileClicks || 0),
    saves: summary.saves || 0,
  };

  const directions = buildDirectionCards(session);
  const hero = buildHeroSummary(session);

  const voiceNotes = uniqueStrings([
    `Your next posts should sound ${inferVoice(evidencePosts)}.`,
    "Use the hook pattern, not the exact sentence.",
    "Lead with one clear result, shift, or lesson."
  ]);

  return {
    hero,
    directions,
    voiceNotes,
    evidencePosts,
    totalPosts,
    totalEvents,
    totalDwell,
    durationMs,
    signals,
  };
}

function renderRows(items, emptyText, formatter) {
  if (!items || !items.length) {
    return `<div class="muted">${escapeHtml(emptyText)}</div>`;
  }
  return items.map(formatter).join("");
}

function renderSessions(list) {
  const host = $("sessionsList");
  const empty = $("sessionsEmpty");
  const detail = $("sessionDetail");
  if (!host || !empty || !detail) return;

  host.innerHTML = "";
  empty.hidden = list.length > 0;

  if (!list.length) {
    detail.innerHTML = `
      <h2>Session summary</h2>
      <div class="muted">Start Research Mode and scroll a little.</div>
    `;
    return;
  }

  list.forEach((session) => {
    const view = getSessionView(session);

    const card = document.createElement("div");
    card.className = "session-card";
    card.innerHTML = `
      <div>
        <div class="title">${escapeHtml(fmtTime(session.startedAt))}</div>
        <div class="sub">
          ${escapeHtml(fmtDur(view.durationMs))} ·
          ${escapeHtml(String(view.totalPosts))} posts ·
          Creator mode
        </div>
      </div>
      <div class="stat">${escapeHtml(fmtDur(view.totalDwell))} dwell</div>
    `;
    card.addEventListener("click", () => renderDetail(session));
    host.appendChild(card);
  });

  renderDetail(list[0]);
}

function renderDetail(session) {
  const detail = $("sessionDetail");
  if (!detail) return;

  const view = getSessionView(session);

  detail.innerHTML = `
    <div class="hero-card">
      <div class="hero-label">What you should post next</div>
      <h2>${escapeHtml(view.hero)}</h2>
      <div class="muted">
        Started ${escapeHtml(fmtTime(session.startedAt))} ·
        ${session.endedAt ? `ended ${escapeHtml(fmtTime(session.endedAt))}` : "still running"}
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="n">${escapeHtml(String(view.totalPosts))}</div><div class="l">posts seen</div></div>
      <div class="kpi"><div class="n">${escapeHtml(String(view.totalEvents))}</div><div class="l">events</div></div>
      <div class="kpi"><div class="n">${escapeHtml(fmtDur(view.totalDwell))}</div><div class="l">total dwell</div></div>
      <div class="kpi"><div class="n">${escapeHtml(fmtDur(view.durationMs))}</div><div class="l">session length</div></div>
    </div>

    <div class="section-title">Top content directions</div>
    <div class="draft-list">
      ${renderRows(
        view.directions,
        "No content directions yet.",
        (d) => `
          <div class="draft-card">
            <div style="font-weight:700; margin-bottom:8px;">${escapeHtml(d.title)}</div>
            <div class="muted" style="margin-bottom:10px;"><strong>Why this fits your feed:</strong> ${escapeHtml(d.whyFeed)}</div>
            <div class="muted" style="margin-bottom:10px;"><strong>Why this fits your voice:</strong> ${escapeHtml(d.whyVoice)}</div>
            <div class="section-title" style="margin-top:0;">Hook starters</div>
            <div class="stack">
              ${(d.starters || []).map((starter) => `
                <div class="pattern-row">
                  <div class="label">${escapeHtml(starter)}</div>
                </div>
              `).join("")}
            </div>
            <div class="muted" style="margin-top:10px;"><strong>Guardrail:</strong> ${escapeHtml(d.guardrail)}</div>
          </div>
        `
      )}
    </div>

    <div class="insight-grid" style="margin-top:16px;">
      <div class="mini-panel">
        <div class="section-title">Why these directions fit</div>
        <div class="signal-row"><span>Comment clicks</span><strong>${escapeHtml(String(view.signals.commentClicks || 0))}</strong></div>
        <div class="signal-row"><span>Link/profile clicks</span><strong>${escapeHtml(String(view.signals.linkClicks || 0))}</strong></div>
        <div class="signal-row"><span>Saves</span><strong>${escapeHtml(String(view.signals.saves || 0))}</strong></div>
      </div>

      <div class="mini-panel">
        <div class="section-title">Voice notes</div>
        ${renderRows(
          view.voiceNotes,
          "No voice notes yet.",
          (item) => `
            <div class="pattern-row">
              <div class="label">${escapeHtml(item)}</div>
            </div>
          `
        )}
      </div>
    </div>

    <div class="section-title">Evidence from this session</div>
    <div class="paused-list">
      ${renderRows(
        view.evidencePosts,
        "No evidence posts captured yet.",
        (p) => `
          <div class="paused-card">
            <div class="meta">
              ${escapeHtml(String(p.platform || "unknown").toUpperCase())} ·
              ${escapeHtml(p.author)} ·
              ${escapeHtml(fmtDur(p.dwellMs || 0))} ·
              ${escapeHtml(p.hook || "Unknown")}
            </div>
            <div class="txt">${escapeHtml(p.text || "(no text)")}</div>
            <div class="row">
              ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener">Open original →</a>` : ""}
            </div>
          </div>
        `
      )}
    </div>
  `;
}

function renderSaves(list) {
  const host = $("savesList");
  const empty = $("savesEmpty");
  if (!host || !empty) return;

  host.innerHTML = "";
  empty.hidden = list.length > 0;

  list.forEach((p) => {
    const cleaned = cleanText(p.text || "", p.author || "");
    const card = document.createElement("div");
    card.className = "save-card";
    card.innerHTML = `
      <div class="head">
        <span>${escapeHtml(String(p.platform || "unknown").toUpperCase())} · ${escapeHtml(p.author || "unknown")}</span>
        <span>${escapeHtml(fmtTime(p.savedAt))}</span>
      </div>
      <div class="save-hook">${escapeHtml(classifyHook(cleaned))}</div>
      <div class="txt">${escapeHtml(cleaned.slice(0, 220))}</div>
      ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener">Open original →</a>` : ""}
    `;
    host.appendChild(card);
  });
}

async function load() {
  const data = await chrome.storage.local.get(["sessions", "saves"]);
  const sessions = data.sessions || {};
  const saves = data.saves || [];

  const sortedSessions = Object.values(sessions).sort(
    (a, b) => (b.startedAt || 0) - (a.startedAt || 0)
  );

  renderSessions(sortedSessions);
  renderSaves(saves);
}

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

document.addEventListener("DOMContentLoaded", async () => {
  try {
    setupTabs();
    bindButtons();
    await load();
  } catch (err) {
    console.error("[Sift dashboard] init failed", err);
  }
});