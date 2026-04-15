// Sift — LinkedIn adapter.
// LinkedIn DOM changes frequently; selectors are best-effort and guarded.
(function () {
    function findPostNodes(root) {
      // Feed posts
      return root.querySelectorAll(
        'div.feed-shared-update-v2, div[data-urn^="urn:li:activity:"]'
      );
    }
  
    function extractPost(node) {
      const urn = node.getAttribute('data-urn') || node.querySelector('[data-urn^="urn:li:activity:"]')?.getAttribute('data-urn') || '';
      const idSource = urn.match(/urn:li:activity:(\d+)/)?.[1];
  
      const textNode =
        node.querySelector('.feed-shared-update-v2__description .update-components-text') ||
        node.querySelector('.update-components-text') ||
        node.querySelector('.feed-shared-text') ||
        node.querySelector('[data-test-id="main-feed-activity-card__commentary"]');
      const text = normalizeText(textNode?.innerText || '');
  
      // author
      let author = '';
      const actorName =
        node.querySelector('.update-components-actor__title span[aria-hidden="true"]') ||
        node.querySelector('.feed-shared-actor__name');
      if (actorName) author = actorName.innerText.trim();
  
      // URL
      let url = null;
      const anchor =
        node.querySelector('a.app-aware-link[href*="/feed/update/"]') ||
        node.querySelector('a[href*="/feed/update/urn:li:activity:"]');
      if (anchor) url = new URL(anchor.getAttribute('href'), location.origin).toString();
  
      const id = idSource ? ('li_' + idSource) : (text ? 'li_txt_' + hash(text.slice(0, 160)) : null);
      if (!id) return null;
  
      // engagement counts (reactions, comments, reposts)
      const metrics = {};
      const reactionCount = node.querySelector('.social-details-social-counts__reactions-count');
      if (reactionCount) metrics.reactions = reactionCount.innerText.trim();
      const commentsBtn = node.querySelector('button[aria-label*="comment" i] span, li.social-details-social-counts__comments');
      if (commentsBtn) metrics.comments = commentsBtn.innerText.trim();
  
      return {
        platform: 'linkedin',
        id,
        author,
        text,
        url,
        metrics
      };
    }
  
    function normalizeText(t) {
      return (t || '').replace(/\s+/g, ' ').trim();
    }
  
    function hash(str) {
      let h = 0;
      for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
      return (h >>> 0).toString(36);
    }
  
    window.SiftCommon.install({
      platform: 'linkedin',
      findPostNodes,
      extractPost
    });
  })();