// Sift — X / Twitter adapter
// Uses data-testid attributes which are (relatively) stable on the site.
// These selectors will drift; treat this file as the layer you maintain most often.

(function () {
    function findPostNodes(root) {
      // Each post/tweet is an <article data-testid="tweet">
      return root.querySelectorAll('article[data-testid="tweet"]');
    }
  
    function extractPost(node) {
      const textEl = node.querySelector('[data-testid="tweetText"]');
      const text = textEl ? normalizeText(textEl.innerText) : '';
  
      // author handle
      let author = '';
      const handleEl = node.querySelector('a[href^="/"][role="link"] [dir="ltr"]');
      if (handleEl) {
        const m = handleEl.innerText.match(/@[\w]+/);
        if (m) author = m[0];
      }
      if (!author) {
        const linkEl = node.querySelector('a[href^="/"][role="link"]');
        if (linkEl) {
          const href = linkEl.getAttribute('href') || '';
          const m = href.match(/^\/([A-Za-z0-9_]+)(\/|$)/);
          if (m) author = '@' + m[1];
        }
      }
  
      // permalink + id
      let url = null, id = null;
      const permalink = node.querySelector('a[href*="/status/"]');
      if (permalink) {
        url = new URL(permalink.getAttribute('href'), location.origin).toString();
        const m = url.match(/status\/(\d+)/);
        if (m) id = 'x_' + m[1];
      }
      if (!id && text) id = 'x_txt_' + hash(text.slice(0, 160));
  
      // metrics (likes/reposts/replies/views)
      const metrics = {};
      node.querySelectorAll('[data-testid$="-count"], [data-testid="reply"], [data-testid="retweet"], [data-testid="like"]')
        .forEach(el => {
          const key = (el.getAttribute('data-testid') || '').replace('-count', '');
          const v = (el.innerText || '').trim();
          if (v) metrics[key] = v;
        });
  
      if (!id) return null;
      return {
        platform: 'x',
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
      platform: 'x',
      findPostNodes,
      extractPost
    });
  })();