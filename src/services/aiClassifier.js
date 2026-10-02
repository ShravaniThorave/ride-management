// ============================================
// AI CLASSIFIER (Support Ticket classifier)
// ============================================
// Tries Google Gemini first, falls back to regex rules
// so classification works even without a GEMINI_API_KEY.

const CATEGORIES = ['driver_behavior', 'vehicle_issue', 'payment', 'app_bug', 'safety', 'other'];

// Spec priorities. Note: DB ENUM uses "critical" instead of
// "urgent", so callers normalize via SupportTicket.normalizePriority().
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

/**
 * Regex rules per category.
 * Each entry: { category, patterns: RegExp[], priority, keywords: string[] }
 * Priority = default priority when this category matches.
 * Order matters: safety is checked first (highest stakes).
 */
const CATEGORY_RULES = [
    {
        category: 'safety',
        priority: 'urgent',
        patterns: [
            /\b(accident|crash(ed)?|collision)\b/,
            /\b(drunk|drinking|alcohol|drugs?|intoxicat\w*)\b/,
            /\b(harass\w*|assault\w*|abus\w*|threat\w*|attack\w*|stalk\w*|unsafe|scared|fear)\b/,
            /\b(emergency|danger(ous)?|reckless|speeding|overspeed|rash\s*driv)/,
            /\b(hit\s*(me|us|and\s*run)|ran\s*away|kidnap\w*|weapon|knife|gun)\b/,
        ],
    },
    {
        category: 'payment',
        priority: 'high',
        patterns: [
            /\b(overcharg\w*|over\s*charg\w*|extra\s*charg\w*|double\s*charg\w*|wrong\s*(fare|amount|bill))\b/,
            /\b(refund\w*|charg\w*|bill\w*|payment|paid|upi|wallet|card|cash|money|fare|price|cost|deduct\w*|transaction)\b/,
        ],
    },
    {
        category: 'driver_behavior',
        priority: 'high',
        patterns: [
            /\b(rude|misbehav\w*|impolite|shout\w*|yell\w*|smok\w*|argu\w*|fight\w*|late|never\s*came|didn'?t\s*come|refus\w*|denied|cancel(led)?\s*by\s*driver|unprofessional|sleepy|slept|talking\s*rudely)\b/,
            /\bdriver\b.*\b(behav\w*|attitude|manner|language)\b/,
        ],
    },
    {
        category: 'vehicle_issue',
        priority: 'medium',
        patterns: [
            /\b(dirty|unclean|smell\w*|smelly|stink\w*|hygiene|garbage|dust)\b/,
            /\b(broken|damage[sd]?|crack\w*|flat\s*tire|flat\s*tyre|puncture|tyre|tire|brake\w*|engine|headlight|seat\s*belt|door\s*(lock|handle)?)\b/,
            /\b(a\.?\s?c\.?\s*(not\s*working|broken|off)|air\s*condition\w*|no\s*a\.?\s?c\.?|vehicle|car\s*condition|cab\s*condition)\b/,
        ],
    },
    {
        category: 'app_bug',
        priority: 'medium',
        patterns: [
            /\b(app|application)\b.*\b(crash\w*|freeze|frozen|stuck|hang|bug|error|fail\w*|not\s*(working|loading|opening|responding)|blank|glitch)\b/,
            /\b(otp|login|log\s*in|sign\s*in|signup|sign\s*up|verification|map|gps|location|tracking|booking|unable\s*to\s*book|couldn'?t\s*book|payment\s*failed\s*in\s*app)\b/,
        ],
    },
];

/** Urgent-signal override: forces priority to urgent regardless of category. */
const URGENT_PATTERNS = [
    /\b(emergency|urgent|immediately|asap|right\s*now)\b/,
    /\b(accident|assault\w*|harass\w*|threat\w*|drunk|weapon|unsafe|danger)\b/,
];

/** High-signal: bumps low/medium up to high. */
const HIGH_PATTERNS = [/\b(overcharg\w*|refund|fraud|scam|cheat\w*|rude|abus\w*|refus\w*)\b/];

/** Low-signal: minor issues default to low when nothing stronger matches. */
const LOW_PATTERNS = [/\b(suggestion|feedback|minor|small\s*issue|slow|typo|ui|colour|color\s*theme)\b/];

/**
 * Regex-based classification (no API key needed).
 * Returns { category, priority, keywords }.
 */
function regexClassify(description = '') {
    const text = String(description).toLowerCase();
    const keywords = extractKeywords(text);

    let matchedCategory = 'other';
    let priority = 'low';

    for (const rule of CATEGORY_RULES) {
        if (rule.patterns.some((re) => re.test(text))) {
            matchedCategory = rule.category;
            priority = rule.priority;
            break;
        }
    }

    // Default priority for "other"
    if (matchedCategory === 'other') {
        priority = 'medium';
    }

    // Priority overrides
    if (URGENT_PATTERNS.some((re) => re.test(text))) {
        priority = 'urgent';
    } else if (HIGH_PATTERNS.some((re) => re.test(text))) {
        if (priority === 'low' || priority === 'medium') priority = 'high';
    } else if (matchedCategory === 'other' && LOW_PATTERNS.some((re) => re.test(text))) {
        priority = 'low';
    } else if (matchedCategory === 'app_bug' && LOW_PATTERNS.some((re) => re.test(text))) {
        priority = 'low';
    }

    return { category: matchedCategory, priority, keywords };
}

/**
 * Extract keyword tokens: matched domain words + significant words.
 * Returns unique lowercase keywords (max 10).
 */
function extractKeywords(lowerText) {
    const domainWords = [
        // safety
        'accident', 'crash', 'drunk', 'harassment', 'assault', 'threat', 'unsafe', 'reckless', 'speeding', 'emergency', 'danger',
        // payment
        'overcharge', 'refund', 'charged', 'fare', 'payment', 'billing', 'wallet', 'upi', 'card', 'money',
        // driver
        'rude', 'misbehaved', 'late', 'refused', 'cancelled', 'driver', 'behavior',
        // vehicle
        'dirty', 'smell', 'broken', 'ac', 'seat', 'tyre', 'tire', 'vehicle', 'car',
        // app
        'app', 'crash', 'bug', 'error', 'stuck', 'login', 'otp', 'map', 'gps', 'booking',
    ];

    const found = [];
    for (const word of domainWords) {
        if (lowerText.includes(word) && !found.includes(word)) {
            found.push(word);
        }
    }

    // Top up with significant words from the text (len >= 4, not stopwords)
    const stopwords = new Set([
        'this', 'that', 'with', 'from', 'have', 'has', 'was', 'were', 'been', 'the', 'and', 'for', 'are', 'but',
        'not', 'you', 'your', 'they', 'them', 'then', 'than', 'when', 'what', 'which', 'ride', 'booked',
    ]);
    const tokens = lowerText.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (const token of tokens) {
        if (found.length >= 10) break;
        if (token.length >= 4 && !stopwords.has(token) && !found.includes(token)) {
            // Only add topical words (skip pure filler)
            found.push(token);
        }
        if (found.length >= 10) break;
    }

    return found.slice(0, 10);
}

/**
 * Call Gemini to classify (if API key configured).
 * Returns { category, priority, keywords } or null on failure / no key.
 */
async function getGeminiClassification(description) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'later' || apiKey === 'test') return null;

    try {
        // Lazy require so app boots even if install quirks occur
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        const prompt =
            'You are a support ticket classifier for a ride management app.\n' +
            `Categories: ${CATEGORIES.join(', ')}.\n` +
            `Priorities: ${PRIORITIES.join(', ')} (use "urgent" only for safety/emergency issues).\n` +
            'Classify the complaint below. Respond with ONLY valid JSON, no markdown, no extra text, ' +
            'in exactly this shape: {"category": "<one of the categories>", "priority": "<one of the priorities>", "keywords": ["<up to 5 lowercase keywords>"]}.\n\n' +
            `Complaint: ${description}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
        });
        const text = (response.text || '').trim();
        if (!text) return null;

        // Strip code fences if the model adds them despite instructions
        const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(jsonStr);

        const category = CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
        const priority = PRIORITIES.includes(parsed.priority) ? parsed.priority : 'medium';
        const keywords = Array.isArray(parsed.keywords)
            ? [...new Set(parsed.keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean))].slice(0, 10)
            : [];

        return { category, priority, keywords };
    } catch (err) {
        console.error('Gemini classification failed, using regex fallback:', err.message);
        return null;
    }
}

/**
 * Classify a support issue description.
 * Uses Gemini API when GEMINI_API_KEY is set, otherwise regex rules.
 *
 * @param {string} description - complaint text
 * @returns {Promise<{category: string, priority: string, keywords: string[]}>}
 */
async function classifyIssue(description) {
    if (!description || !String(description).trim()) {
        throw new Error('description is required for classification');
    }

    const text = String(description).trim();

    const geminiResult = await getGeminiClassification(text);
    if (geminiResult) return geminiResult;

    return regexClassify(text);
}

module.exports = { classifyIssue, regexClassify, getGeminiClassification, CATEGORIES, PRIORITIES };
