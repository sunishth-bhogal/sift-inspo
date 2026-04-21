// Sift — shared content-script runtime (cleaned MVP runtime)

(function () {
  const POST_SEEN_DWELL_MS = 700;
  const OBSERVE_EVERY_MS = 900;

  let state = {
    adapter: null,
    active: false,
    sessionId: null,
    observer: null,
    scanInterval: null,
    knownNodes: new WeakMap(),
    knownPostIds: new Set(),
    badgeEl: null,
    panelEl: null,
    sitesEnabled: {},
    blocked: false,
    debug: {
      adapter: null,
      nodesFound: 0,
      buttonsAttached: 0,
      postsTracked: 0,
      lastPostId: null,
      lastPostText: null,
    },
  };

  function hostKey() {
    const h = location.host;
    if (h === "twitter.com") return "twitter.com";
    if (h === "x.com") return "x.com";
    return h;
  }

  function pathBlocked(blockedPaths) {
    return (blockedPaths || []).some((p) => location.pathname.startsWith(p));
  }

  async function refreshState() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "SIFT_GET_STATE" });
      const s = resp?.settings || {};

      state.active = !!s.researchModeActive;
      state.sessionId = s.sessionId || null;
      state.sitesEnabled = s.sitesEnabled || {};
      state.blocked = pathBlocked(s.blockedPaths);

      renderBadge();

      if (state.active && !state.blocked && state.sitesEnabled[hostKey()] !== false) {
        startObserving();
      } else {
        flushAllVisiblePosts();
        stopObserving();
      }
    } catch (err) {
      console.error("[Sift] refreshState failed", err);
    }
  }

  function renderBadge() {
    if (!state.active) {
      if (state.badgeEl) {
        state.badgeEl.remove();
        state.badgeEl = null;
      }
      if (state.panelEl) {
        state.panelEl.remove();
        state.panelEl = null;
      }
      return;
    }

    if (!state.badgeEl) {
      const el = document.createElement("div");
      el.className = "sift-badge";
      el.innerHTML = `
        <span class="sift-dot"></span>
        Research Mode on
        <button data-sift-action="panel">What's captured</button>
        <button data-sift-action="stop">Stop</button>
      `;

      el.addEventListener("click", (e) => {
        const act = e.target?.dataset?.siftAction;
        if (act === "stop") {
          chrome.runtime.sendMessage({ type: "SIFT_STOP_SESSION" }).catch(() => {});
        }
        if (act === "panel") {
          state.panelEl?.classList.toggle("open");
          renderPanel();
        }
      });

      document.body.appendChild(el);
      state.badgeEl = el;
    }

    if (!state.panelEl) {
      const p = document.createElement("div");
      p.className = "sift-capture-panel";
      document.body.appendChild(p);
      state.panelEl = p;
    }

    renderPanel();
  }

  function renderPanel() {
    if (!state.panelEl) return;

    state.debug.buttonsAttached = document.querySelectorAll(".sift-save-btn").length;

    state.panelEl.innerHTML = `
      <h4>Captured this session</h4>
      <ul>
        <li>Visible post text + author handle</li>
        <li>Dwell time per post</li>
        <li>Clicks on comments / profile / link</li>
        <li>Post URL when available</li>
      </ul>

      <h4 style="margin-top:8px">Debug</h4>
      <ul>
        <li>adapter: ${escapeHtml(state.debug.adapter || "none")}</li>
        <li>nodes found: ${state.debug.nodesFound}</li>
        <li>buttons attached: ${state.debug.buttonsAttached}</li>
        <li>posts tracked: ${state.debug.postsTracked}</li>
        <li>last post id: ${escapeHtml(state.debug.lastPostId || "none")}</li>
        <li>last post text: ${escapeHtml((state.debug.lastPostText || "").slice(0, 80))}</li>
      </ul>
    `;
  }

  function startObserving() {
    if (state.scanInterval) return;

    state.observer = new IntersectionObserver(onIntersect, {
      threshold: [0, 0.5, 1],
    });

    state.scanInterval = setInterval(scanAndTrack, OBSERVE_EVERY_MS);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    scanAndTrack();
  }

  function stopObserving() {
    if (state.scanInterval) {
      clearInterval(state.scanInterval);
      state.scanInterval = null;
    }

    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    document.removeEventListener("click", onClickCapture, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
  }

  function scanAndTrack() {
    let nodes = [];

    if (state.adapter && typeof state.adapter.findPostNodes === "function") {
      try {
        nodes = Array.from(state.adapter.findPostNodes(document) || []);
      } catch (err) {
        console.error("[Sift] adapter findPostNodes failed", err);
        nodes = [];
      }
    }

    if ((!nodes || nodes.length === 0) && hostKey() === "www.linkedin.com") {
      nodes = fallbackLinkedInNodes(document);
    }

    nodes = pruneNestedPostNodes(nodes);

    state.debug.adapter = state.adapter?.platform || "unknown";
    state.debug.nodesFound = nodes.length;

    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (state.knownNodes.has(node)) continue;

      let post = safeExtract(node);
      if (!post || !post.id) {
        post = makeFallbackPost(node);
      }
      if (!post || !post.id) continue;

      if (state.knownPostIds.has(post.id)) {
        state.knownNodes.set(node, {
          postId: post.id,
          post,
          visibleSince: null,
          dwellMs: 0,
          sentDwellMs: 0,
        });
        continue;
      }

      state.knownPostIds.add(post.id);
      state.debug.lastPostId = post.id;
      state.debug.lastPostText = post.text || "";

      node.classList.add("sift-post-host");
      attachSaveButton(node, post);

      state.knownNodes.set(node, {
        postId: post.id,
        post,
        visibleSince: null,
        dwellMs: 0,
        sentDwellMs: 0,
      });

      if (state.observer) {
        state.observer.observe(node);
      }
    }

    state.debug.postsTracked = state.knownPostIds.size;
    renderPanel();
  }

  function countTrackedPosts() {
    return state.knownPostIds.size;
  }

  function pruneNestedPostNodes(nodes) {
    const unique = [...new Set(nodes.filter((n) => n instanceof HTMLElement))];

    unique.sort((a, b) => getNodeDepth(b) - getNodeDepth(a));

    const kept = [];
    for (const node of unique) {
      const isAncestorOfKept = kept.some((child) => node.contains(child));
      if (isAncestorOfKept) continue;
      kept.push(node);
    }

    return kept;
  }

  function getNodeDepth(node) {
    let depth = 0;
    let cur = node;
    while (cur && cur.parentElement) {
      depth += 1;
      cur = cur.parentElement;
    }
    return depth;
  }

  function fallbackLinkedInNodes(root) {
    const main =
      root.querySelector('main .scaffold-layout__main') ||
      root.querySelector("main") ||
      root.body ||
      root.documentElement;

    if (!main) return [];

    const candidates = Array.from(
      main.querySelectorAll("div, article, section")
    ).filter(isLikelyLinkedInFeedCard);

    return candidates.filter((el) => {
      return !candidates.some(
        (other) =>
          other !== el &&
          other.contains(el) &&
          (other.innerText || "").length <= (el.innerText || "").length * 2.2
      );
    });
  }

  function isLikelyLinkedInFeedCard(el) {
    if (!(el instanceof HTMLElement)) return false;

    const text = normalizeForDetection(el.innerText || "");
    if (text.length < 140 || text.length > 9000) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < 280 || rect.height < 160) return false;

    const actionHits = [" like ", " comment ", " repost ", " send "].filter((word) =>
      text.includes(word)
    ).length;

    const hasProfileLink = !!el.querySelector('a[href*="/in/"], a[href*="/company/"]');
    const hasMedia = !!el.querySelector("img, video");
    const hasAnySocialWords =
      text.includes(" like ") ||
      text.includes(" comment ") ||
      text.includes(" repost ") ||
      text.includes(" send ");

    return actionHits >= 2 || (hasAnySocialWords && hasProfileLink && hasMedia);
  }

  function normalizeForDetection(text) {
    return ` ${String(text || "").toLowerCase().replace(/\s+/g, " ").trim()} `;
  }

  function safeExtract(node) {
    try {
      return state.adapter?.extractPost?.(node) || null;
    } catch (err) {
      console.error("[Sift] extract failed", err);
      return null;
    }
  }

  function makeFallbackPost(node) {
    const rawText = String(node.innerText || "").replace(/\s+/g, " ").trim();
    if (!rawText) return null;

    const urn =
      node.getAttribute("data-urn") ||
      node.getAttribute("data-id") ||
      node.querySelector('[data-urn^="urn:li:activity:"]')?.getAttribute("data-urn") ||
      "";

    const urnId = urn.match(/urn:li:activity:(\d+)/)?.[1] || null;

    const platform = state.adapter?.platform || hostKey();
    const id = urnId
      ? `${platform}_${urnId}`
      : `${platform}_fallback_${hash(rawText.slice(0, 180))}`;

    let url = null;
    const permalink =
      node.querySelector('a[href*="/feed/update/"]') ||
      node.querySelector('a[href*="/posts/"]') ||
      node.querySelector('a[href*="/status/"]');

    if (permalink) {
      try {
        url = new URL(permalink.getAttribute("href"), location.origin).toString();
      } catch {}
    }

    return {
      platform,
      id,
      author: "unknown",
      text: rawText.slice(0, 500),
      url,
      metrics: {},
    };
  }

  function attachSaveButton(node, post) {
    if (node.querySelector(".sift-save-btn")) return;

    const btn = document.createElement("button");
    btn.className = "sift-save-btn";
    btn.type = "button";
    btn.textContent = "Save to Sift";
    btn.style.cssText = `
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(138,180,255,0.35);
      background: rgba(10,10,16,0.92);
      color: #dbe7ff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      pointer-events: auto;
    `;

    const mountTarget =
      node.querySelector(".update-components-actor") ||
      node.querySelector(".feed-shared-actor") ||
      node.querySelector(".update-components-update-v2__commentary") ||
      node;

    const wrap = document.createElement("div");
    wrap.className = "sift-save-wrap";
    wrap.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 99999;
      pointer-events: none;
    `;
    wrap.appendChild(btn);

    if (getComputedStyle(mountTarget).position === "static") {
      mountTarget.style.position = "relative";
    }

    mountTarget.appendChild(wrap);

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        const latest = safeExtract(node) || post || makeFallbackPost(node);
        if (!latest) return;

        await chrome.runtime.sendMessage({
          type: "SIFT_SAVE_POST",
          post: {
            ...latest,
            savedAt: Date.now(),
          },
        });

        if (state.active) {
          await chrome.runtime.sendMessage({
            type: "SIFT_LOG_EVENT",
            event: {
              kind: "save_post",
              ts: Date.now(),
              postId: latest.id,
              platform: latest.platform,
            },
          });
        }

        btn.textContent = "Saved";
        setTimeout(() => {
          btn.textContent = "Save to Sift";
        }, 1200);
      } catch (err) {
        console.error("[Sift] save failed", err);
      }
    });
  }

  function onIntersect(entries) {
    const now = Date.now();

    for (const entry of entries) {
      const rec = state.knownNodes.get(entry.target);
      if (!rec) continue;

      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        if (rec.visibleSince == null) rec.visibleSince = now;
      } else {
        flushVisibleRecord(rec, now);
      }
    }
  }

  function flushVisibleRecord(rec, now = Date.now()) {
    if (rec.visibleSince == null) return;

    const delta = now - rec.visibleSince;
    rec.visibleSince = null;
    rec.dwellMs += delta;

    const unsent = rec.dwellMs - rec.sentDwellMs;
    if (!state.active || unsent < POST_SEEN_DWELL_MS) return;

    rec.sentDwellMs = rec.dwellMs;

    chrome.runtime.sendMessage({
      type: "SIFT_LOG_EVENT",
      event: {
        kind: "post_seen",
        ts: now,
        post: {
          ...rec.post,
          dwellMs: unsent,
          lastSeenAt: now,
        },
      },
    }).catch(() => {});
  }

  function flushAllVisiblePosts() {
    const now = Date.now();
    document.querySelectorAll(".sift-post-host").forEach((node) => {
      const rec = state.knownNodes.get(node);
      if (rec) flushVisibleRecord(rec, now);
    });
  }

  function onVisibilityChange() {
    if (document.hidden) flushAllVisiblePosts();
  }

  function onPageHide() {
    flushAllVisiblePosts();
  }

  function onClickCapture(e) {
    if (!state.active) return;

    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest(".sift-save-btn")) return;

    let node = target;
    while (node && !state.knownNodes.has(node)) node = node.parentElement;

    const rec = node && state.knownNodes.get(node);
    if (!rec) return;

    const kind = classifyClick(target);
    if (kind === "unknown") return;

    chrome.runtime.sendMessage({
      type: "SIFT_LOG_EVENT",
      event: {
        kind,
        ts: Date.now(),
        postId: rec.postId,
        platform: rec.post?.platform,
      },
    }).catch(() => {});
  }

  function classifyClick(el) {
    const text = String(el.innerText || "").toLowerCase();

    if (/comment|repl/i.test(text)) return "comment_click";
    if (/share|repost|retweet/i.test(text)) return "link_click";

    if (
      el.closest('a[href*="/in/"], a[href*="/company/"], a[href*="/status/"], a[href*="/posts/"]')
    ) {
      return "link_click";
    }

    return "unknown";
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

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SIFT_RESEARCH_STATE") {
      refreshState();
    }
  });

  window.SiftCommon = {
    install(adapter) {
      state.adapter = adapter;
      state.debug.adapter = adapter?.platform || "none";
      refreshState();
    },
    get state() {
      return state;
    },
  };

  refreshState();
})();