// Sift — X / Twitter adapter
// Maintains the platform-specific extraction layer for X.
// This is intentionally defensive because X's DOM changes often.

(function () {
  function findPostNodes(root) {
    return root.querySelectorAll('article[data-testid="tweet"]');
  }

  function extractPost(node) {
    if (!(node instanceof HTMLElement)) return null;

    const text = extractText(node);
    const author = extractAuthor(node);
    const url = extractPermalink(node);
    const id = extractId(url, text, author);
    const metrics = extractMetrics(node);

    // Ignore obviously broken extractions.
    if (!id) return null;
    if (!text && !url) return null;

    return {
      platform: "x",
      id,
      author,
      text,
      url,
      metrics,
    };
  }

  function extractText(node) {
    const textEl = node.querySelector('[data-testid="tweetText"]');
    if (!textEl) return "";

    return normalizeText(textEl.innerText || "");
  }

  function extractAuthor(node) {
    // Most reliable starting point on X is the User-Name block.
    const userNameBlock = node.querySelector('[data-testid="User-Name"]');
    if (!userNameBlock) return "";

    // Prefer explicit @handle text.
    const handleCandidateEls = userNameBlock.querySelectorAll('[dir="ltr"], span, a');
    for (const el of handleCandidateEls) {
      const raw = normalizeText(el.innerText || "");
      const match = raw.match(/@([A-Za-z0-9_]{1,15})/);
      if (match) return `@${match[1]}`;
    }

    // Fallback: infer handle from profile href.
    const profileLink = userNameBlock.querySelector('a[href^="/"]');
    if (profileLink) {
      const href = profileLink.getAttribute("href") || "";
      const match = href.match(/^\/([A-Za-z0-9_]{1,15})(\/|$)/);
      if (match) return `@${match[1]}`;
    }

    return "";
  }

  function extractPermalink(node) {
    // Strongest signal is the <time> link inside the tweet.
    const timeEl = node.querySelector("time");
    const timeLink = timeEl?.closest('a[href*="/status/"]');
    if (timeLink) {
      return toAbsoluteUrl(timeLink.getAttribute("href"));
    }

    // Fallback to any status link.
    const permalink = node.querySelector('a[href*="/status/"]');
    if (permalink) {
      return toAbsoluteUrl(permalink.getAttribute("href"));
    }

    return null;
  }

  function extractId(url, text, author) {
    if (url) {
      const match = url.match(/status\/(\d+)/);
      if (match) return `x_${match[1]}`;
    }

    // Fallback for missing permalink
    const seed = `${author}|${(text || "").slice(0, 160)}`;
    if (seed.trim()) return `x_txt_${hash(seed)}`;

    return null;
  }

  function extractMetrics(node) {
    const metrics = {};

    // Buttons often contain visible compact counts.
    const replyBtn = node.querySelector('[data-testid="reply"]');
    const repostBtn = node.querySelector('[data-testid="retweet"], [data-testid="unretweet"]');
    const likeBtn = node.querySelector('[data-testid="like"], [data-testid="unlike"]');
    const analyticsLink = node.querySelector('a[href*="/analytics"]');

    const replyValue = readMetricValue(replyBtn);
    const repostValue = readMetricValue(repostBtn);
    const likeValue = readMetricValue(likeBtn);
    const viewValue = readMetricValue(analyticsLink);

    if (replyValue) metrics.replies = replyValue;
    if (repostValue) metrics.reposts = repostValue;
    if (likeValue) metrics.likes = likeValue;
    if (viewValue) metrics.views = viewValue;

    return metrics;
  }

  function readMetricValue(el) {
    if (!el) return null;

    // Try visible text first.
    const text = normalizeText(el.innerText || "");
    if (text) return text;

    // Fallback to aria-label when needed.
    const aria = normalizeText(el.getAttribute("aria-label") || "");
    if (aria) return aria;

    return null;
  }

  function toAbsoluteUrl(href) {
    if (!href) return null;
    try {
      return new URL(href, location.origin).toString();
    } catch {
      return null;
    }
  }

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  window.SiftCommon.install({
    platform: "x",
    findPostNodes,
    extractPost,
  });
})();