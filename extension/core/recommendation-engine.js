/**
 * Sift Recommendation Engine
 * Turns raw session data into structured, evidence-based content recommendations.
 *
 * Pipeline:
 *   1. Score posts from behavior signals
 *   2. Detect patterns from top-scored posts
 *   3. Build a ContentRecommendation
 *   4. Generate a structured LLM prompt (for future API integration)
 */

// ---------------------------------------------------------------------------
// JSDoc type definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PostFeature
 * @property {string} id
 * @property {string} topic        - e.g. "career milestones"
 * @property {string} format       - e.g. "first-person reflection"
 * @property {string} hookType     - Question | Listicle | Story | Contrarian | Data-led | How-to | Imperative | Statement
 * @property {string} tone         - reflective | direct | tactical | personal
 * @property {string} emotionalAngle - e.g. "visible result + hidden lesson"
 * @property {number} specificity  - 0-3 (0=vague, 3=very specific)
 * @property {number} proofLevel   - 0-3 (0=none, 3=hard data)
 * @property {number} dwellMs
 * @property {string} text
 * @property {string} author
 * @property {string|null} url
 */

/**
 * @typedef {Object} BehaviorSignal
 * @property {string} postId
 * @property {number} dwellSeconds
 * @property {boolean} paused         - dwellMs > 3000
 * @property {boolean} likedOrSaved
 * @property {boolean} commentClicked
 * @property {boolean} linkClicked
 * @property {boolean} skippedQuickly - dwellMs < 700
 * @property {number} interestScore
 */

/**
 * @typedef {Object} CreatorProfile
 * @property {string[]} voiceTraits
 * @property {string[]} preferredTopics
 * @property {string[]} avoidedStyles
 * @property {string[]} [writingExamples]
 */

/**
 * @typedef {Object} RecommendationEvidence
 * @property {string[]} topPatterns
 * @property {string[]} strongestSignals
 * @property {PostFeature[]} matchedPostFeatures
 * @property {string} reasoningSummary
 */

/**
 * @typedef {Object} ContentRecommendation
 * @property {string} title
 * @property {string} format
 * @property {string} topic
 * @property {string} angle
 * @property {number} confidence     - 0-100
 * @property {string} whyFeed
 * @property {string} whyVoice
 * @property {string} suggestedHook
 * @property {string[]} hookStarters
 * @property {string} guardrail
 * @property {RecommendationEvidence} evidence
 * @property {string[]} avoid
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by","from",
  "is","was","are","were","be","been","being","have","has","had","do","does","did",
  "will","would","could","should","may","might","can","i","you","he","she","it","we",
  "they","this","that","these","those","my","your","his","her","its","our","their",
  "me","him","us","them","what","which","who","when","where","how","all","just","not",
  "so","up","out","if","about","into","than","then","there","after","before","over",
  "more","also","very","no","get","got","like","as","much","some","any","one","two",
  "three","new","go","see","come","know","think","make","time","say","take","use",
  "good","great","really","even","now","here","too","only","still","back","while",
  "most","other","well","give","work","first","last","never","always","every","same"
]);

const TOPIC_BUCKETS = [
  {
    label: "career milestones",
    keywords: /\b(intern|job|offer|joined?|joining|role|grad(uat)?|full.?time|career|interview|hired|offer letter|onboard|promotion|salary|layoff|fired|quit)\b/i
  },
  {
    label: "building and launching",
    keywords: /\b(build(ing)?|launch(ed|ing)?|product|app|user|growth|ship(ped|ping)?|feature|startup|mvp|prototype|release|deploy|v\d)\b/i
  },
  {
    label: "lessons and reflections",
    keywords: /\b(learn(ed|ing)?|realiz|noticed?|surpris|thought|mistake|lesson|changed?|reflect|regret|wish|perspective|mindset)\b/i
  },
  {
    label: "proof and results",
    keywords: /(%|\b\d+x\b|\bgrew\b|\bincreased?\b|\bdropped?\b|\bresult|\btest|\bmetric|\bdata|\bnumber|\bstat|\btrack|\bmeasure)\b/i
  },
  {
    label: "personal story",
    keywords: /\b(story|told me|told you|remember when|it was|i was|i felt|i thought|happened|experience|moment|time i|year i|day i)\b/i
  },
  {
    label: "creator and content",
    keywords: /\b(post|content|creator|audience|follower|linkedin|twitter|platform|personal brand|write|writing|thread|newsletter)\b/i
  }
];

const FORMAT_MAP = {
  "Story": "first-person reflection",
  "Contrarian": "contrarian take",
  "Data-led": "proof-backed insight",
  "Listicle": "structured breakdown",
  "How-to": "step-by-step guide",
  "Question": "curiosity-driven opener",
  "Imperative": "direct call to action",
  "Statement": "clean assertion"
};

const ANGLE_MAP = {
  "Story": "visible result + hidden lesson",
  "Contrarian": "expectation + reality gap",
  "Data-led": "metric + unexpected takeaway",
  "Listicle": "multiple proof points → pattern",
  "How-to": "process + earned insight",
  "Question": "shared tension → release",
  "Imperative": "specific action + reason why",
  "Statement": "compressed belief + implied proof"
};

// ---------------------------------------------------------------------------
// 1. Scoring
// ---------------------------------------------------------------------------

/**
 * Score a post by observed behavior signals.
 * @param {Object} post - raw post with dwellMs
 * @param {Object[]} events - session events
 * @returns {BehaviorSignal}
 */
function scorePost(post, events) {
  const dwellMs = post.dwellMs || 0;
  const dwellSeconds = dwellMs / 1000;
  const paused = dwellMs > 3000;
  const skippedQuickly = dwellMs < 700;

  const postEvents = events.filter(
    (e) => e.postId === post.id || e.post?.id === post.id
  );
  const commentClicked = postEvents.some((e) => e.kind === "comment_click");
  const linkClicked = postEvents.some((e) => e.kind === "link_click");
  const likedOrSaved = postEvents.some((e) => e.kind === "save_post");

  // Interest score formula
  const dwellScore = Math.min(dwellSeconds, 30) * 2;      // max 60
  const pauseBonus = paused ? 12 : 0;
  const saveBonus = likedOrSaved ? 22 : 0;
  const commentBonus = commentClicked ? 10 : 0;
  const linkBonus = linkClicked ? 6 : 0;
  const skipPenalty = skippedQuickly ? -15 : 0;

  const interestScore = Math.max(
    0,
    dwellScore + pauseBonus + saveBonus + commentBonus + linkBonus + skipPenalty
  );

  return {
    postId: post.id,
    dwellSeconds,
    paused,
    likedOrSaved,
    commentClicked,
    linkClicked,
    skippedQuickly,
    interestScore
  };
}

// ---------------------------------------------------------------------------
// 2. Feature extraction
// ---------------------------------------------------------------------------

/**
 * @param {string} text
 * @returns {string}
 */
function classifyHook(text) {
  const t = String(text || "").trim();
  if (!t) return "Statement";
  if (/\?$/.test(t) || /^(why|what|how|should|can|is|are)\b/i.test(t)) return "Question";
  if (/^\d+(\+)?\s/.test(t) || /\b\d+\s+(ways|reasons|lessons|mistakes|tips|things)\b/i.test(t)) return "Listicle";
  if (/^(stop|start|never|always|do|build|write|learn|try|quit|avoid)\b/i.test(t)) return "Imperative";
  if (/^(i|we)\b/i.test(t)) return "Story";
  if (/^(everyone|most people|unpopular opinion|hot take|contrary|nobody talks)\b/i.test(t)) return "Contrarian";
  if (/(%|\b\d+x\b|\bgrew\b|\bincreased?\b|\bdecreased?\b|\btest\b|\bdata\b)/i.test(t)) return "Data-led";
  if (/^(how to|here'?s how|guide|tutorial|step|a framework)\b/i.test(t)) return "How-to";
  return "Statement";
}

/**
 * @param {string} text
 * @returns {string}
 */
function detectTopic(text) {
  const lower = text.toLowerCase();
  for (const bucket of TOPIC_BUCKETS) {
    if (bucket.keywords.test(lower)) return bucket.label;
  }
  return "personal insight";
}

/**
 * @param {string} text
 * @returns {number} 0-3
 */
function detectSpecificity(text) {
  const t = text || "";
  let score = 0;
  if (/\d/.test(t)) score++;
  if (/%|\$|\bx\b/.test(t)) score++;
  if (/specific|exactly|precisely|only|just one|one thing/.test(t.toLowerCase())) score++;
  return score;
}

/**
 * @param {string} text
 * @returns {number} 0-3
 */
function detectProofLevel(text) {
  const t = text || "";
  let score = 0;
  if (/\d+/.test(t)) score++;
  if (/%|\bx\b|\bmetric|\bdata|\bstat/.test(t.toLowerCase())) score++;
  if (/\bgrew|\bincreased|\bdropped|\btest(ed)?|\bresult/.test(t.toLowerCase())) score++;
  return score;
}

/**
 * @param {string[]} texts
 * @param {number} n
 * @returns {string[]}
 */
function extractKeyTerms(texts, n = 6) {
  const freq = {};
  for (const t of texts) {
    const words = (t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/);
    for (const w of words) {
      if (w.length >= 4 && !STOP_WORDS.has(w)) {
        freq[w] = (freq[w] || 0) + 1;
      }
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

/**
 * Extract PostFeature from a raw post.
 * @param {Object} post
 * @returns {PostFeature}
 */
function extractFeature(post) {
  const text = String(post.cleanedText || post.text || "");
  const hookType = post.hookType || classifyHook(text);
  const topic = detectTopic(text);
  const firstLines = text.split(/\n/)[0] || text.slice(0, 120);
  const hasFirstPerson = /\b(i|my|me|we|our)\b/i.test(text);
  const hasReflection = /\b(realiz|learned|noticed|changed|thought|before|after)\b/i.test(text);
  const hasTactical = /\b(how|why|steps?|framework|tips?|ways?)\b/i.test(text);

  let tone = "direct";
  if (hasFirstPerson && hasReflection) tone = "reflective";
  else if (hasTactical) tone = "tactical";
  else if (hasFirstPerson) tone = "personal";

  return {
    id: post.id || "",
    topic,
    format: FORMAT_MAP[hookType] || "statement",
    hookType,
    tone,
    emotionalAngle: ANGLE_MAP[hookType] || "insight",
    specificity: detectSpecificity(text),
    proofLevel: detectProofLevel(text),
    dwellMs: post.dwellMs || 0,
    text: text.slice(0, 500),
    author: post.author || "",
    url: post.url || null
  };
}

// ---------------------------------------------------------------------------
// 3. Pattern detection
// ---------------------------------------------------------------------------

/**
 * @param {PostFeature[]} features
 * @param {BehaviorSignal[]} signals
 * @returns {{pattern:string, count:number, weight:number}[]}
 */
function detectPatterns(features, signals) {
  const scoreMap = {};
  for (const s of signals) {
    scoreMap[s.postId] = s.interestScore;
  }

  const hookCounts = {};
  const topicCounts = {};
  const toneCounts = {};

  for (const f of features) {
    const w = scoreMap[f.id] || 1;
    hookCounts[f.hookType] = (hookCounts[f.hookType] || 0) + w;
    topicCounts[f.topic] = (topicCounts[f.topic] || 0) + w;
    toneCounts[f.tone] = (toneCounts[f.tone] || 0) + w;
  }

  const toRanked = (counts, prefix) =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k, v]) => ({ pattern: `${prefix}: ${k}`, weight: v, count: features.filter(f => f.hookType === k || f.topic === k || f.tone === k).length }));

  return [
    ...toRanked(hookCounts, "Hook type"),
    ...toRanked(topicCounts, "Topic"),
    ...toRanked(toneCounts, "Tone")
  ].sort((a, b) => b.weight - a.weight).slice(0, 5);
}

// ---------------------------------------------------------------------------
// 4. Voice detection
// ---------------------------------------------------------------------------

/**
 * @param {PostFeature[]} features
 * @returns {CreatorProfile}
 */
function buildCreatorProfile(features) {
  const toneCounts = {};
  const topicSet = new Set();

  for (const f of features) {
    toneCounts[f.tone] = (toneCounts[f.tone] || 0) + 1;
    topicSet.add(f.topic);
  }

  const dominantTone = Object.entries(toneCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "direct";

  const voiceTraitMap = {
    reflective: ["Reflective", "Self-aware", "Introspective", "Not overly polished"],
    tactical: ["Practical", "Takeaway-driven", "Clear", "Structured"],
    personal: ["Personal", "First-person", "Authentic", "Relatable"],
    direct: ["Direct", "Punchy", "Confident", "Opinionated"]
  };

  const voiceTraits = voiceTraitMap[dominantTone] || voiceTraitMap["direct"];

  const avgSpecificity = features.reduce((s, f) => s + f.specificity, 0) / (features.length || 1);
  const avgProof = features.reduce((s, f) => s + f.proofLevel, 0) / (features.length || 1);

  const avoidedStyles = [
    "Generic LinkedIn hooks",
    "Fake vulnerability",
    "Over-explaining",
    ...(avgProof < 1 ? ["Data without story"] : []),
    ...(avgSpecificity < 1 ? ["Advice with no proof"] : [])
  ];

  return {
    voiceTraits,
    preferredTopics: [...topicSet].slice(0, 3),
    avoidedStyles
  };
}

// ---------------------------------------------------------------------------
// 5. Confidence score
// ---------------------------------------------------------------------------

/**
 * @param {PostFeature[]} topFeatures
 * @param {BehaviorSignal[]} signals
 * @returns {number} 0-100
 */
function calcConfidence(topFeatures, signals) {
  if (!topFeatures.length) return 20;

  const totalScore = signals.reduce((s, sig) => s + sig.interestScore, 0);
  const postCount = signals.length;

  // More posts + higher scores = more confidence
  const volumeScore = Math.min(postCount / 20, 1) * 30;        // 0-30
  const signalScore = Math.min(totalScore / 500, 1) * 40;       // 0-40
  const patternScore = topFeatures.length >= 3 ? 20 : topFeatures.length * 6; // 0-20
  const pauseBonus = signals.filter((s) => s.paused).length >= 2 ? 10 : 0;

  return Math.min(
    95,
    Math.round(20 + volumeScore + signalScore + patternScore + pauseBonus)
  );
}

// ---------------------------------------------------------------------------
// 6. Hook starter generation
// ---------------------------------------------------------------------------

/**
 * @param {string} hookType
 * @param {string} topic
 * @param {string} tone
 * @param {string[]} keyTerms
 * @returns {string[]}
 */
function generateHookStarters(hookType, topic, tone, keyTerms) {
  const term = keyTerms[0] || topic;
  const term2 = keyTerms[1] || "it";

  const starters = {
    Story: [
      `I used to think ${topic} was about ${term}. I was wrong.`,
      `The part no one talks about in ${topic}: ${term2}.`,
      `What actually changed for me after ${term} wasn't what I expected.`
    ],
    Contrarian: [
      `Most people think ${topic} requires ${term}. It doesn't.`,
      `Hot take: ${term} is the last thing you should optimize for in ${topic}.`,
      `Everyone's talking about ${term}. No one's asking why it keeps failing.`
    ],
    "Data-led": [
      `After tracking ${term} for 90 days, here's what the data actually showed:`,
      `I ran an experiment on ${topic}. The result surprised me.`,
      `The number that changed how I think about ${term}:`
    ],
    Listicle: [
      `3 things I got wrong about ${topic} (and what fixed them):`,
      `${term.charAt(0).toUpperCase() + term.slice(1)} taught me more about ${topic} than 5 years did.`,
      `If I had to start ${topic} again with what I know now:`
    ],
    "How-to": [
      `Here's the ${topic} framework that actually works (no fluff):`,
      `How I went from confused about ${term} to knowing exactly what to do:`,
      `One framework for ${topic} that replaces 10 hours of guessing:`
    ],
    Question: [
      `What if everything you believe about ${topic} is optimized for the wrong goal?`,
      `Why does ${term} feel so hard when the answer is usually simpler?`,
      `What's the one thing about ${topic} that nobody asks you directly?`
    ],
    Imperative: [
      `Stop optimizing ${term}. Start tracking what ${topic} actually rewards.`,
      `Build the thing. Ship it. Then ask if ${term} mattered.`,
      `Learn ${term} before you spend another week on ${topic}.`
    ],
    Statement: [
      `${topic.charAt(0).toUpperCase() + topic.slice(1)} isn't about ${term}. It never was.`,
      `The best ${term} I've seen share one thing in common.`,
      `Nobody gets good at ${topic} by reading about it.`
    ]
  };

  return starters[hookType] || starters["Statement"];
}

// ---------------------------------------------------------------------------
// 7. Main recommendation generator
// ---------------------------------------------------------------------------

/**
 * @param {Object} session - raw session from chrome.storage
 * @returns {{ recommendation: ContentRecommendation, profile: CreatorProfile, patterns: Object[] }}
 */
function generateRecommendation(session) {
  const posts = Array.isArray(session?.posts) ? session.posts : [];
  const events = Array.isArray(session?.events) ? session.events : [];

  if (!posts.length) {
    return {
      recommendation: buildEmptyRecommendation(),
      profile: { voiceTraits: [], preferredTopics: [], avoidedStyles: [] },
      patterns: []
    };
  }

  // Score every post
  const signals = posts.map((p) => scorePost(p, events));

  // Sort by score, take top posts for feature extraction
  const scoredPosts = posts
    .map((p, i) => ({ post: p, signal: signals[i] }))
    .sort((a, b) => b.signal.interestScore - a.signal.interestScore);

  const topScoredPosts = scoredPosts.slice(0, 10).map((s) => s.post);
  const features = topScoredPosts.map(extractFeature);
  const topSignals = scoredPosts.slice(0, 10).map((s) => s.signal);

  // Detect dominant patterns
  const patterns = detectPatterns(features, topSignals);

  // Build creator profile from all posts
  const allFeatures = posts.map(extractFeature);
  const profile = buildCreatorProfile(allFeatures);

  // Pick primary hook, topic, format
  const hookCounts = {};
  const topicCounts = {};
  for (const f of features) {
    hookCounts[f.hookType] = (hookCounts[f.hookType] || 0) + 1;
    topicCounts[f.topic] = (topicCounts[f.topic] || 0) + 1;
  }

  const primaryHook = Object.entries(hookCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Story";
  const primaryTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "personal insight";
  const primaryTone = profile.voiceTraits[0]?.toLowerCase() || "reflective";
  const keyTerms = extractKeyTerms(features.map((f) => f.text));
  const confidence = calcConfidence(features, topSignals);

  const format = FORMAT_MAP[primaryHook] || "first-person reflection";
  const angle = ANGLE_MAP[primaryHook] || "visible result + hidden lesson";
  const hookStarters = generateHookStarters(primaryHook, primaryTopic, primaryTone, keyTerms);
  const suggestedHook = hookStarters[0];

  // Build why statements
  const pauseCount = topSignals.filter((s) => s.paused).length;
  const saveCount = topSignals.filter((s) => s.likedOrSaved).length;
  const commentCount = topSignals.filter((s) => s.commentClicked).length;

  const signalParts = [];
  if (pauseCount > 0) signalParts.push(`You paused on ${pauseCount} posts with this pattern`);
  if (saveCount > 0) signalParts.push(`saved ${saveCount}`);
  if (commentCount > 0) signalParts.push(`clicked through on ${commentCount}`);
  const signalSummary = signalParts.join(", ") || "Dwell time signaled consistent interest";

  const whyFeed = buildWhyFeed(primaryHook, primaryTopic, signalSummary, patterns);
  const whyVoice = buildWhyVoice(primaryHook, profile);

  // Strongest signals for evidence
  const strongestSignals = [
    `${topSignals.filter((s) => s.paused).length} posts held your attention for 3+ seconds`,
    `Top hook type: ${primaryHook}`,
    `Top topic: ${primaryTopic}`,
    keyTerms.length ? `Recurring terms: ${keyTerms.slice(0, 3).join(", ")}` : null
  ].filter(Boolean);

  const evidence = {
    topPatterns: patterns.map((p) => p.pattern),
    strongestSignals,
    matchedPostFeatures: features.slice(0, 5),
    reasoningSummary: `Your attention consistently favored ${primaryHook.toLowerCase()} posts about ${primaryTopic}. This recommendation is built from your top ${features.length} highest-engagement posts this session.`
  };

  const avoid = [
    ...profile.avoidedStyles,
    `Copying the exact structure of posts you saw — use the pattern, not the sentence`,
    `Generic openers like "In today's world..." or "We all know that..."`
  ];

  /** @type {ContentRecommendation} */
  const recommendation = {
    title: "Next Best Post",
    format,
    topic: primaryTopic,
    angle,
    confidence,
    whyFeed,
    whyVoice,
    suggestedHook,
    hookStarters,
    guardrail: `Use your own result, tension, or lesson. Don't borrow someone else's milestone.`,
    evidence,
    avoid
  };

  return { recommendation, profile, patterns };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildWhyFeed(hookType, topic, signalSummary, patterns) {
  const hookReason = {
    Story: "Personal outcome posts held your attention longest this session.",
    Contrarian: "Posts that challenged common beliefs drove the most engagement from you.",
    "Data-led": "You paused on posts with proof, numbers, or visible results.",
    Listicle: "Structured posts with clear, extractable value got consistent attention.",
    "How-to": "Process-oriented posts with earned insight performed best in your feed.",
    Question: "Posts that opened a tension or curiosity loop kept you reading.",
    Imperative: "Direct, action-forward posts were what stopped the scroll.",
    Statement: "Clean, confident assertions without filler held your attention."
  };

  return `${hookReason[hookType] || "This pattern appeared most in the posts you engaged with."} ${signalSummary}. Topic cluster: ${topic}.`;
}

function buildWhyVoice(hookType, profile) {
  const traits = profile.voiceTraits.slice(0, 2).join(" and ") || "direct";
  const formatName = FORMAT_MAP[hookType] || "this format";
  return `A ${formatName} fits a ${traits} voice naturally. It lets you sound specific without being over-polished or preachy.`;
}

function buildEmptyRecommendation() {
  /** @type {ContentRecommendation} */
  return {
    title: "Next Best Post",
    format: "—",
    topic: "—",
    angle: "—",
    confidence: 0,
    whyFeed: "Run a research session to generate evidence-based recommendations.",
    whyVoice: "Sift will analyze your attention patterns to match your creator voice.",
    suggestedHook: "—",
    hookStarters: [],
    guardrail: "—",
    evidence: {
      topPatterns: [],
      strongestSignals: [],
      matchedPostFeatures: [],
      reasoningSummary: "No session data yet."
    },
    avoid: []
  };
}

// ---------------------------------------------------------------------------
// 8. LLM Prompt Builder
// ---------------------------------------------------------------------------

/**
 * Build a structured prompt object for an LLM call.
 * This is what would be sent to Claude/GPT when API integration is added.
 *
 * @param {Object} session
 * @param {CreatorProfile} creatorProfile
 * @returns {Object} structured prompt payload
 */
function buildLLMPrompt(session, creatorProfile) {
  const posts = Array.isArray(session?.posts) ? session.posts : [];
  const events = Array.isArray(session?.events) ? session.events : [];

  const signals = posts.map((p) => scorePost(p, events));
  const scoredPosts = posts
    .map((p, i) => ({ post: p, signal: signals[i] }))
    .sort((a, b) => b.signal.interestScore - a.signal.interestScore)
    .slice(0, 8);

  const topPostFeatures = scoredPosts.map((s) => extractFeature(s.post));

  const totalDwell = posts.reduce((sum, p) => sum + (p.dwellMs || 0), 0);
  const topSignals = scoredPosts.map((s) => ({
    postId: s.signal.postId,
    interestScore: Math.round(s.signal.interestScore),
    paused: s.signal.paused,
    likedOrSaved: s.signal.likedOrSaved,
    commentClicked: s.signal.commentClicked
  }));

  return {
    systemInstructions: [
      "You are a creator content strategist. Your job is to analyze a user's scrolling behavior and generate evidence-based content recommendations.",
      "NEVER recommend vague content.",
      "NEVER say 'post consistently' or 'provide value.'",
      "Every recommendation must be tied to specific observed behavior from the session data.",
      "Every hook must connect to the detected topic, format, or angle.",
      "Always include: why it fits the feed, why it fits the creator's voice, one guardrail.",
      "Avoid fake guru language. Avoid generic LinkedIn-style advice.",
      "Output valid JSON matching the ContentRecommendation schema exactly."
    ].join("\n"),

    sessionContext: {
      postsSeen: posts.length,
      totalDwellSeconds: Math.round(totalDwell / 1000),
      mode: session?.settings?.mode || "research",
      platform: posts[0]?.platform || "unknown",
      topSignals
    },

    topPostFeatures: topPostFeatures.map((f) => ({
      topic: f.topic,
      format: f.format,
      hookType: f.hookType,
      tone: f.tone,
      emotionalAngle: f.emotionalAngle,
      specificity: f.specificity,
      proofLevel: f.proofLevel,
      textPreview: f.text.slice(0, 200)
    })),

    creatorProfile: {
      voiceTraits: creatorProfile.voiceTraits,
      preferredTopics: creatorProfile.preferredTopics,
      avoidedStyles: creatorProfile.avoidedStyles,
      writingExamples: creatorProfile.writingExamples || []
    },

    requiredOutputSchema: {
      title: "string",
      format: "string - e.g. 'first-person reflection'",
      topic: "string - e.g. 'career milestones'",
      angle: "string - e.g. 'visible result + hidden lesson'",
      confidence: "number 0-100",
      whyFeed: "string - specific to observed session signals",
      whyVoice: "string - specific to creator profile traits",
      suggestedHook: "string - one concrete hook starter",
      hookStarters: "string[] - 3-5 ready-to-use hooks",
      guardrail: "string - one specific thing to avoid",
      evidence: {
        topPatterns: "string[]",
        strongestSignals: "string[]",
        matchedPostFeatures: "PostFeature[]",
        reasoningSummary: "string"
      },
      avoid: "string[] - 3-5 specific patterns to avoid"
    }
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

window.SiftEngine = {
  generateRecommendation,
  buildLLMPrompt,
  scorePost,
  extractFeature,
  detectPatterns,
  buildCreatorProfile,
  classifyHook,
  detectTopic,
  extractKeyTerms
};
