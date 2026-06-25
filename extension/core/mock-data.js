/**
 * Sift — Mock / demo data
 * Makes the UI feel real before live LinkedIn or session data exists.
 * Exposed as window.SiftMock
 */

/** @type {import('./types.js').LinkedInPost[]} */
const MOCK_LINKEDIN_POSTS = [
  {
    id: "li_001",
    text: "I got my first LinkedIn DM from a hiring manager 6 weeks after I started posting consistently.\n\nNot because I had a big audience.\nNot because I went viral.\n\nBecause I wrote one post that showed exactly how I think through a problem — and it matched what they were looking for.\n\nThe post had 847 impressions. That's it.\n\nSometimes the right 847 people beat 847,000 random ones.",
    date: "2025-05-12",
    impressions: 847,
    reactions: 94,
    comments: 31,
    reposts: 12,
    profileViews: 203,
    newFollowers: 18
  },
  {
    id: "li_002",
    text: "3 things I stopped doing on LinkedIn that made my posts actually work:\n\n1. Stopped starting with \"I'm excited to share\"\n2. Stopped writing for recruiters when I wanted to attract builders\n3. Stopped adding a CTA to every post\n\nThe posts that did the most for me felt more like notes to myself than content.\n\nMaybe that's the insight.",
    date: "2025-05-03",
    impressions: 2340,
    reactions: 187,
    comments: 52,
    reposts: 34,
    profileViews: 411,
    newFollowers: 29
  },
  {
    id: "li_003",
    text: "Hot take: the best LinkedIn posts aren't optimized for LinkedIn.\n\nThey're optimized for one person reading them at 11pm who needed to hear exactly that.\n\nWrite for that person.\nThe algorithm figures itself out.",
    date: "2025-04-28",
    impressions: 5120,
    reactions: 412,
    comments: 88,
    reposts: 71,
    profileViews: 892,
    newFollowers: 64
  },
  {
    id: "li_004",
    text: "What nobody tells you about building in public:\n\nYou'll get more useful feedback from 200 engaged followers than from a post that reaches 20,000 people who don't care.\n\nI tracked this across 3 months of posts.\n\nEngagement rate on posts under 1,000 impressions: 14.2%\nEngagement rate on posts over 10,000 impressions: 3.1%\n\nSmaller and more right beats bigger and more random.",
    date: "2025-04-15",
    impressions: 3870,
    reactions: 298,
    comments: 74,
    reposts: 43,
    profileViews: 634,
    newFollowers: 41
  },
  {
    id: "li_005",
    text: "I deleted my best-performing post last year.\n\n11k impressions. 340 reactions. It felt off.\n\nBecause I didn't actually believe what I wrote — I wrote what I thought LinkedIn wanted.\n\nThe posts I kept? Much smaller numbers. But every comment was from someone I wanted to know.\n\nAudience fit > audience size. Every time.",
    date: "2025-04-02",
    impressions: 1920,
    reactions: 156,
    comments: 47,
    reposts: 19,
    profileViews: 318,
    newFollowers: 22
  }
];

/** @type {import('./types.js').PostAnalysis[]} */
const MOCK_POST_ANALYSES = [
  {
    postId: "li_001",
    topic: "career milestones",
    format: "first-person reflection",
    hookType: "Story",
    tone: "reflective",
    structure: "result → counterintuitive lesson → reframe",
    emotionalAngle: "visible outcome + hidden mechanism",
    specificity: 3,
    proofLevel: 2,
    ctaType: "implicit",
    voiceTraits: ["understated", "specific", "non-braggy"]
  },
  {
    postId: "li_002",
    topic: "content strategy",
    format: "structured breakdown",
    hookType: "Listicle",
    tone: "direct",
    structure: "list → pattern → compressed insight",
    emotionalAngle: "what I stopped doing → why it worked",
    specificity: 2,
    proofLevel: 1,
    ctaType: "implicit",
    voiceTraits: ["direct", "self-aware", "anti-guru"]
  },
  {
    postId: "li_003",
    topic: "creator mindset",
    format: "contrarian take",
    hookType: "Contrarian",
    tone: "direct",
    structure: "hot take → reframe → one-line resolution",
    emotionalAngle: "platform expectation vs. human truth",
    specificity: 1,
    proofLevel: 0,
    ctaType: "implicit",
    voiceTraits: ["punchy", "counter-cultural", "empathetic"]
  },
  {
    postId: "li_004",
    topic: "building in public",
    format: "proof-backed insight",
    hookType: "Data-led",
    tone: "tactical",
    structure: "claim → data → interpretation",
    emotionalAngle: "bigger isn't better + proof",
    specificity: 3,
    proofLevel: 3,
    ctaType: "implicit",
    voiceTraits: ["evidence-based", "specific", "builder-focused"]
  },
  {
    postId: "li_005",
    topic: "audience building",
    format: "first-person reflection",
    hookType: "Story",
    tone: "reflective",
    structure: "surprising action → numbers → real reason → belief",
    emotionalAngle: "integrity over vanity metrics",
    specificity: 3,
    proofLevel: 2,
    ctaType: "none",
    voiceTraits: ["honest", "values-driven", "non-performative"]
  }
];

/** @type {import('./types.js').PostPerformance[]} */
const MOCK_PERFORMANCES = [
  { postId: "li_001", engagementRate: 0.163, commentRate: 0.037, repostRate: 0.014, followerConversionRate: 0.021, performanceScore: 71 },
  { postId: "li_002", engagementRate: 0.117, commentRate: 0.022, repostRate: 0.015, followerConversionRate: 0.012, performanceScore: 63 },
  { postId: "li_003", engagementRate: 0.112, commentRate: 0.017, repostRate: 0.014, followerConversionRate: 0.013, performanceScore: 79 },
  { postId: "li_004", engagementRate: 0.107, commentRate: 0.019, repostRate: 0.011, followerConversionRate: 0.011, performanceScore: 68 },
  { postId: "li_005", engagementRate: 0.115, commentRate: 0.024, repostRate: 0.010, followerConversionRate: 0.011, performanceScore: 65 }
];

/** @type {import('./types.js').SwipeFileEntry[]} */
const MOCK_SWIPE_FILE = [
  {
    id: "sw_001",
    source: "linkedin",
    author: "Unknown creator",
    text: "I almost quit 3 times before my business worked.\n\nThe first time: no customers after 6 months.\nThe second time: a customer asked for a refund.\nThe third time: I compared my month 8 to someone else's year 3.\n\nWhat kept me going wasn't confidence. It was curiosity about what would happen if I didn't stop.",
    topic: "entrepreneurship",
    hookType: "Story",
    format: "first-person reflection",
    whyItWorked: "Specific numbered setbacks make the struggle real without being vague. 'Curiosity' reframe is unexpected.",
    reusablePattern: "3 specific failure moments → unexpected reframe of what kept you going",
    savedAt: "2025-05-10T14:22:00Z"
  },
  {
    id: "sw_002",
    source: "linkedin",
    author: "Unknown creator",
    text: "The difference between a post that gets 200 impressions and one that gets 20,000:\n\nNot the topic.\nNot the length.\nNot the time of day.\n\nThe first line.",
    topic: "content strategy",
    hookType: "Contrarian",
    format: "contrarian take",
    whyItWorked: "Subverts the expected list of variables. Short. Creates instant curiosity about the answer.",
    reusablePattern: "Not X, not Y, not Z → it's [unexpected single thing]",
    savedAt: "2025-05-08T09:11:00Z"
  },
  {
    id: "sw_003",
    source: "x",
    author: "Unknown creator",
    text: "Unpopular opinion: most LinkedIn advice is written by people who got lucky once and decided it was a system.\n\nThe actual system: write something true, be specific, do it long enough to find your people.\n\nThat's it.",
    topic: "creator mindset",
    hookType: "Contrarian",
    format: "contrarian take",
    whyItWorked: "Calls out the meta without being preachy. Offers a replacement that sounds obvious but isn't.",
    reusablePattern: "Expose a false system → replace it with one honest sentence",
    savedAt: "2025-05-05T16:44:00Z"
  },
  {
    id: "sw_004",
    source: "linkedin",
    author: "Unknown creator",
    text: "I tracked every LinkedIn post I published for 6 months.\n\nThe 3 things that predicted high engagement every time:\n• First line that didn't explain itself\n• A number or specific detail in the first 3 lines\n• An ending that didn't try to inspire anyone",
    topic: "content strategy",
    hookType: "Data-led",
    format: "proof-backed insight",
    whyItWorked: "6-month tracking makes it credible. The three factors are specific and go against conventional advice.",
    reusablePattern: "Tracked X for Y time → here's the non-obvious pattern the data showed",
    savedAt: "2025-04-29T11:30:00Z"
  },
  {
    id: "sw_005",
    source: "linkedin",
    author: "Unknown creator",
    text: "My first 10 LinkedIn posts got 0 comments.\n\nMy 11th got 3. One was from someone who became a client 4 months later.\n\nYou don't know which post is the 11th until you write it.",
    topic: "career milestones",
    hookType: "Story",
    format: "first-person reflection",
    whyItWorked: "Concrete numbers make the story real. The punchline reframes consistency as uncertainty tolerance, not willpower.",
    reusablePattern: "Specific failure sequence → one unexpected result → insight about what the sequence actually requires",
    savedAt: "2025-04-21T08:15:00Z"
  }
];

/** @type {import('./types.js').CreatorPattern[]} */
const MOCK_PATTERNS = [
  {
    name: "Understated proof",
    description: "Specific numbers or results dropped without fanfare — the restraint is what makes readers trust it.",
    strength: 88,
    evidencePostIds: ["li_001", "li_004", "li_005"],
    recommendation: "Lead with the result, then let it sit. Don't explain why it's impressive."
  },
  {
    name: "Anti-guru reframe",
    description: "Calling out conventional advice before replacing it with something more honest.",
    strength: 76,
    evidencePostIds: ["li_002", "li_003"],
    recommendation: "Name the bad advice first — make the reader feel seen — then land your version."
  },
  {
    name: "One-line resolution",
    description: "Posts that end with a single compressed belief rather than a call to action.",
    strength: 82,
    evidencePostIds: ["li_003", "li_005", "sw_003"],
    recommendation: "Cut your last paragraph. See if the sentence before it is actually the real ending."
  }
];

/** @type {import('./types.js').ContentRecommendation} */
const MOCK_RECOMMENDATION = {
  title: "The post that earned something unexpected",
  format: "first-person reflection",
  topic: "career milestones",
  angle: "visible result + hidden mechanism",
  signalStrength: "Strong",
  sampleSize: 5,
  sampleHook: "I didn't expect the DM. The post only had 847 impressions. But it reached exactly the right person.",
  whyThisFitsYourFeed: "Your last 3 sessions consistently paused on first-person Story posts with specific numbers and understated outcomes. The pattern is clear: your feed rewards restraint over performance.",
  whyThisFitsYourVoice: "Your top-performing posts share one trait — they never brag. They show a result and let the reader decide what it means. This format matches that instinct.",
  whyThisFitsYourPastPosts: "Your highest-engagement posts (li_001, li_005) both used the 'small number + right person' structure. Your comment rate on these was 3.7% vs a 1.8% average — readers responded with something personal, not just a like.",
  draftPreview: `I didn't expect the DM.

The post had 847 impressions — nothing by LinkedIn standards.

But it was the one where I actually showed how I think, not just what I did.

[Your specific moment here — one detail that made the outcome feel real]

The right 847 people beat 847,000 random ones.

Not every time. But often enough to keep writing like this.`,
  hookStarters: [
    "I didn't expect [result]. The post only had [small number] impressions.",
    "The post that [unexpected outcome] wasn't my most-viewed. It was my most honest.",
    "[Small number] people saw it. One of them [changed something].",
    "I wrote it for one person. I don't know who they were. But I think they found it."
  ],
  evidence: {
    topPatterns: ["Hook type: Story (3/5 top posts)", "Tone: reflective (4/5 top posts)", "Topic: career milestones + proof"],
    strongestSignals: [
      "5 imported posts analyzed",
      "Average engagement rate: 11.4% (3.2× LinkedIn average)",
      "Comment rate peaks on Story + specific-number posts",
      "Your highest follower conversion came from li_001 (2.1%)"
    ],
    reasoningSummary: "Your data shows a consistent pattern: posts with specific small numbers + understated outcomes outperform posts with broad claims. This recommendation extends that pattern into a new angle you haven't tried yet."
  },
  avoid: [
    "Don't open with 'I'm excited to share' or 'Hot take:'",
    "Don't explain why the result is impressive — let the number do the work",
    "Don't add a CTA — your best posts ended without one",
    "Don't borrow the structure of a post you saved — extract the pattern, not the sentence",
    "Avoid ending with a question asking for engagement"
  ],
  guardrail: "Use your own result. The specific number matters more than a big one."
};

/** @type {import('./types.js').CreatorVoice} */
const MOCK_CREATOR_VOICE = {
  traits: ["Understated", "Specific", "Self-aware", "Non-performative", "Honest"],
  strengths: [
    "Restraint — you never over-explain",
    "Proof — you drop numbers without making them the point",
    "Reframes — you find the unexpected angle on common experiences"
  ],
  avoid: [
    "Generic openings ('Excited to share', 'Hot take:')",
    "Inspirational endings with no specificity",
    "Posting about posting",
    "Borrowed credibility without your own proof"
  ],
  dominantTone: "reflective",
  dominantFormat: "first-person reflection"
};

window.SiftMock = {
  linkedInPosts: MOCK_LINKEDIN_POSTS,
  postAnalyses: MOCK_POST_ANALYSES,
  performances: MOCK_PERFORMANCES,
  swipeFile: MOCK_SWIPE_FILE,
  patterns: MOCK_PATTERNS,
  recommendation: MOCK_RECOMMENDATION,
  creatorVoice: MOCK_CREATOR_VOICE
};
