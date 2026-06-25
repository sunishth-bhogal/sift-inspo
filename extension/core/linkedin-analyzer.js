/**
 * Sift — LinkedIn post analysis utilities
 * Combines imported post history, session behavior, and swipe file
 * into evidence-based content recommendations.
 *
 * Exposed as window.SiftLinkedIn
 */

// ---------------------------------------------------------------------------
// Performance scoring
// ---------------------------------------------------------------------------

/**
 * Calculate a composite performance score for a LinkedIn post.
 * Weights: engagement rate (40%) + comment rate (30%) + repost rate (20%) + follower conversion (10%)
 *
 * @param {import('./types.js').LinkedInPost} post
 * @returns {import('./types.js').PostPerformance}
 */
function calculatePostPerformanceScore(post) {
  const imp = post.impressions || 1;
  const reactions = post.reactions || 0;
  const comments = post.comments || 0;
  const reposts = post.reposts || 0;
  const newFollowers = post.newFollowers || 0;

  const engagementRate = (reactions + comments + reposts) / imp;
  const commentRate = comments / imp;
  const repostRate = reposts / imp;
  const followerConversionRate = newFollowers / imp;

  // LinkedIn average engagement rate ≈ 2–3%. We score relative to that.
  const BASELINE = 0.025;
  const engagementScore = Math.min(engagementRate / BASELINE, 4) * 40;  // 0–40
  const commentScore = Math.min(commentRate / 0.005, 4) * 30;           // 0–30
  const repostScore = Math.min(repostRate / 0.005, 4) * 20;             // 0–20
  const followerScore = Math.min(followerConversionRate / 0.005, 4) * 10; // 0–10

  const performanceScore = Math.min(100, Math.round(engagementScore + commentScore + repostScore + followerScore));

  return {
    postId: post.id,
    engagementRate: +engagementRate.toFixed(4),
    commentRate: +commentRate.toFixed(4),
    repostRate: +repostRate.toFixed(4),
    followerConversionRate: +followerConversionRate.toFixed(4),
    performanceScore
  };
}

// ---------------------------------------------------------------------------
// Post analysis (feature extraction)
// ---------------------------------------------------------------------------

const TOPIC_BUCKETS = [
  { label: "career milestones", re: /\b(intern|job|offer|joined?|role|grad|career|interview|hired|promotion|salary|layoff|quit)\b/i },
  { label: "building in public", re: /\b(build|launch|product|app|users?|growth|ship|startup|mvp|release|deploy)\b/i },
  { label: "lessons and reflections", re: /\b(learn|realiz|noticed?|surpris|thought|mistake|lesson|changed?|reflect|regret|wish)\b/i },
  { label: "proof and results", re: /(%|\b\d+x\b|\bgrew\b|\bincreased?\b|\bdropped?\b|\bresult|\bmetric|\bdata)\b/i },
  { label: "content strategy", re: /\b(post|content|creator|audience|follower|linkedin|hook|algorithm|impressions?)\b/i },
  { label: "audience building", re: /\b(audience|follower|community|subscriber|reader|newsletter|brand)\b/i },
  { label: "creator mindset", re: /\b(consistency|motivation|burnout|mindset|creative|process|discipline|habit)\b/i }
];

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by","from",
  "is","was","are","were","have","has","had","do","does","did","will","would","could",
  "should","i","you","he","she","it","we","they","this","that","my","your","his","her",
  "me","them","what","who","when","where","how","not","so","up","if","than","there",
  "more","also","very","no","get","like","as","some","one","two","good","really","even",
  "now","here","too","only","still","back","most","well","give","work","first","last"
]);

/**
 * @param {string} text
 * @returns {string}
 */
function classifyHook(text) {
  const t = String(text || "").trim();
  const first = t.split(/\n/)[0] || t;
  if (/\?$/.test(first) || /^(why|what|how|should|can|is|are)\b/i.test(first)) return "Question";
  if (/^\d+(\+)?\s/.test(first) || /\b\d+\s+(ways|reasons|lessons|mistakes|tips|things)\b/i.test(first)) return "Listicle";
  if (/^(stop|start|never|always|do|build|write|learn|try|quit|avoid)\b/i.test(first)) return "Imperative";
  if (/^(i|we)\b/i.test(first)) return "Story";
  if (/^(everyone|most people|unpopular opinion|hot take|contrary|nobody)\b/i.test(first)) return "Contrarian";
  if (/(%|\b\d+x\b|\bgrew\b|\bincreased?\b|\btest\b|\bdata\b)/i.test(first)) return "Data-led";
  if (/^(how to|here'?s how|guide|tutorial|step|framework)\b/i.test(first)) return "How-to";
  return "Statement";
}

/**
 * @param {string} text
 * @returns {string}
 */
function detectTopic(text) {
  const lower = text.toLowerCase();
  for (const b of TOPIC_BUCKETS) {
    if (b.re.test(lower)) return b.label;
  }
  return "personal insight";
}

/**
 * @param {string} text
 * @returns {string}
 */
function detectTone(text) {
  const lower = text.toLowerCase();
  const reflective = (lower.match(/\b(realiz|learned|noticed|changed|thought|before|after|used to)\b/g) || []).length;
  const tactical = (lower.match(/\b(how|why|steps?|framework|tips?|ways?|track)\b/g) || []).length;
  const direct = (lower.match(/^(stop|never|always|do|start|build)/gm) || []).length;
  const personal = (lower.match(/\b(i|my|me)\b/g) || []).length;

  if (reflective >= 2) return "reflective";
  if (tactical >= 2) return "tactical";
  if (direct >= 1) return "direct";
  if (personal >= 3) return "personal";
  return "direct";
}

/**
 * @param {string} text
 * @returns {number} 0–3
 */
function detectSpecificity(text) {
  let score = 0;
  if (/\d/.test(text)) score++;
  if (/\d{3,}/.test(text)) score++;
  if (/specific|exactly|precisely|one thing|one post|one person/.test(text.toLowerCase())) score++;
  return Math.min(score, 3);
}

/**
 * @param {string} text
 * @returns {number} 0–3
 */
function detectProofLevel(text) {
  let score = 0;
  if (/\d+/.test(text)) score++;
  if (/%|\bx\b|\bmetric|\bdata|\bstat/.test(text.toLowerCase())) score++;
  if (/\bgrew|\bincreased|\bdropped|\btest(ed)?|\bresult|\btrack/.test(text.toLowerCase())) score++;
  return Math.min(score, 3);
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function detectVoiceTraits(text) {
  const traits = [];
  if (detectSpecificity(text) >= 2) traits.push("specific");
  if (/\bi deleted|\bi quit|\bi was wrong|\bi failed/i.test(text)) traits.push("honest");
  if (detectProofLevel(text) >= 2) traits.push("evidence-based");
  if (!/excited to share|thrilled|blessed|grateful/i.test(text)) traits.push("non-performative");
  if (/\bi think|\bin my view|\bfor me\b/i.test(text)) traits.push("self-aware");
  if (detectTone(text) === "reflective") traits.push("reflective");
  if (traits.length === 0) traits.push("direct");
  return traits;
}

/**
 * Analyze a raw LinkedIn post into structured features.
 * @param {import('./types.js').LinkedInPost} post
 * @returns {import('./types.js').PostAnalysis}
 */
function analyzePost(post) {
  const text = post.text || "";
  const hookType = classifyHook(text);
  const tone = detectTone(text);

  const formatMap = {
    Story: "first-person reflection",
    Contrarian: "contrarian take",
    "Data-led": "proof-backed insight",
    Listicle: "structured breakdown",
    "How-to": "step-by-step guide",
    Question: "curiosity-driven opener",
    Imperative: "direct call to action",
    Statement: "clean assertion"
  };

  const angleMap = {
    Story: "visible result + hidden lesson",
    Contrarian: "expectation vs. reality gap",
    "Data-led": "metric + unexpected takeaway",
    Listicle: "multiple proof points → pattern",
    "How-to": "process + earned insight",
    Question: "shared tension → release",
    Imperative: "specific action + reason why",
    Statement: "compressed belief + implied proof"
  };

  const lines = text.split(/\n+/).filter(Boolean);
  const hasEnding = lines.length >= 3;
  const lastLine = lines[lines.length - 1] || "";
  const ctaType = /\?$/.test(lastLine) ? "question"
    : /follow|subscribe|dm me/i.test(lastLine) ? "follow"
    : /save this|bookmark/i.test(lastLine) ? "save"
    : hasEnding ? "implicit"
    : "none";

  const structure = lines.length <= 3
    ? "hook → single insight"
    : hookType === "Story"
    ? "hook → tension → resolution → belief"
    : hookType === "Data-led"
    ? "claim → data → interpretation"
    : hookType === "Listicle"
    ? "hook → list → compressed insight"
    : "hook → argument → ending";

  return {
    postId: post.id,
    topic: detectTopic(text),
    format: formatMap[hookType] || "statement",
    hookType,
    tone,
    structure,
    emotionalAngle: angleMap[hookType] || "insight",
    specificity: detectSpecificity(text),
    proofLevel: detectProofLevel(text),
    ctaType,
    voiceTraits: detectVoiceTraits(text)
  };
}

// ---------------------------------------------------------------------------
// Pattern detection across multiple posts
// ---------------------------------------------------------------------------

/**
 * Find the most consistent patterns across high-performing posts.
 * @param {import('./types.js').LinkedInPost[]} posts
 * @param {import('./types.js').PostPerformance[]} performances
 * @param {import('./types.js').PostAnalysis[]} analyses
 * @returns {import('./types.js').CreatorPattern[]}
 */
function analyzeWinningPatterns(posts, performances, analyses) {
  const perfMap = {};
  for (const p of performances) perfMap[p.postId] = p;

  // Sort posts by performance score, take top half
  const ranked = posts
    .map((p) => ({ post: p, perf: perfMap[p.id], analysis: analyses.find((a) => a.postId === p.id) }))
    .filter((x) => x.perf && x.analysis)
    .sort((a, b) => b.perf.performanceScore - a.perf.performanceScore);

  const top = ranked.slice(0, Math.ceil(ranked.length / 2));

  // Count trait frequencies among top posts
  const hookCounts = {};
  const toneCounts = {};
  const traitCounts = {};
  const topicCounts = {};

  for (const { analysis } of top) {
    hookCounts[analysis.hookType] = (hookCounts[analysis.hookType] || 0) + 1;
    toneCounts[analysis.tone] = (toneCounts[analysis.tone] || 0) + 1;
    topicCounts[analysis.topic] = (topicCounts[analysis.topic] || 0) + 1;
    for (const t of analysis.voiceTraits) {
      traitCounts[t] = (traitCounts[t] || 0) + 1;
    }
  }

  const total = top.length || 1;
  const patterns = [];

  // Dominant hook pattern
  const topHook = Object.entries(hookCounts).sort((a, b) => b[1] - a[1])[0];
  if (topHook && topHook[1] >= 2) {
    const strength = Math.round((topHook[1] / total) * 100);
    const evidenceIds = top.filter((x) => x.analysis.hookType === topHook[0]).map((x) => x.post.id);
    patterns.push({
      name: `${topHook[0]} hooks outperform`,
      description: `${topHook[1]} of your top posts use the ${topHook[0]} hook format. This is the structure your best content defaults to.`,
      strength,
      evidencePostIds: evidenceIds,
      recommendation: `Open your next post the same way your ${topHook[0]} posts open — not by copying the line, but by matching the structural move.`
    });
  }

  // Dominant tone pattern
  const topTone = Object.entries(toneCounts).sort((a, b) => b[1] - a[1])[0];
  if (topTone && topTone[1] >= 2) {
    const strength = Math.round((topTone[1] / total) * 100);
    const evidenceIds = top.filter((x) => x.analysis.tone === topTone[0]).map((x) => x.post.id);
    patterns.push({
      name: `${topTone[0].charAt(0).toUpperCase() + topTone[0].slice(1)} tone converts`,
      description: `Your top content is consistently ${topTone[0]}. Posts that drift from this tone perform below your average.`,
      strength,
      evidencePostIds: evidenceIds,
      recommendation: `Write from this voice naturally. Don't perform it — your readers notice when you do.`
    });
  }

  // Top voice trait
  const topTrait = Object.entries(traitCounts).sort((a, b) => b[1] - a[1])[0];
  if (topTrait && topTrait[1] >= 2) {
    const strength = Math.round((topTrait[1] / total) * 100);
    const evidenceIds = top.filter((x) => x.analysis.voiceTraits.includes(topTrait[0])).map((x) => x.post.id);
    patterns.push({
      name: `"${topTrait[0]}" is your signal`,
      description: `The trait that appears most in your high-performing content is being ${topTrait[0]}. It's what makes your posts feel different from generic LinkedIn content.`,
      strength,
      evidencePostIds: evidenceIds,
      recommendation: `Protect this. When you feel like you're being too ${topTrait[0]}, you're probably hitting your strongest voice.`
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Voice detection
// ---------------------------------------------------------------------------

/**
 * @param {import('./types.js').PostAnalysis[]} analyses
 * @param {import('./types.js').PostPerformance[]} performances
 * @returns {import('./types.js').CreatorVoice}
 */
function detectCreatorVoice(analyses, performances) {
  const perfMap = {};
  for (const p of performances) perfMap[p.postId] = p;

  // Weight traits by performance score
  const traitWeights = {};
  const toneWeights = {};
  const formatWeights = {};

  for (const a of analyses) {
    const score = perfMap[a.postId]?.performanceScore || 50;
    const w = score / 100;
    for (const t of a.voiceTraits) {
      traitWeights[t] = (traitWeights[t] || 0) + w;
    }
    toneWeights[a.tone] = (toneWeights[a.tone] || 0) + w;
    formatWeights[a.format] = (formatWeights[a.format] || 0) + w;
  }

  const topTraits = Object.entries(traitWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t.charAt(0).toUpperCase() + t.slice(1));

  const dominantTone = Object.entries(toneWeights).sort((a, b) => b[1] - a[1])[0]?.[0] || "direct";
  const dominantFormat = Object.entries(formatWeights).sort((a, b) => b[1] - a[1])[0]?.[0] || "first-person reflection";

  const strengthMap = {
    specific: "Dropping specific numbers without over-explaining them",
    honest: "Admitting failure or uncertainty before revealing what you learned",
    "evidence-based": "Backing claims with trackable data",
    "non-performative": "Writing that doesn't perform enthusiasm",
    reflective: "Finding the unexpected angle in a familiar experience",
    "self-aware": "Signalling doubt before making a point",
    direct: "Getting to the point fast, without a warm-up paragraph"
  };

  const strengths = topTraits
    .map((t) => strengthMap[t.toLowerCase()])
    .filter(Boolean)
    .slice(0, 3);

  const avoid = [
    "Generic openings ('Excited to share', 'I'm thrilled to announce')",
    "Inspirational endings without a specific example",
    "Advice posts with no proof from your own experience",
    "Posting about posting (meta-content that doesn't deliver)",
    "CTAs that ask for engagement rather than earning it"
  ];

  return { traits: topTraits, strengths, avoid, dominantTone, dominantFormat };
}

// ---------------------------------------------------------------------------
// Recommendation generation
// ---------------------------------------------------------------------------

/**
 * Generate a content recommendation combining all signals.
 * @param {{
 *   sessionSignals?: Object,
 *   linkedInPosts?: import('./types.js').LinkedInPost[],
 *   analyses?: import('./types.js').PostAnalysis[],
 *   performances?: import('./types.js').PostPerformance[],
 *   swipeFile?: import('./types.js').SwipeFileEntry[],
 *   creatorVoice?: import('./types.js').CreatorVoice
 * }} input
 * @returns {import('./types.js').ContentRecommendation}
 */
function generateRecommendationFromPatterns(input) {
  const { linkedInPosts = [], analyses = [], performances = [], swipeFile = [], creatorVoice, sessionSignals } = input;

  if (!linkedInPosts.length && !sessionSignals) {
    return _emptyRecommendation();
  }

  const patterns = analyzeWinningPatterns(linkedInPosts, performances, analyses);
  const voice = creatorVoice || detectCreatorVoice(analyses, performances);

  const perfMap = {};
  for (const p of performances) perfMap[p.postId] = p;

  // Best post by performance score
  const bestPost = linkedInPosts
    .map((p) => ({ post: p, score: perfMap[p.id]?.performanceScore || 0, analysis: analyses.find((a) => a.postId === p.id) }))
    .sort((a, b) => b.score - a.score)[0];

  const primaryHook = bestPost?.analysis?.hookType || (sessionSignals ? "Story" : "Story");
  const primaryTopic = bestPost?.analysis?.topic || "personal insight";
  const primaryTone = voice.dominantTone || "reflective";

  const HOOK_STARTERS = {
    Story: [
      `I didn't expect [result]. The post only had [number] impressions.`,
      `The [thing] that [changed something] wasn't what I planned.`,
      `I almost [quit/deleted/changed] this. I didn't. Here's what happened.`
    ],
    Contrarian: [
      `Most [people/advice] say [X]. Here's what I've seen instead.`,
      `The thing nobody says about [topic]:`,
      `Unpopular: [common belief] is the wrong goal.`
    ],
    "Data-led": [
      `I tracked [X] for [time period]. Here's what the data showed:`,
      `[Number] posts. [Metric]. One pattern kept appearing.`,
      `The [metric] that changed how I think about [topic]:`
    ],
    Listicle: [
      `3 things I stopped doing that made [result]:`,
      `[Number] things I got wrong about [topic] (and what fixed them):`,
      `If I had to start [topic] again:`
    ]
  };

  const hookStarters = HOOK_STARTERS[primaryHook] || HOOK_STARTERS["Story"];
  const sampleHook = hookStarters[0].replace("[topic]", primaryTopic).replace("[X]", primaryTopic);

  // Signal strength based on sample size and pattern consistency
  const sampleSize = linkedInPosts.length;
  const signalStrength = sampleSize >= 10 ? "Strong"
    : sampleSize >= 4 ? "Emerging"
    : "Low sample size";

  // Draft preview
  const draftPreview = _buildDraftPreview(primaryHook, primaryTopic, primaryTone, bestPost?.post);

  // Why statements
  const topPattern = patterns[0];
  const whyFeed = sessionSignals
    ? `Your last session paused most on ${primaryHook} posts about ${primaryTopic}. The engagement pattern is consistent.`
    : `Your feed data isn't available yet — this is based on your imported LinkedIn post history.`;

  const whyVoice = `Your best posts are ${voice.dominantTone} and ${voice.traits[0]?.toLowerCase() || "direct"}. A ${voice.dominantFormat} in this topic fits how you already write at your best.`;

  const whyPast = bestPost
    ? `Your highest-performing post (${bestPost.score} performance score) used the same hook type and topic combination. Your comment rate on ${primaryHook} posts is above your average.`
    : undefined;

  const avoid = [
    ...voice.avoid.slice(0, 3),
    "Don't borrow the exact wording from a saved post — use the structural move, not the sentence",
    "Don't add a CTA — your best posts didn't have one"
  ];

  return {
    title: _titleFromHookAndTopic(primaryHook, primaryTopic),
    format: voice.dominantFormat,
    topic: primaryTopic,
    angle: bestPost?.analysis?.emotionalAngle || "visible result + hidden lesson",
    signalStrength,
    sampleSize,
    sampleHook,
    whyThisFitsYourFeed: whyFeed,
    whyThisFitsYourVoice: whyVoice,
    whyThisFitsYourPastPosts: whyPast,
    draftPreview,
    hookStarters,
    evidence: {
      topPatterns: patterns.map((p) => `${p.name} (strength: ${p.strength}%)`),
      strongestSignals: [
        `${sampleSize} LinkedIn posts analyzed`,
        bestPost ? `Top post score: ${bestPost.score}/100` : null,
        topPattern ? topPattern.description : null,
        `Dominant voice: ${voice.dominantTone}, ${voice.dominantFormat}`
      ].filter(Boolean),
      reasoningSummary: topPattern
        ? topPattern.recommendation
        : `Your writing consistently performs best when it's ${voice.dominantTone} and ${voice.traits[0]?.toLowerCase() || "specific"}.`
    },
    avoid,
    guardrail: topPattern
      ? topPattern.recommendation
      : "Write from your own experience. The specific detail is what makes it yours."
  };
}

// ---------------------------------------------------------------------------
// LLM prompt builder
// ---------------------------------------------------------------------------

/**
 * Build a structured prompt payload for an LLM API call.
 * @param {Object} input
 * @returns {Object}
 */
function buildLLMPrompt(input) {
  const { sessionSignals, linkedInPosts = [], analyses = [], performances = [], creatorVoice, swipeFile = [] } = input;

  const perfMap = {};
  for (const p of performances) perfMap[p.postId] = p;

  const analyzedPosts = linkedInPosts.slice(0, 8).map((post) => {
    const analysis = analyses.find((a) => a.postId === post.id);
    const perf = perfMap[post.id];
    return {
      textPreview: post.text.slice(0, 300),
      date: post.date,
      analysis: analysis || null,
      performanceScore: perf?.performanceScore || null,
      engagementRate: perf ? `${(perf.engagementRate * 100).toFixed(1)}%` : null
    };
  });

  const swipePatterns = swipeFile.map((s) => ({
    topic: s.topic,
    hookType: s.hookType,
    format: s.format,
    reusablePattern: s.reusablePattern,
    whyItWorked: s.whyItWorked
  }));

  return {
    systemInstructions: [
      "You are a creator content strategist for LinkedIn. Analyze the provided signals and generate an evidence-based content recommendation.",
      "HARD RULES:",
      "• Never recommend vague content. Every output must be tied to observed behavior or past post data.",
      "• Never say 'post consistently', 'provide value', or 'engage with your audience'.",
      "• Every hook must connect to a specific detected pattern from the session or post history.",
      "• Always include: why it fits the feed, why it fits the creator's voice, why it fits past post performance.",
      "• Always include one guardrail — a specific thing to avoid.",
      "• Never suggest copying another creator's content. Extract patterns, not wording.",
      "• Avoid fake guru language. Avoid generic LinkedIn-style advice.",
      "• Output valid JSON matching the ContentRecommendation schema exactly.",
      "• Signal strength must be: 'Strong' (10+ posts), 'Emerging' (4–9 posts), or 'Low sample size' (1–3 posts)."
    ].join("\n"),

    sessionSignals: sessionSignals || null,

    importedLinkedInPosts: analyzedPosts,

    creatorVoice: creatorVoice || null,

    swipeFilePatterns: swipePatterns,

    requiredOutputSchema: {
      title: "string — a specific post idea, not a category",
      format: "string — e.g. 'first-person reflection'",
      topic: "string — specific, not 'content' or 'mindset'",
      angle: "string — e.g. 'visible result + hidden mechanism'",
      signalStrength: "'Strong' | 'Emerging' | 'Low sample size'",
      sampleSize: "number — posts analyzed",
      sampleHook: "string — one ready-to-use first line",
      whyThisFitsYourFeed: "string — specific to session behavior",
      whyThisFitsYourVoice: "string — specific to voice traits",
      whyThisFitsYourPastPosts: "string — specific to imported post data",
      draftPreview: "string — a working draft skeleton with [placeholders]",
      hookStarters: "string[] — 3–5 concrete hooks using detected patterns",
      evidence: {
        topPatterns: "string[]",
        strongestSignals: "string[]",
        reasoningSummary: "string"
      },
      avoid: "string[] — 3–5 specific things, not generic advice",
      guardrail: "string — one hard rule for this specific recommendation"
    }
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _titleFromHookAndTopic(hookType, topic) {
  const titles = {
    Story: `The ${topic} post that earned something unexpected`,
    Contrarian: `What most people get wrong about ${topic}`,
    "Data-led": `The ${topic} data nobody talks about`,
    Listicle: `The ${topic} patterns worth keeping`,
    "How-to": `How I approach ${topic} differently now`,
    Question: `The ${topic} question worth sitting with`,
    Statement: `What ${topic} actually requires`
  };
  return titles[hookType] || `A ${topic} post worth writing`;
}

function _buildDraftPreview(hookType, topic, tone, bestPost) {
  const drafts = {
    Story: `[Opening line — one thing that happened, specifically]\n\n[What you expected vs. what actually occurred]\n\n[The thing you noticed that changed how you think about ${topic}]\n\n[One sentence — what this means for how you work now]`,
    Contrarian: `Most people approach ${topic} by [common method].\n\nHere's what I've found instead:\n\n[Your specific observation]\n\n[The implication — one sentence, no fluff]`,
    "Data-led": `I tracked [X] for [time period].\n\nHere's what I found:\n\n• [Data point 1]\n• [Data point 2]\n• [The pattern]\n\n[What this changes about how you think about ${topic}]`,
    Listicle: `[Number] things about ${topic} I had to learn the hard way:\n\n1. [Specific lesson + why it matters]\n2. [Specific lesson + why it matters]\n3. [The one that surprised me most]\n\n[Ending — what you'd tell someone starting out]`
  };
  return drafts[hookType] || drafts["Story"];
}

function _emptyRecommendation() {
  return {
    title: "—",
    format: "—",
    topic: "—",
    angle: "—",
    signalStrength: "Low sample size",
    sampleSize: 0,
    sampleHook: "Import your LinkedIn posts or run a research session to generate a recommendation.",
    whyThisFitsYourFeed: "No session data yet.",
    whyThisFitsYourVoice: "No voice data detected.",
    draftPreview: "",
    hookStarters: [],
    evidence: { topPatterns: [], strongestSignals: [], reasoningSummary: "No data available." },
    avoid: [],
    guardrail: ""
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

window.SiftLinkedIn = {
  calculatePostPerformanceScore,
  analyzePost,
  analyzeWinningPatterns,
  detectCreatorVoice,
  generateRecommendationFromPatterns,
  buildLLMPrompt,
  classifyHook,
  detectTopic
};
