// Sift — heuristic analyzer.
// Intentionally framed in terms of "signals" and "likely" — never absolute claims.
// Exposes window.SiftAnalyzer
(function () {
    const STOPWORDS = new Set(('the a an of to and or but if then for with on in is are was were be been being this that these those i you he she we they it as at by from so not no your my our their his her its into about over under more most less few many much every any some just really very been have has had do does did can could should would will well new just now today yesterday tomorrow').split(' '));
  
    function classifyHook(text) {
      const t = (text || '').trim();
      if (!t) return 'unknown';
      const first = t.split(/\n|[.!?]/)[0].trim();
      if (/^[0-9]+[\s\w]{0,30}(ways|reasons|lessons|tips|things|rules|frameworks|mistakes)/i.test(first)) return 'listicle';
      if (/^(stop|start|never|always|don'?t|do not|avoid)\b/i.test(first)) return 'imperative';
      if (/^(how|why|what)\b/i.test(first)) return 'question';
      if (/^(i\s|we\s|my\s|our\s)/i.test(first)) return 'personal-story';
      if (/\?\s*$/.test(first)) return 'question';
      if (/^[A-Z\s]{6,}$/.test(first.slice(0, 40))) return 'caps-shout';
      if (/\b(unpopular opinion|hot take|controversial|nobody talks about)\b/i.test(first)) return 'contrarian';
      if (/\b(i made|i built|i learned|i quit|i left|i launched)\b/i.test(first)) return 'personal-story';
      return 'statement';
    }
  
    function keyTerms(text, n = 8) {
      const words = (text || '').toLowerCase().replace(/[^a-z0-9\s#@]/g, ' ').split(/\s+/);
      const freq = new Map();
      for (const w of words) {
        if (!w || w.length < 3) continue;
        if (STOPWORDS.has(w)) continue;
        freq.set(w, (freq.get(w) || 0) + 1);
      }
      return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([w]) => w);
    }
  
    function summarizeSession(session) {
      const posts = session?.posts || [];
      const events = session?.events || [];
      if (!posts.length) {
        return {
          durationMs: (session.endedAt || Date.now()) - session.startedAt,
          postCount: 0,
          pausedOn: [],
          recurringPatterns: [],
          topicsFeedIsTraining: [],
          draftIdeas: [],
          confidence: 'low'
        };
      }
  
      // Posts you "paused on" = top dwell time
      const paused = [...posts]
        .filter(p => (p.dwellMs || 0) > 1500)
        .sort((a, b) => (b.dwellMs || 0) - (a.dwellMs || 0))
        .slice(0, 5);
  
      // Recurring patterns = hook type frequency
      const hookCounts = new Map();
      for (const p of posts) {
        const h = classifyHook(p.text);
        hookCounts.set(h, (hookCounts.get(h) || 0) + 1);
      }
      const recurringPatterns = [...hookCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([hook, count]) => ({
          hook,
          count,
          label: hookLabel(hook),
          confidence: count >= 3 ? 'medium' : 'low'
        }));
  
      // Topics feed is training = most common key terms across paused posts
      const corpus = paused.map(p => p.text || '').join(' ');
      const terms = keyTerms(corpus, 6);
      const topicsFeedIsTraining = terms.slice(0, 3).map(t => ({ term: t, confidence: 'low' }));
  
      // Draft ideas = remix a hook pattern the user responded to
      const topHook = recurringPatterns[0]?.hook;
      const draftIdeas = paused.slice(0, 2).map(p => {
        return {
          basedOn: p.id,
          angle: suggestAngle(topHook, p),
          confidence: 'low'
        };
      });
  
      return {
        durationMs: (session.endedAt || Date.now()) - session.startedAt,
        postCount: posts.length,
        eventCount: events.length,
        pausedOn: paused.map(p => ({
          id: p.id,
          platform: p.platform,
          author: p.author,
          text: (p.text || '').slice(0, 240),
          dwellMs: p.dwellMs || 0,
          hook: classifyHook(p.text),
          url: p.url
        })),
        recurringPatterns,
        topicsFeedIsTraining,
        draftIdeas,
        confidence: posts.length >= 15 ? 'medium' : 'low'
      };
    }
  
    function hookLabel(hook) {
      return ({
        'listicle': 'Numbered listicle openers',
        'imperative': 'Command-style openers (Stop / Never / Always)',
        'question': 'Question-led openers',
        'personal-story': 'First-person story openers',
        'caps-shout': 'All-caps attention grabs',
        'contrarian': 'Contrarian / hot-take framing',
        'statement': 'Declarative statement openers',
        'unknown': 'Unclassified'
      })[hook] || hook;
    }
  
    function suggestAngle(hook, post) {
      const topicTerm = keyTerms(post.text || '', 1)[0] || 'your topic';
      switch (hook) {
        case 'listicle':
          return `Try a numbered post: "5 things I got wrong about ${topicTerm}"`;
        case 'imperative':
          return `Try an imperative hook: "Stop doing X when you approach ${topicTerm}"`;
        case 'question':
          return `Open with a question the reader is already asking about ${topicTerm}`;
        case 'personal-story':
          return `Lead with a personal moment: "The day I realized ${topicTerm} was the bottleneck"`;
        case 'contrarian':
          return `Take a counter-position on ${topicTerm} that your feed keeps reinforcing`;
        default:
          return `Write a short post riffing on ${topicTerm}, using the format that made you stop`;
      }
    }
  
    const api = { classifyHook, keyTerms, summarizeSession, hookLabel };
    if (typeof window !== 'undefined') window.SiftAnalyzer = api;
    if (typeof self !== 'undefined') self.SiftAnalyzer = api;
  })();