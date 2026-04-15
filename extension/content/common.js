// Sift — shared content-script runtime (SiftCommon)
// Adapter pattern: each platform (twitter.js, linkedin.js) supplies a PlatformAdapter
// and calls SiftCommon.install(adapter).
//
// Adapter shape:
// {
//   platform: 'x' | 'linkedin',
//   findPostNodes(root) -> NodeListOf<HTMLElement>   // all visible post containers
//   extractPost(node)   -> { id, author, text, url, metrics?, media? }  // or null
// }

(function () {
    const POST_SEEN_DWELL_MS = 600;       // must be on-screen this long before we log it
    const OBSERVE_EVERY_MS = 700;         // how often we re-scan for new posts
  
    let state = {
      adapter: null,
      active: false,
      sessionId: null,
      observer: null,
      scanInterval: null,
      knownNodes: new WeakMap(), // node -> { postId, firstVisibleAt, lastVisibleAt, dwellMs, flushedAt }
      badgeEl: null,
      panelEl: null,
      sitesEnabled: {},
      blocked: false
    };
  
    function hostKey() {
      const h = location.host;
      if (h === 'twitter.com') return 'twitter.com';
      if (h === 'x.com') return 'x.com';
      return h;
    }
  
    function pathBlocked(blockedPaths) {
      return (blockedPaths || []).some(p => location.pathname.startsWith(p));
    }
  
    async function refreshState() {
      const resp = await chrome.runtime.sendMessage({ type: 'SIFT_GET_STATE' });
      const s = resp?.settings || {};
      state.active = !!s.researchModeActive;
      state.sessionId = s.sessionId || null;
      state.sitesEnabled = s.sitesEnabled || {};
      state.blocked = pathBlocked(s.blockedPaths);
      renderBadge();
      if (state.active && !state.blocked && state.sitesEnabled[hostKey()] !== false) {
        startObserving();
      } else {
        stopObserving();
      }
    }
  
    function renderBadge() {
      if (!state.active) {
        if (state.badgeEl) { state.badgeEl.remove(); state.badgeEl = null; }
        if (state.panelEl) { state.panelEl.remove(); state.panelEl = null; }
        return;
      }
      if (!state.badgeEl) {
        const el = document.createElement('div');
        el.className = 'sift-badge';
        el.innerHTML = `
          <span class="sift-dot"></span>
          Research Mode on
          <button data-sift-action="panel">What's captured</button>
          <button data-sift-action="stop">Stop</button>
        `;
        el.addEventListener('click', (e) => {
          const act = e.target?.dataset?.siftAction;
          if (act === 'stop') chrome.runtime.sendMessage({ type: 'SIFT_STOP_SESSION' });
          if (act === 'panel') {
            state.panelEl?.classList.toggle('open');
          }
        });
        document.body.appendChild(el);
        state.badgeEl = el;
      }
      if (!state.panelEl) {
        const p = document.createElement('div');
        p.className = 'sift-capture-panel';
        p.innerHTML = `
          <h4>Captured this session</h4>
          <ul>
            <li>Visible post text + author handle</li>
            <li>Dwell time per post (how long it stayed on screen)</li>
            <li>Clicks you make on posts (comments / profile / link)</li>
            <li>URL of the post (for later review)</li>
          </ul>
          <h4 style="margin-top:8px">Not captured</h4>
          <ul>
            <li>DMs, settings, or any blocked path</li>
            <li>Keystrokes outside post actions</li>
            <li>Screenshots (not in this MVP)</li>
          </ul>
        `;
        document.body.appendChild(p);
        state.panelEl = p;
      }
    }
  
    function startObserving() {
      if (state.scanInterval) return;
      // scan + attach
      state.scanInterval = setInterval(scanAndTrack, OBSERVE_EVERY_MS);
      // intersection observer for dwell
      state.observer = new IntersectionObserver(onIntersect, {
        threshold: [0, 0.5, 1]
      });
      // click capture for engagement signals
      document.addEventListener('click', onClickCapture, true);
      scanAndTrack();
    }
  
    function stopObserving() {
      if (state.scanInterval) { clearInterval(state.scanInterval); state.scanInterval = null; }
      if (state.observer) { state.observer.disconnect(); state.observer = null; }
      document.removeEventListener('click', onClickCapture, true);
    }
  
    function scanAndTrack() {
      if (!state.adapter) return;
      const nodes = state.adapter.findPostNodes(document);
      for (const node of nodes) {
        if (state.knownNodes.has(node)) continue;
        const post = safeExtract(node);
        if (!post || !post.id) continue;
        node.classList.add('sift-post-host');
        attachSaveButton(node, post);
        state.knownNodes.set(node, {
          postId: post.id,
          post,
          firstVisibleAt: null,
          lastVisibleAt: null,
          dwellMs: 0,
          flushedAt: 0
        });
        if (state.observer) state.observer.observe(node);
      }
    }
  
    function safeExtract(node) {
      try { return state.adapter.extractPost(node); } catch { return null; }
    }
  
    function attachSaveButton(node, post) {
      if (node.querySelector(':scope > .sift-save-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'sift-save-btn';
      btn.type = 'button';
      btn.textContent = 'Save to Sift';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const latest = safeExtract(node) || post;
        const enriched = {
          ...latest,
          savedAt: Date.now(),
          hook: window.SiftAnalyzer.classifyHook(latest.text || ''),
          keyTerms: window.SiftAnalyzer.keyTerms(latest.text || '', 6)
        };
        await chrome.runtime.sendMessage({ type: 'SIFT_SAVE_POST', post: enriched });
        btn.classList.add('sift-saved');
        btn.textContent = 'Saved';
        setTimeout(() => {
          btn.classList.remove('sift-saved');
          btn.textContent = 'Save to Sift';
        }, 1500);
      });
      node.appendChild(btn);
    }
  
    function onIntersect(entries) {
      const now = Date.now();
      for (const entry of entries) {
        const rec = state.knownNodes.get(entry.target);
        if (!rec) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (rec.firstVisibleAt == null) rec.firstVisibleAt = now;
          rec.lastVisibleAt = now;
        } else {
          // leaving view -> flush accumulated dwell
          if (rec.firstVisibleAt != null) {
            const delta = now - rec.firstVisibleAt;
            rec.dwellMs += delta;
            if (rec.dwellMs >= POST_SEEN_DWELL_MS && state.active) {
              logPostSeen(rec);
            }
            rec.firstVisibleAt = null;
          }
        }
      }
    }
  
    function logPostSeen(rec) {
      // avoid re-flushing every pixel scroll — only send deltas > 400ms since last flush
      const now = Date.now();
      if (now - rec.flushedAt < 400) return;
      rec.flushedAt = now;
      chrome.runtime.sendMessage({
        type: 'SIFT_LOG_EVENT',
        event: {
          kind: 'post_seen',
          at: now,
          post: {
            ...rec.post,
            dwellMs: rec.dwellMs,
            lastSeenAt: now
          }
        }
      }).catch(() => {});
    }
  
    function onClickCapture(e) {
      if (!state.active) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('.sift-save-btn')) return;
      // find nearest tracked post
      let node = target;
      while (node && !state.knownNodes.has(node)) node = node.parentElement;
      const rec = node && state.knownNodes.get(node);
      if (!rec) return;
  
      const label = classifyClick(target);
      chrome.runtime.sendMessage({
        type: 'SIFT_LOG_EVENT',
        event: {
          kind: 'post_click',
          at: Date.now(),
          click: label,
          postId: rec.postId
        }
      }).catch(() => {});
    }
  
    function classifyClick(el) {
      const text = (el.innerText || '').toLowerCase();
      if (el.closest('a[href*="/status/"]')) return 'permalink';
      if (el.closest('a[href*="/in/"], a[href*="/company/"], a[href*="x.com/"], a[href*="twitter.com/"]')) {
        if (/profile|@|^[a-z0-9_]+$/i.test(text)) return 'profile';
        return 'link';
      }
      if (/comment|repl/i.test(text)) return 'comments';
      if (/like|love|clap/i.test(text)) return 'like';
      if (/share|repost|retweet/i.test(text)) return 'share';
      return 'unknown';
    }
  
    // Listen for session state pushes from background
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'SIFT_RESEARCH_STATE') {
        state.active = !!msg.active;
        state.sessionId = msg.sessionId || null;
        refreshState();
      }
    });
  
    const SiftCommon = {
      install(adapter) {
        state.adapter = adapter;
        refreshState();
      },
      get state() { return state; }
    };
    window.SiftCommon = SiftCommon;
  })();