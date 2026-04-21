// Sift — background service worker
// Owns session lifecycle, persistence, dashboard opening, and lightweight summaries.

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

function summarizeSession(session) {
  const posts = Array.isArray(session.posts) ? session.posts : [];
  const events = Array.isArray(session.events) ? session.events : [];

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
      text: post.text,
      url: post.url,
      hookType: post.hookType || null,
      dwellMs: post.dwellMs || 0,
    }));

  const patternCounts = {};
  for (const post of posts) {
    const key = post.hookType || "unknown";
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
    session.endedAt = Date.now();
    session.summary = summarizeSession(session);
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