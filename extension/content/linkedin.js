// Sift — LinkedIn adapter (cleaned capture pass)
(function () {
  function getFeedRoot(root) {
    return (
      root.querySelector('main [data-view-name="feed-main-feed"]') ||
      root.querySelector('main .scaffold-layout__main') ||
      root.querySelector("main") ||
      root.body ||
      root.documentElement ||
      root
    );
  }

  function findPostNodes(root) {
    const feedRoot = getFeedRoot(root);
    const seen = new Set();
    const results = [];

    function add(el) {
      if (!el || !(el instanceof HTMLElement)) return;
      if (seen.has(el)) return;
      if (!isLikelyFeedPost(el)) return;

      seen.add(el);
      results.push(el);
    }

    feedRoot.querySelectorAll(
      [
        'div.feed-shared-update-v2',
        'div.occludable-update',
        'div[data-urn^="urn:li:activity:"]',
        'div[data-id^="urn:li:activity:"]',
        'article[data-urn^="urn:li:activity:"]',
        'article[data-id^="urn:li:activity:"]',
        'div.update-components-update-v2',
        'div.fie-impression-container'
      ].join(", ")
    ).forEach(add);

    return results;
  }

  function isLikelyFeedPost(el) {
    if (!(el instanceof HTMLElement)) return false;

    const text = normalize(el.innerText || "");
    if (text.length < 120 || text.length > 8000) return false;

    if (
      el.closest("header, nav, footer, aside") ||
      el.matches("header, nav, footer, aside")
    ) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < 280 || rect.height < 180) return false;

    const lower = ` ${text.toLowerCase()} `;
    const actionHits = [" like ", " comment ", " repost ", " send "].filter((w) =>
      lower.includes(w)
    ).length;

    const hasAuthor =
      !!el.querySelector('a[href*="/in/"]') ||
      !!el.querySelector('a[href*="/company/"]') ||
      !!el.querySelector(".update-components-actor__title") ||
      !!el.querySelector(".feed-shared-actor__name");

    return actionHits >= 2 && hasAuthor;
  }

  function extractPost(node) {
    if (!(node instanceof HTMLElement)) return null;

    const urn =
      node.getAttribute("data-urn") ||
      node.getAttribute("data-id") ||
      node.querySelector('[data-urn^="urn:li:activity:"]')?.getAttribute("data-urn") ||
      node.querySelector('[data-id^="urn:li:activity:"]')?.getAttribute("data-id") ||
      "";

    const urnId = urn.match(/urn:li:activity:(\d+)/)?.[1] || null;

    const author =
      firstText(node, [
        '.update-components-actor__title span[aria-hidden="true"]',
        '.update-components-actor__title',
        '.feed-shared-actor__name',
        '.feed-shared-actor__title',
        'a[href*="/in/"] span[aria-hidden="true"]',
        'a[href*="/company/"] span[aria-hidden="true"]'
      ]) || fallbackAuthor(node);

    const rawText =
      firstText(node, [
        '.update-components-text',
        '.feed-shared-text',
        '.feed-shared-inline-show-more-text',
        '.feed-shared-update-v2__commentary',
        '.break-words',
        '[data-test-id="main-feed-activity-card__commentary"]',
        'span.break-words'
      ]) || fallbackPostText(node);

    const text = cleanupLinkedInText(rawText, author);

    const url =
      absoluteUrl(
        node.querySelector('a[href*="/feed/update/"]')?.getAttribute("href") ||
        node.querySelector('a[href*="/posts/"]')?.getAttribute("href")
      ) ||
      (urnId
        ? `https://www.linkedin.com/feed/update/urn:li:activity:${urnId}/`
        : null);

    const metrics = extractMetrics(node);

    const id = urnId
      ? `li_${urnId}`
      : `li_fallback_${hash([author, text.slice(0, 200), url || ""].join("|"))}`;

    if (!text && !author) return null;

    return {
      platform: "linkedin",
      id,
      author: normalize(author) || "unknown",
      text: text.slice(0, 700),
      url,
      metrics
    };
  }

  function fallbackAuthor(node) {
    const candidates = [
      ...node.querySelectorAll('a[href*="/in/"]'),
      ...node.querySelectorAll('a[href*="/company/"]')
    ];

    for (const el of candidates) {
      const txt = normalize(el.innerText || "");
      if (!txt) continue;

      const cleaned = txt
        .split("·")[0]
        .replace(/Premium Profile/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      if (cleaned && cleaned.length < 80) return cleaned;
    }

    return "unknown";
  }

  function fallbackPostText(node) {
    const clone = node.cloneNode(true);

    clone.querySelectorAll("button, nav, footer, aside, svg").forEach((el) => el.remove());

    const txt = normalize(clone.innerText || "");
    return cleanupLinkedInText(txt);
  }

  function cleanupLinkedInText(text, author = "") {
    let t = normalize(text || "");

    t = t
      .replace(/\bFeed post\b/gi, "")
      .replace(/\bSuggested\b/gi, "")
      .replace(/\bPremium Profile\b/gi, "")
      .replace(/\bReaction button state:[^A-Z]*/gi, "")
      .replace(/\bLike\s+Comment\s+Repost\s+Send\b/gi, "")
      .replace(/\bLike\s+Comment\s+Send\b/gi, "")
      .replace(/\b\d+\s+comments?\b/gi, "")
      .replace(/\b\d+\s+reposts?\b/gi, "")
      .replace(/\b\d+\s+others?\b/gi, "")
      .replace(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+likes this\b/gi, "")
      .replace(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+loves this\b/gi, "")
      .replace(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+commented on this\b/gi, "")
      .replace(/\bFollow\b/gi, "")
      .replace(/\bEdited\b/gi, "")
      .replace(/\bPromoted\b/gi, "");

    if (author) {
      const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      t = t.replace(new RegExp(`^${escaped}\\s*`, "i"), "");
    }

    t = t
      .replace(/\s*·\s*/g, " · ")
      .replace(/\s+/g, " ")
      .trim();

    return t;
  }

  function extractMetrics(node) {
    const metrics = {};

    const reactions = firstText(node, [
      '.social-details-social-counts__reactions-count',
      '[aria-label*="reaction" i]'
    ]);
    const comments = firstText(node, [
      'li.social-details-social-counts__comments',
      '[aria-label*="comment" i]'
    ]);
    const reposts = firstText(node, [
      '[aria-label*="repost" i]',
      '[aria-label*="share" i]'
    ]);

    if (reactions) metrics.reactions = reactions;
    if (comments) metrics.comments = comments;
    if (reposts) metrics.reposts = reposts;

    return metrics;
  }

  function firstText(node, selectors) {
    for (const selector of selectors) {
      const el = node.querySelector(selector);
      const text = normalize(el?.innerText || "");
      if (text) return text;
    }
    return "";
  }

  function normalize(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function absoluteUrl(href) {
    if (!href) return null;
    try {
      return new URL(href, location.origin).toString();
    } catch {
      return null;
    }
  }

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  if (!window.SiftCommon || typeof window.SiftCommon.install !== "function") {
    console.error("[Sift][LinkedIn] SiftCommon missing");
    return;
  }

  window.SiftCommon.install({
    platform: "linkedin",
    findPostNodes,
    extractPost
  });
})();