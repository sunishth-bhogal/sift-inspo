console.log("SIFT DASHBOARD MAIN V2 LOADED");

const $ = (id) => document.getElementById(id);

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","if","then","than","that","this","these","those",
  "to","of","in","on","at","for","from","with","without","by","as","is","are","was","were",
  "be","been","being","it","its","you","your","yours","i","we","they","he","she","them",
  "our","us","my","me","their","his","her","about","into","over","under","again","still",
  "just","very","more","most","less","much","many","some","any","all","not","no","yes",
  "do","did","does","done","can","could","should","would","will","have","has","had","having",
  "im","ive","youre","theyre","ill","thats","heres","also","really","like","comment","repost",
  "send","follow","edited","show","post","feed"
]);

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
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

function setupTabs() {
  const buttons = document.querySelectorAll(".tabs button");
  const tabs = document.querySelectorAll(".tab");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      tabs.forEach((t) => (t.hidden = true));
      const target = $(`tab-${btn.dataset.tab}`);
      if (target) target.hidden = false;
    });
  });
}

function cleanCapturedText(text, author = "") {
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
    .replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\s+likes this\b/g, "")
    .replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\s+loves this\b/g, "")
    .replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\s+commented on this\b/g, "")
    .replace(/\bFollow\b/gi, "")
    .replace(/\bEdited\b/gi, "");

  if (author) {
    const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`^${escaped}\\s*`, "i"), "");
  }

  t = t.replace(/\s+/g, " ").trim();
  return t;
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

function extractKeyTerms(posts, limit = 5) {
  const counts = new Map();

  for (const post of posts) {
    const words = String(post.cleanedText || "")
      .toLowerCase()
      .match(/[a-z][a-z0-9-]{2,}/g) || [];

    for (const word of words) {
      if (STOP_WORDS.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

function summarizeSession(session) {
  const posts = Array.isArray(session?.posts) ? session.posts : [];
  const events = Array.isArray(session?.events) ? session.events : [];
  const startedAt = session?.startedAt || Date.now();
  const endedAt = session?.endedAt || Date.now();

  const normalizedPosts = posts.map((p) => {
    const cleanedText = cleanCapturedText(p.text || "", p.author || "");
    return {
      ...p,
      author: (p.author || "unknown").trim() || "unknown",
      cleanedText,
      dwellMs: p.dwellMs || 0,
      hook: classifyHook(cleanedText),
      platform: p.platform || "unknown",
    };
  });

  const totalDwell = normalizedPosts.reduce((sum, p) => sum + p.dwellMs, 0);

  const strongestPosts = [...normalizedPosts]
    .sort((a, b) => (b.dwellMs || 0) - (a.dwellMs || 0))
    .slice(0, 5);

  const hookCounts = new Map();
  for (const post of normalizedPosts) {
    hookCounts.set(post.hook, (hookCounts.get(post.hook) || 0) + 1);
  }

  const topHooks = [...hookCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hook, count]) => ({ hook, count }));

  const topics = extractKeyTerms(normalizedPosts, 5);

  const commentClicks = events.filter((e) => e.kind === "comment_click").length;
  const linkClicks = events.filter((e) => e.kind === "link_click").length;
  const saves = events.filter((e) => e.kind === "save_post").length;

  const mainHook = topHooks[0]?.hook || "Statement";
  const mainTopic = topics[0]?.term || "general creator content";

  const insight = normalizedPosts.length
    ? `You mainly paused for ${mainHook.toLowerCase()}-style posts, and your feed leaned toward ${mainTopic}.`
    : "Not enough data yet to infer a clear attention pattern.";

  const draftIdeas = [
    `Try: ${mainHook === "Listicle" ? "3 things I learned about" : "My take on"} ${mainTopic}`,
    `Try: What most people get wrong about ${mainTopic}`,
    `Try: A short post on why ${mainTopic} keeps grabbing attention`
  ];

  return {
    posts: normalizedPosts,
    strongestPosts,
    topHooks,
    topics,
    commentClicks,
    linkClicks,
    saves,
    totalDwell,
    durationMs: Math.max(0, endedAt - startedAt),
    insight,
    draftIdeas,
  };
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
      <div class="muted">No sessions yet.</div>
    `;
    return;
  }

  for (const s of list) {
    const summary = summarizeSession(s);

    const card = document.createElement("div");
    card.className = "session-card";
    card.innerHTML = `
      <div>
        <div class="title">${fmtTime(s.startedAt)} ${s.endedAt ? "" : '<span class="live-chip">(live)</span>'}</div>
        <div class="sub">
          ${fmtDur(summary.durationMs)} ·
          ${summary.posts.length} posts ·
          ${summary.topHooks[0] ? summary.topHooks[0].hook : "No pattern yet"}
        </div>
      </div>
      <div class="stat">${fmtDur(summary.totalDwell)} dwell</div>
    `;
    card.addEventListener("click", () => renderDetail(s));
    host.appendChild(card);
  }

  renderDetail(list[0]);
}

function renderDetail(session) {
  const detail = $("sessionDetail");
  if (!detail) return;

  if (!session) {
    detail.innerHTML = "";
    return;
  }

  const summary = summarizeSession(session);

  detail.innerHTML = `
    <div class="hero-card">
      <div class="hero-label">Session summary</div>
      <h2>${escapeHtml(summary.insight)}</h2>
      <div class="muted">
        Started ${fmtTime(session.startedAt)} ·
        ${session.endedAt ? `ended ${fmtTime(session.endedAt)}` : "still running"}
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="n">${summary.posts.length}</div><div class="l">posts seen</div></div>
      <div class="kpi"><div class="n">${session.events?.length || 0}</div><div class="l">events</div></div>
      <div class="kpi"><div class="n">${fmtDur(summary.totalDwell)}</div><div class="l">total dwell</div></div>
      <div class="kpi"><div class="n">${fmtDur(summary.durationMs)}</div><div class="l">session length</div></div>
    </div>

    <div class="insight-grid">
      <div class="mini-panel">
        <div class="section-title">What caught your attention</div>
        ${
          summary.topHooks.length
            ? summary.topHooks.map((item) => `
                <div class="pattern-row">
                  <div class="label">${escapeHtml(item.hook)}</div>
                  <div class="count">${item.count} posts</div>
                </div>
              `).join("")
            : '<div class="muted">No clear hook pattern yet.</div>'
        }
      </div>

      <div class="mini-panel">
        <div class="section-title">Topics that kept recurring</div>
        ${
          summary.topics.length
            ? summary.topics.map((item) => `
                <div class="pattern-row">
                  <div class="label">${escapeHtml(item.term)}</div>
                  <div class="count">${item.count} hits</div>
                </div>
              `).join("")
            : '<div class="muted">No recurring topics yet.</div>'
        }
      </div>

      <div class="mini-panel">
        <div class="section-title">Session signals</div>
        <div class="signal-row"><span>Comment clicks</span><strong>${summary.commentClicks}</strong></div>
        <div class="signal-row"><span>Link/profile clicks</span><strong>${summary.linkClicks}</strong></div>
        <div class="signal-row"><span>Saves</span><strong>${summary.saves}</strong></div>
      </div>
    </div>

    <div class="section-title">Best captured posts</div>
    <div class="paused-list">
      ${
        summary.strongestPosts.length
          ? summary.strongestPosts.map((p) => `
              <div class="paused-card">
                <div class="meta">${String(p.platform || "unknown").toUpperCase()} · ${escapeHtml(p.author || "unknown")} · ${fmtDur(p.dwellMs || 0)} · ${escapeHtml(p.hook)}</div>
                <div class="txt">${escapeHtml((p.cleanedText || "(no text)").slice(0, 280))}</div>
                <div class="row">
                  ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener">Open original →</a>` : ""}
                </div>
              </div>
            `).join("")
          : '<div class="muted">No posts captured yet.</div>'
      }
    </div>

    <div class="section-title">Draft angles from this session</div>
    <div class="draft-list">
      ${summary.draftIdeas.map((idea) => `
        <div class="draft-card">${escapeHtml(idea)}</div>
      `).join("")}
    </div>
  `;
}

function renderSaves(list) {
  const host = $("savesList");
  const empty = $("savesEmpty");
  if (!host || !empty) return;

  host.innerHTML = "";
  empty.hidden = list.length > 0;

  for (const p of list) {
    const cleanedText = cleanCapturedText(p.text || "", p.author || "");
    const card = document.createElement("div");
    card.className = "save-card";
    card.innerHTML = `
      <div class="head">
        <span>${String(p.platform || "unknown").toUpperCase()} · ${escapeHtml(p.author || "unknown")}</span>
        <span>${fmtTime(p.savedAt)}</span>
      </div>
      <div class="save-hook">${escapeHtml(classifyHook(cleanedText))}</div>
      <div class="txt">${escapeHtml(cleanedText.slice(0, 220))}</div>
      ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener">Open original →</a>` : ""}
    `;
    host.appendChild(card);
  }
}

async function load() {
  const { sessions = {}, saves = [] } = await chrome.storage.local.get(["sessions", "saves"]);
  const sortedSessions = Object.values(sessions).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
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
  setupTabs();
  bindButtons();
  await load();
});

chrome.storage.onChanged.addListener(() => {
  load().catch(console.error);
});