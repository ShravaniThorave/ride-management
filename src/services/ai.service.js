// ============================================
// AI SERVICE (Ride Assistant brain)
// ============================================
// Tries Google Gemini first, falls back to rule-based answers
// so the endpoint works even without a GEMINI_API_KEY.

/**
 * Parse user query into an intent using lightweight regex.
 * Returns { intent, rideId, limit }
 *
 * Intents:
 * - help, greeting, list_rides, active_rides, ride_status,
 *   ride_by_id, ride_fare, stats, cancelled, completed
 */
function parseIntent(query = '') {
    const q = query.toLowerCase().trim();

    const idMatch = q.match(/(?:ride\s*(?:id|no|number|#)?\s*[:#]?\s*(\d+))|(?:#\s*(\d+))/);
    const rideId = idMatch ? Number(idMatch[1] || idMatch[2]) : null;

    if (/^(hi|hello|hey|namaste)\b/.test(q) && q.length < 30) return { intent: 'greeting', rideId };
    if (/help|what can you|how (do|can) (i|you)|options|commands/.test(q)) return { intent: 'help', rideId };
    if (/active|current|ongoing|in.?progress|where.*(driver|ride)|track/.test(q)) return { intent: 'active_rides', rideId };
    if (/cancel/.test(q)) return { intent: 'cancelled', rideId };
    if (/complet|finish|past|history|all.*rides|my rides|last rides|recent/.test(q)) {
        if (/complet|past|history/.test(q)) return { intent: 'completed', rideId };
        return { intent: 'list_rides', rideId };
    }
    if (/(fare|price|cost|charge|spent|paid|earning)/.test(q)) return { intent: 'ride_fare', rideId };
    if (/(status|where|when|pickup|drop|destination|driver)/.test(q)) return { intent: 'ride_status', rideId };
    if (/(summary|stats|total|how many|count)/.test(q)) return { intent: 'stats', rideId };
    if (rideId) return { intent: 'ride_by_id', rideId };

    const limitMatch = q.match(/(last|show|give|list)\s+(\d+)/);
    const limit = limitMatch ? Math.min(Number(limitMatch[2]), 20) : 5;
    return { intent: 'list_rides', rideId, limit };
}

/**
 * Build a compact text context of rides for the LLM prompt.
 */
function buildRideContext(rides = [], stats = null) {
    if (!rides.length) return 'No rides found for this user.';
    return rides
        .slice(0, 10)
        .map(
            (r) =>
                `Ride #${r.id}: ${r.pickup_location} -> ${r.dropoff_location}, ` +
                `status=${r.status}, fare=${r.final_fare ?? r.base_fare ?? 'N/A'}, ` +
                `driver=${r.driver_name || 'unassigned'}, date=${r.created_at}`
        )
        .join('\n') + (stats ? `\nStats: ${JSON.stringify(stats)}` : '');
}

/**
 * Rule-based answer generator (no API key needed).
 */
function ruleBasedAnswer(intent, rides, stats, singleRide) {
    const fmt = (r) =>
        `#${r.id} ${r.pickup_location} → ${r.dropoff_location} [${r.status}]` +
        ` fare ₹${r.final_fare ?? r.base_fare ?? 'N/A'}` +
        (r.driver_name ? ` driver: ${r.driver_name}` : '');

    switch (intent) {
        case 'greeting':
            return 'Hello! I am your Ride Assistant. Ask me about your rides, e.g. "show my last 5 rides", "where is my active ride?", or "what is the fare of ride #3?"';
        case 'help':
            return 'I can help with: my rides / active ride / ride #<id> status / fare of ride #<id> / completed rides / cancelled rides / my ride stats. Try: "show my recent rides".';
        case 'active_rides':
            if (!rides.length) return 'You have no active rides right now (no requested/accepted/started rides).';
            return `You have ${rides.length} active ride(s):\n` + rides.map(fmt).join('\n');
        case 'ride_by_id':
        case 'ride_status':
            if (!singleRide) return 'I could not find that ride for your account. Check the ride ID and try again.';
            return (
                `Ride #${singleRide.id}: ${singleRide.pickup_location} → ${singleRide.dropoff_location}\n` +
                `Status: ${singleRide.status}\n` +
                `Driver: ${singleRide.driver_name || 'not assigned yet'}` +
                (singleRide.license_plate ? ` (${singleRide.vehicle_type}, ${singleRide.license_plate})` : '') +
                `\nFare: ₹${singleRide.final_fare ?? singleRide.base_fare ?? 'N/A'}`
            );
        case 'ride_fare':
            if (singleRide) return `Fare for ride #${singleRide.id} is ₹${singleRide.final_fare ?? singleRide.base_fare ?? 'N/A'} (status: ${singleRide.status}).`;
            if (!rides.length) return 'No rides found, so no fare info available.';
            return 'Recent fares:\n' + rides.slice(0, 5).map(fmt).join('\n');
        case 'completed':
            if (!rides.length) return 'You have no completed rides yet.';
            return `Completed rides (${rides.length}):\n` + rides.map(fmt).join('\n');
        case 'cancelled':
            if (!rides.length) return 'You have no cancelled rides.';
            return `Cancelled rides (${rides.length}):\n` + rides.map(fmt).join('\n');
        case 'stats':
            if (!stats) return 'No stats available yet.';
            return `Your ride summary: ${stats.total} total, ${stats.active} active, ${stats.completed} completed, ${stats.cancelled} cancelled. Total spent: ₹${stats.totalSpent}.`;
        case 'list_rides':
        default:
            if (!rides.length) return 'No rides found for your account yet. Book a ride to get started!';
            return `Here are your recent rides:\n` + rides.map(fmt).join('\n');
    }
}

/**
 * Call Gemini (if API key configured). Returns string or null on failure.
 */
async function getGeminiAnswer(query, contextText) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'later' || apiKey === 'test') return null;

    try {
        // Lazy require so app boots even if ESM-only install quirks occur
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        const prompt =
            'You are a helpful Ride Management assistant. ' +
            'Answer the user query using ONLY the ride data below. ' +
            'Be concise, friendly, use ₹ for fares.\n\n' +
            `Ride data:\n${contextText}\n\nUser query: ${query}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
        });
        return response.text || null;
    } catch (err) {
        console.error('Gemini call failed, using fallback:', err.message);
        return null;
    }
}

/**
 * Main entry: resolve intent -> fetch done by controller, compose answer.
 * Returns { intent, answer, source: 'gemini' | 'rule-based' }
 */
async function answerQuery(query, { rides = [], stats = null, singleRide = null } = {}) {
    const { intent, rideId, limit } = parseIntent(query);
    const fallback = ruleBasedAnswer(intent, rides, stats, singleRide);

    const contextText = singleRide
        ? buildRideContext([singleRide], stats)
        : buildRideContext(rides, stats);

    const geminiText = await getGeminiAnswer(query, contextText);
    if (geminiText) return { intent, answer: geminiText, source: 'gemini', rideId, limit };
    return { intent, answer: fallback, source: 'rule-based', rideId, limit };
}

module.exports = { parseIntent, buildRideContext, ruleBasedAnswer, getGeminiAnswer, answerQuery };
