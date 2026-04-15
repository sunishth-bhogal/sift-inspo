// Sift — background service worker
// Responsibilities:
//  - Own the Research Mode session lifecycle
//  - Broadcast session state to content scripts
//  - Open the dashboard
//  - Lightweight periodic flush

const DEFAULT_SETTINGS = {
    researchModeActive: false,
    sessionId: null,
    sessionStartedAt: null,
    // per-site toggles: users can disable capture per host
    sitesEnabled: {
      'x.com': true,
      'twitter.com': true,
      'www.linkedin.com': true
    },
    // privacy: block capture on anything listed here (user-editable later)
    blockedPaths: ['/messages', '/settings', '/i/keyboard_shortcuts']
  };
  
  async function getSettings() {
    const stored = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  }
  
  async function setSettings(partial) {
    const current = await getSettings();
    const next = { ...current, ...partial };
    await chrome.storage.local.set({ settings: next });
    return next;
  }
  
  async function startResearchSession() {
    const sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sessionStartedAt = Date.now();
    await setSettings({ researchModeActive: true, sessionId, sessionStartedAt });
  
    // Seed the session record
    const { sessions = {} } = await chrome.storage.local.get('sessions');
    sessions[sessionId] = {
      id: sessionId,
      startedAt: sessionStartedAt,
      endedAt: null,
      events: [],
      posts: []
    };
    await chrome.storage.local.set({ sessions });
  
    broadcast({ type: 'SIFT_RESEARCH_STATE', active: true, sessionId });
    return { sessionId, sessionStartedAt };
  }
  
  async function stopResearchSession() {
    const settings = await getSettings();
    const sessionId = settings.sessionId;
    if (!sessionId) {
      await setSettings({ researchModeActive: false, sessionId: null, sessionStartedAt: null });
      return null;
    }
  
    const { sessions = {} } = await chrome.storage.local.get('sessions');
    if (sessions[sessionId]) {
      sessions[sessionId].endedAt = Date.now();
      await chrome.storage.local.set({ sessions });
    }
  
    await setSettings({ researchModeActive: false, sessionId: null, sessionStartedAt: null });
    broadcast({ type: 'SIFT_RESEARCH_STATE', active: false, sessionId: null });
    return sessionId;
  }
  
  function broadcast(msg) {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (!tab.id) continue;
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    });
  }
  
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      try {
        switch (msg?.type) {
          case 'SIFT_GET_STATE': {
            const s = await getSettings();
            sendResponse({ ok: true, settings: s });
            break;
          }
          case 'SIFT_START_SESSION': {
            const r = await startResearchSession();
            sendResponse({ ok: true, ...r });
            break;
          }
          case 'SIFT_STOP_SESSION': {
            const id = await stopResearchSession();
            sendResponse({ ok: true, sessionId: id });
            break;
          }
          case 'SIFT_SAVE_POST': {
            const { post } = msg;
            const { saves = [] } = await chrome.storage.local.get('saves');
            saves.unshift(post);
            // cap at 2000 to keep storage sane
            await chrome.storage.local.set({ saves: saves.slice(0, 2000) });
            sendResponse({ ok: true });
            break;
          }
          case 'SIFT_LOG_EVENT': {
            const s = await getSettings();
            if (!s.researchModeActive || !s.sessionId) {
              sendResponse({ ok: false, reason: 'no-session' });
              return;
            }
            const { sessions = {} } = await chrome.storage.local.get('sessions');
            const session = sessions[s.sessionId];
            if (!session) {
              sendResponse({ ok: false, reason: 'session-missing' });
              return;
            }
            session.events.push(msg.event);
            // Dedup-ish post capture: key by post id+platform
            if (msg.event?.kind === 'post_seen' && msg.event.post) {
              const key = `${msg.event.post.platform}:${msg.event.post.id}`;
              const existing = session.posts.findIndex(p => `${p.platform}:${p.id}` === key);
              if (existing === -1) {
                session.posts.push(msg.event.post);
              } else {
                // merge dwell time
                const p = session.posts[existing];
                p.dwellMs = (p.dwellMs || 0) + (msg.event.post.dwellMs || 0);
                p.lastSeenAt = Date.now();
              }
            }
            sessions[s.sessionId] = session;
            await chrome.storage.local.set({ sessions });
            sendResponse({ ok: true });
            break;
          }
          case 'SIFT_OPEN_DASHBOARD': {
            const url = chrome.runtime.getURL('dashboard/dashboard.html');
            await chrome.tabs.create({ url });
            sendResponse({ ok: true });
            break;
          }
          case 'SIFT_TOGGLE_SITE': {
            const s = await getSettings();
            s.sitesEnabled[msg.host] = !!msg.enabled;
            await setSettings({ sitesEnabled: s.sitesEnabled });
            sendResponse({ ok: true, sitesEnabled: s.sitesEnabled });
            break;
          }
          case 'SIFT_WIPE_ALL': {
            await chrome.storage.local.clear();
            sendResponse({ ok: true });
            break;
          }
          default:
            sendResponse({ ok: false, reason: 'unknown-type' });
        }
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();
    return true; // async
  });
  
  chrome.runtime.onInstalled.addListener(async () => {
    await setSettings({}); // ensures defaults are written
  });