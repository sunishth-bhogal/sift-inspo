/**
 * Sift — Type definitions (JSDoc)
 * All types used across the recommendation pipeline and UI.
 */

/**
 * @typedef {Object} LinkedInPost
 * @property {string} id
 * @property {string} text
 * @property {string} [url]
 * @property {string} date           - ISO date string
 * @property {number} [impressions]
 * @property {number} [reactions]
 * @property {number} [comments]
 * @property {number} [reposts]
 * @property {number} [profileViews]
 * @property {number} [newFollowers]
 */

/**
 * @typedef {Object} PostAnalysis
 * @property {string} postId
 * @property {string} topic
 * @property {string} format         - e.g. "first-person reflection"
 * @property {string} hookType       - Question|Story|Listicle|Contrarian|Data-led|How-to|Imperative|Statement
 * @property {string} tone           - reflective|direct|tactical|personal
 * @property {string} structure      - e.g. "hook → tension → resolution"
 * @property {string} emotionalAngle - e.g. "visible result + hidden lesson"
 * @property {number} specificity    - 0–3
 * @property {number} proofLevel     - 0–3
 * @property {string} ctaType        - implicit|question|follow|save|none
 * @property {string[]} voiceTraits
 */

/**
 * @typedef {Object} PostPerformance
 * @property {string} postId
 * @property {number} engagementRate         - (reactions+comments+reposts) / impressions
 * @property {number} commentRate            - comments / impressions
 * @property {number} repostRate             - reposts / impressions
 * @property {number} followerConversionRate - newFollowers / impressions
 * @property {number} performanceScore       - 0–100 composite
 */

/**
 * @typedef {Object} CreatorPattern
 * @property {string} name
 * @property {string} description
 * @property {number} strength       - 0–100
 * @property {string[]} evidencePostIds
 * @property {string} recommendation
 */

/**
 * @typedef {Object} SwipeFileEntry
 * @property {string} id
 * @property {string} source         - "linkedin" | "x" | "manual"
 * @property {string} [author]
 * @property {string} text
 * @property {string} topic
 * @property {string} hookType
 * @property {string} format
 * @property {string} whyItWorked
 * @property {string} reusablePattern
 * @property {string} savedAt        - ISO date string
 */

/**
 * @typedef {Object} ContentRecommendation
 * @property {string} title
 * @property {string} format
 * @property {string} topic
 * @property {string} angle
 * @property {string} signalStrength  - "Strong" | "Emerging" | "Low sample size"
 * @property {number} sampleSize      - number of posts analyzed
 * @property {string} sampleHook
 * @property {string} whyThisFitsYourFeed
 * @property {string} whyThisFitsYourVoice
 * @property {string} [whyThisFitsYourPastPosts]
 * @property {string} draftPreview
 * @property {string[]} hookStarters
 * @property {RecommendationEvidence} evidence
 * @property {string[]} avoid
 * @property {string} guardrail
 */

/**
 * @typedef {Object} RecommendationEvidence
 * @property {string[]} topPatterns
 * @property {string[]} strongestSignals
 * @property {string} reasoningSummary
 */

/**
 * @typedef {Object} CreatorVoice
 * @property {string[]} traits
 * @property {string[]} strengths
 * @property {string[]} avoid
 * @property {string} dominantTone
 * @property {string} dominantFormat
 */
