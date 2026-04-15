// Sift — thin storage helpers (available in content scripts and popup via plain script load)
// Exposes window.SiftStorage

(function () {
    const ns = {
      async get(key, fallback) {
        return new Promise((resolve) => {
          chrome.storage.local.get(key, (res) => resolve(res?.[key] ?? fallback));
        });
      },
      async set(key, value) {
        return new Promise((resolve) => {
          chrome.storage.local.set({ [key]: value }, resolve);
        });
      },
      async update(key, fn, fallback) {
        const current = await ns.get(key, fallback);
        const next = fn(current);
        await ns.set(key, next);
        return next;
      }
    };
    if (typeof window !== 'undefined') window.SiftStorage = ns;
    if (typeof self !== 'undefined') self.SiftStorage = ns;
  })();