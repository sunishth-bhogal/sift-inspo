// Sift — background service worker
// Owns session lifecycle, persistence, dashboard opening, and lightweight analysis.

const DEFAULT_SETTINGS = {
  researchModeActive: false,
  sessionId: null,
  sessionStartedAt: null,
  sitesEnabled: {
    "x.com": true,
    "twitter.com": true,
    "www.linkedin.com": true,
  },
  blockedPaths: ["/messages", "/settings", "/i/keyboard_shortcuts"],
};

const MAX_SAVES = 2000;
const MAX_EVENTS_PER_SESSION = 5000;

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","if","then","than","that","this","these","those",
  "to","of","in","on","at","for","from","with","without","by","as","is","are","was","were",
  "be","been","being","it","its","you","your","yours","i","we","they","he","she","them",
  "our","us","my","me","their","his","her","about","into","over","under","again","still",
  "just","very","more","most","less","much","many","some","any","all","not","no","yes",
  "do","did","does","done","can","could","should","would","will","have","has","had","having",
  "im","ive","youre","theyre","ill","thats","heres","also","really","like","comment",
  "repost","send","follow","edited","show","post","feed"
]);

function makeSessionId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mergeSettings(base, incoming = {}) {
  return {
    ...base,
    ...incoming,
    sitesEnabled: {
      ...base.sitesEnabled,
      ...(incoming.sitesEnabled || {}),
    },
    blockedPaths: Array.isArray(incoming.blockedPaths)
      ? incoming.blockedPaths
      : base.blockedPaths,
  };
}

async function initializeStorage() {
  const settings = await getSettings();
  await chrome.storage.local.set({ settings });
}

async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  return mergeSettings(DEFAULT_SETTINGS, stored.settings || {});
}

async function setSettings(partial) {
  const current = await getSettings();
  const next = mergeSettings(current, partial);
  await chrome.storage.local.set({ settings: next });
  return next;
}

async function getSessionsMap() {
  const { sessions = {} } = await chrome.storage.local.get("sessions");
  return sessions;
}

async function setSessionsMap(sessions) {
  await chrome.storage.local.set({ sessions });
}

async function getVoiceProfile() {
  const { voiceProfile = null } = await chrome.storage.local.get("voiceProfile");
  return voiceProfile;
}

function makePostKey(post) {
  return `${post?.platform || "unknown"}:${post?.id || "unknown"}`;
}

function normalizePost(post = {}) {
  const now = Date.now();
  const text = typeof post.text === "string" ? post.text.trim() : "";
  const author = typeof post.author === "string" ? post.author.trim() : "";
  const platform = post.platform || "unknown";

  return {
    id:
      post.id ||
      `${platform}_${text.slice(0, 48).replace(/\s+/g, "_")}_${now}`,
    platform,
    text,
    author,
    url: post.url || null,
    title: post.title || null,
    metrics: post.metrics || {},
    hookType: post.hookType || null,
    topic: post.topic || null,
    dwellMs: Number(post.dwellMs || 0),
    firstSeenAt: post.firstSeenAt || now,
    lastSeenAt: post.lastSeenAt || now,
    savedAt: post.savedAt || now,
  };
}

function cleanCapturedText(text = "", author = "") {
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

  return t.replace(/\s+/g, " ").trim();
}

function classifyHookLocally(text = "") {
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

  const totalPosts = posts.length;
  const totalEvents = events.length;
  const totalDwellMs = posts.reduce((sum, post) => sum + (post.dwellMs || 0), 0);

  let commentClicks = 0;
  let profileClicks = 0;
  let linkClicks = 0;
  let saves = 0;
  let revisits = 0;

  for (const event of events) {
    if (event?.kind === "comment_click") commentClicks += 1;
    if (event?.kind === "profile_click") profileClicks += 1;
    if (event?.kind === "link_click") linkClicks += 1;
    if (event?.kind === "save_post") saves += 1;
    if (event?.kind === "post_revisit") revisits += 1;
  }

  const topPosts = [...posts]
    .sort((a, b) => (b.dwellMs || 0) - (a.dwellMs || 0))
    .slice(0, 5)
    .map((post) => ({
      id: post.id,
      platform: post.platform,
      author: post.author,
      text: cleanCapturedText(post.text || "", post.author || ""),
      url: post.url,
      hookType: post.hookType || classifyHookLocally(post.text || ""),
      dwellMs: post.dwellMs || 0,
    }));

  const patternCounts = {};
  for (const post of posts) {
    const key = post.hookType || classifyHookLocally(post.text || "");
    patternCounts[key] = (patternCounts[key] || 0) + 1;
  }

  const topPatterns = Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pattern, count]) => ({ pattern, count }));

  return {
    generatedAt: Date.now(),
    totalPosts,
    totalEvents,
    totalDwellMs,
    commentClicks,
    profileClicks,
    linkClicks,
    saves,
    revisits,
    topPatterns,
    topPosts,
  };
}

function buildVoiceStarters(mainHook, mainTopic, voiceProfile = null) {
  const profile = voiceProfile || {};
  const openers = Array.isArray(profile.openers) && profile.openers.length
    ? profile.openers
    : ["I used to think", "One thing I noticed", "What surprised me was"];

  if (mainHook === "Story") {
    return [
      `${openers[0]} ${mainTopic} only mattered in theory until I saw it up close.`,
      `${openers[1]} about ${mainTopic} changed when I actually experienced it.`,
      `${openers[2]} how much context matters when talking about ${mainTopic}.`
    ];
  }

  if (mainHook === "Listicle") {
    return [
      `3 things I learned about ${mainTopic}`,
      `3 mistakes people make around ${mainTopic}`,
      `3 signals ${mainTopic} is being explained badly`
    ];
  }

  if (mainHook === "Data-led") {
    return [
      `What the numbers around ${mainTopic} actually say`,
      `A simple result that changed how I think about ${mainTopic}`,
      `The metric people miss when talking about ${mainTopic}`
    ];
  }

  return [
    `${openers[0]} ${mainTopic} was simpler than it looked.`,
    `${openers[1]} the strongest posts about ${mainTopic} all did one thing well.`,
    `${openers[2]} ${mainTopic} keeps holding attention for the same reason.`
  ];
}

function buildVoiceAwareAnalysis(session, voiceProfile = null) {
  const posts = Array.isArray(session?.posts) ? session.posts : [];
  const events = Array.isArray(session?.events) ? session.events : [];

  const normalizedPosts = posts.map((p) => {
    const cleanedText = cleanCapturedText(p.text || "", p.author || "");
    return {
      ...p,
      cleanedText,
      hook: p.hookType || classifyHookLocally(cleanedText),
      dwellMs: p.dwellMs || 0,
      author: (p.author || "unknown").trim() || "unknown",
      platform: p.platform || "unknown",
    };
  });

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

  const commentClicks = events.filter((e) => e?.kind === "comment_click").length;
  const linkClicks = events.filter((e) => e?.kind === "link_click" || e?.kind === "profile_click").length;
  const saves = events.filter((e) => e?.kind === "save_post").length;

  const mainHook = topHooks[0]?.hook || "Statement";
  const mainTopic = topics[0]?.term || "a recurring topic";

  const likelyWhy = [];

  if (mainHook === "Story") {
    likelyWhy.push("Personal narrative plus a concrete outcome likely created credibility and curiosity.");
  } else if (mainHook === "Listicle") {
    likelyWhy.push("Structured takeaways likely worked because they promise quick value and are easy to scan.");
  } else if (mainHook === "Data-led") {
    likelyWhy.push("Specific numbers or results likely worked because they signal proof instead of vague opinion.");
  } else if (mainHook === "Contrarian") {
    likelyWhy.push("A strong opinion likely worked because it creates tension and makes people resolve the disagreement.");
  } else if (mainHook === "Question") {
    likelyWhy.push("Question-style hooks likely worked because they invite the reader to mentally answer before scrolling away.");
  } else {
    likelyWhy.push("Clear, direct statements likely worked because they were easy to process quickly while scrolling.");
  }

  if (commentClicks > 0) {
    likelyWhy.push("Comment clicks suggest at least some posts triggered deeper curiosity, not just passive attention.");
  }
  if (saves > 0) {
    likelyWhy.push("Saved posts suggest value beyond curiosity — something felt reusable or worth revisiting.");
  }
  if (linkClicks > 0) {
    likelyWhy.push("Profile or link clicks suggest some posts built enough trust or intrigue to explore further.");
  }

  return {
    generatedAt: Date.now(),
    headline: `You mainly paused for ${mainHook.toLowerCase()}-style posts, especially around ${mainTopic}.`,
    topHooks,
    topics,
    whyItLikelyWorked: likelyWhy.slice(0, 3),
    strongestPosts: strongestPosts.map((p) => ({
      id: p.id,
      author: p.author,
      platform: p.platform,
      hook: p.hook,
      dwellMs: p.dwellMs,
      cleanedText: p.cleanedText.slice(0, 280),
      url: p.url || null,
    })),
    signals: {
      commentClicks,
      linkClicks,
      saves,
    },
    inYourVoiceStarters: buildVoiceStarters(mainHook, mainTopic, voiceProfile),
    guardrails: [
      "Do not copy the original wording.",
      "Keep the structure, not the sentence.",
      "Use the hook pattern in your own tone."
    ]
  };
}

async function broadcast(msg) {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        if (!tab.id) return;
        try {
          await chrome.tabs.sendMessage(tab.id, msg);
        } catch {
          // Ignore tabs without listeners.
        }
      })
    );
  } catch {
    // Ignore broadcast failures.
  }
}

async function startResearchSession() {
  const sessionId = makeSessionId();
  const sessionStartedAt = Date.now();

  await setSettings({
    researchModeActive: true,
    sessionId,
    sessionStartedAt,
  });

  const sessions = await getSessionsMap();
  sessions[sessionId] = {
    id: sessionId,
    startedAt: sessionStartedAt,
    endedAt: null,
    events: [],
    posts: [],
    summary: null,
    analysis: null,
  };
  await setSessionsMap(sessions);

  await broadcast({
    type: "SIFT_RESEARCH_STATE",
    active: true,
    sessionId,
  });

  return { sessionId, sessionStartedAt };
}

async function stopResearchSession() {
  const settings = await getSettings();
  const sessionId = settings.sessionId;

  if (!sessionId) {
    await setSettings({
      researchModeActive: false,
      sessionId: null,
      sessionStartedAt: null,
    });
    return null;
  }

  const sessions = await getSessionsMap();
  const session = sessions[sessionId];

  if (session) {
    const voiceProfile = await getVoiceProfile();

    session.endedAt = Date.now();
    session.summary = summarizeSession(session);
    session.analysis = buildVoiceAwareAnalysis(session, voiceProfile);

    sessions[sessionId] = session;
    await setSessionsMap(sessions);
  }

  await setSettings({
    researchModeActive: false,
    sessionId: null,
    sessionStartedAt: null,
  });

  await broadcast({
    type: "SIFT_RESEARCH_STATE",
    active: false,
    sessionId: null,
  });

  return sessionId;
}

async function savePost(rawPost) {
  const post = normalizePost(rawPost);
  const { saves = [] } = await chrome.storage.local.get("saves");
  const key = makePostKey(post);

  const deduped = [post, ...saves.filter((p) => makePostKey(p) !== key)];
  await chrome.storage.local.set({ saves: deduped.slice(0, MAX_SAVES) });

  return post;
}

async function logEvent(event) {
  const settings = await getSettings();

  if (!settings.researchModeActive || !settings.sessionId) {
    return { ok: false, reason: "no-session" };
  }

  const sessions = await getSessionsMap();
  const session = sessions[settings.sessionId];

  if (!session) {
    return { ok: false, reason: "session-missing" };
  }

  const safeEvent = {
    ...event,
    ts: event?.ts || Date.now(),
  };

  session.events.push(safeEvent);

  if (session.events.length > MAX_EVENTS_PER_SESSION) {
    session.events = session.events.slice(-MAX_EVENTS_PER_SESSION);
  }

  if (safeEvent?.kind === "post_seen" && safeEvent.post) {
    const incomingPost = normalizePost({
      ...safeEvent.post,
      lastSeenAt: Date.now(),
    });

    const key = makePostKey(incomingPost);
    const existingIndex = session.posts.findIndex(
      (p) => makePostKey(p) === key
    );

    if (existingIndex === -1) {
      session.posts.push(incomingPost);
    } else {
      const existing = session.posts[existingIndex];
      session.posts[existingIndex] = {
        ...existing,
        ...incomingPost,
        dwellMs: (existing.dwellMs || 0) + (incomingPost.dwellMs || 0),
        firstSeenAt: existing.firstSeenAt || incomingPost.firstSeenAt,
        lastSeenAt: Date.now(),
      };
    }
  }

  sessions[settings.sessionId] = session;
  await setSessionsMap(sessions);

  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "SIFT_GET_STATE": {
          const settings = await getSettings();
          sendResponse({ ok: true, settings });
          break;
        }

        case "SIFT_START_SESSION": {
          const result = await startResearchSession();
          sendResponse({ ok: true, ...result });
          break;
        }

        case "SIFT_STOP_SESSION": {
          const sessionId = await stopResearchSession();
          sendResponse({ ok: true, sessionId });
          break;
        }

        case "SIFT_SAVE_POST": {
          const post = await savePost(msg.post);
          sendResponse({ ok: true, post });
          break;
        }

        case "SIFT_LOG_EVENT": {
          const result = await logEvent(msg.event);
          sendResponse(result);
          break;
        }

        case "SIFT_OPEN_DASHBOARD": {
          const url = chrome.runtime.getURL("dashboard/dashboard.html");
          await chrome.tabs.create({ url });
          sendResponse({ ok: true });
          break;
        }

        case "SIFT_TOGGLE_SITE": {
          const settings = await getSettings();
          const nextSitesEnabled = {
            ...settings.sitesEnabled,
            [msg.host]: !!msg.enabled,
          };
          await setSettings({ sitesEnabled: nextSitesEnabled });
          sendResponse({ ok: true, sitesEnabled: nextSitesEnabled });
          break;
        }

        case "SIFT_WIPE_ALL": {
          await chrome.storage.local.clear();
          await initializeStorage();
          sendResponse({ ok: true });
          break;
        }

        default: {
          sendResponse({ ok: false, reason: "unknown-type" });
        }
      }
    } catch (err) {
      sendResponse({
        ok: false,
        error: String(err?.message || err),
      });
    }
  })();

  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  await initializeStorage();
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeStorage();
});