/**
 * parser.js
 * -----------------------------------------------------------------------
 * Free-text meal/workout entry parser for the offline-first mobile tracker.
 *
 * Given a single sentence like:
 *   "had 2 rotis with dal tadka and did 20 pushups and 3 sets of bench press 60kg 10 reps"
 *
 * this module returns a normalized array of entry items (food + workout),
 * each with calories/macros or calorie-burn already computed, plus a
 * confidence score that flags low-confidence matches for manual review.
 *
 * Two pipelines are implemented:
 *   1. ONLINE  -> proxies the raw text to a backend endpoint that calls the
 *                 Claude API for typo-correction + entity extraction.
 *   2. OFFLINE -> tokenizes the text and fuzzy-matches it against the local
 *                 food_library / workout_library using Fuse.js. Works with
 *                 zero network connectivity, which is the app's baseline.
 *
 * Dependencies (loaded as globals via <script> tags, same as db-setup.js):
 *   - Fuse.js  (window.Fuse)
 *   - db-setup.js (window.FOOD_LIBRARY_SEED / window.WORKOUT_LIBRARY_SEED,
 *                  or pass your own arrays in via options)
 *
 * Usage:
 *   import { parseEntryText } from './parser.js';
 *   const result = await parseEntryText(rawText, { userWeightKg: 72 });
 *   // result.items -> [{ type: 'food', ... }, { type: 'workout', ... }]
 *   // result.needs_manual_override -> true if any item is low-confidence
 * -----------------------------------------------------------------------
 */

// =========================================================================
// 0. CONSTANTS
// =========================================================================

/** Below this confidence, an item is flagged for manual user confirmation. */
const CONFIDENCE_THRESHOLD = 0.85;

/**
 * Calibration constant for the rep-based energy formula:
 *   Burn = Sets * Reps * (Bodyweight_kg * ratio + External_kg) * WORK_FACTOR
 * WORK_FACTOR approximates kcal expended per kg of effective load moved per
 * rep. This is a tunable constant, not a lab-measured universal value --
 * treat it as a starting point and adjust against real logged data (e.g. a
 * settings/calibration screen) as you collect ground truth.
 *
 * Calibrated so a 72kg person doing 20 standard pushups (bodyweight_ratio
 * 0.64, load ~46kg) lands around ~8 kcal, and 3x10 barbell bench press at
 * 60kg (load = 60kg external, no bodyweight displacement) lands around
 * ~16 kcal -- both in line with commonly cited per-set strength-training
 * burn estimates.
 */
const DEFAULT_WORK_FACTOR = 0.009;

/** Fallback bodyweight (kg) used only if no user profile weight is available. */
const DEFAULT_USER_WEIGHT_KG = 70;

/** Fuse.js tuning: lower threshold = stricter fuzzy match. */
const PHRASE_MATCH_OPTIONS = { threshold: 0.4, ignoreLocation: true, includeScore: true };
const TOKEN_MATCH_OPTIONS = { threshold: 0.3, ignoreLocation: true, includeScore: true };

const FILLER_PREFIXES = /^(had|ate|eat|eaten|did|do|done|performed|took|drank|drink)\s+/i;
const FILLER_CONNECTORS = /\bwith\b/gi;

// =========================================================================
// 1. TOKENIZATION + QUANTITY EXTRACTION
// =========================================================================

/** Lowercase, strip punctuation (keep decimals), collapse whitespace. */
function tokenizePhrase(phrase) {
  return phrase
    .toLowerCase()
    .replace(/[^\w\s.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Splits a full free-text entry into per-item segments.
 * "2 rotis with dal tadka and did 20 pushups" ->
 *   ["2 rotis", "dal tadka", "did 20 pushups"]
 */
function segmentText(text) {
  return text
    .replace(FILLER_CONNECTORS, ' and ')
    .split(/,| and /gi)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripFillerWords(segment) {
  return segment.replace(FILLER_PREFIXES, '').trim();
}

/**
 * Pulls structured quantity signals (sets, reps, weight, grams, ml, duration,
 * plain count) out of a segment, returning the leftover "name" text to match
 * against the food/workout libraries.
 *
 * Handles: "3 sets of bench press 60kg 10 reps", "100g", "2 rotis",
 * "20 pushups", "30 mins", "1.5 hrs".
 */
function extractQuantities(rawSegment) {
  let text = ` ${rawSegment} `;
  const info = {
    sets: null,
    reps: null,
    weight_kg: null,
    grams: null,
    ml: null,
    duration_minutes: null,
    raw_number: null, // ambiguous leading count, resolved later by item type
  };

  const consume = (regex, assign) => {
    const m = text.match(regex);
    if (m) {
      assign(m);
      text = text.replace(m[0], ' ');
    }
  };

  consume(/(\d+(?:\.\d+)?)\s*sets?\b/i, (m) => { info.sets = parseFloat(m[1]); });
  consume(/(\d+(?:\.\d+)?)\s*reps?\b/i, (m) => { info.reps = parseFloat(m[1]); });
  consume(/(\d+(?:\.\d+)?)\s*kgs?\b/i, (m) => { info.weight_kg = parseFloat(m[1]); });
  consume(/(\d+(?:\.\d+)?)\s*(?:grams?|g)\b/i, (m) => { info.grams = parseFloat(m[1]); });
  consume(/(\d+(?:\.\d+)?)\s*(?:millilitres?|ml)\b/i, (m) => { info.ml = parseFloat(m[1]); });

  consume(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/i, (m) => {
    info.duration_minutes = (info.duration_minutes || 0) + parseFloat(m[1]) * 60;
  });
  consume(/(\d+(?:\.\d+)?)\s*(?:mins?|minutes?)\b/i, (m) => {
    info.duration_minutes = (info.duration_minutes || 0) + parseFloat(m[1]);
  });

  text = text.replace(/\bof\b/gi, ' ');

  // Whatever numeric value is left over is an ambiguous count -- e.g. "2" in
  // "2 rotis" (food multiplier) or "20" in "20 pushups" (rep count).
  consume(/(\d+(?:\.\d+)?)/, (m) => { info.raw_number = parseFloat(m[1]); });

  // Serving-container words describe *how much*, not *what* -- strip them so
  // they don't dilute the fuzzy match against the dish/exercise name itself
  // (e.g. "1 bowl poha" should match on "poha", not "bowl poha").
  text = text.replace(/\b(bowls?|pieces?|cups?|plates?|glass(?:es)?|servings?)\b/gi, ' ');

  const cleanedName = text.replace(/\s+/g, ' ').trim();
  return { info, cleanedName };
}

// =========================================================================
// 2. OFFLINE PIPELINE -- FUSE.JS FUZZY MATCHING
// =========================================================================

/**
 * Builds all the Fuse.js indexes needed for offline parsing:
 *  - a token-level vocabulary index (for per-word typo correction)
 *  - phrase-level indexes over food_library and workout_library
 */
function buildOfflineIndexes(foodLibrary, workoutLibrary) {
  const vocabSet = new Set();
  foodLibrary.forEach((f) => {
    tokenizePhrase(f.name).forEach((t) => vocabSet.add(t));
    (f.local_names || []).forEach((ln) => tokenizePhrase(ln).forEach((t) => vocabSet.add(t)));
  });
  workoutLibrary.forEach((w) => tokenizePhrase(w.name).forEach((t) => vocabSet.add(t)));

  const vocabFuse = new Fuse(
    Array.from(vocabSet).map((word) => ({ word })),
    { keys: ['word'], ...TOKEN_MATCH_OPTIONS }
  );

  const foodFuse = new Fuse(foodLibrary, {
    keys: [{ name: 'name', weight: 0.7 }, { name: 'local_names', weight: 0.3 }],
    ...PHRASE_MATCH_OPTIONS,
  });

  const workoutFuse = new Fuse(workoutLibrary, {
    keys: [{ name: 'name', weight: 0.8 }, { name: 'category', weight: 0.2 }],
    ...PHRASE_MATCH_OPTIONS,
  });

  return { vocabFuse, foodFuse, workoutFuse };
}

/** Corrects obvious per-word typos (e.g. "pushaps" -> "pushups") before phrase matching. */
function correctTypos(text, vocabFuse) {
  return text
    .split(/\s+/)
    .map((token) => {
      if (!token || /^\d/.test(token)) return token; // skip numbers/units
      const results = vocabFuse.search(token, { limit: 1 });
      if (results.length && results[0].score <= 0.3) return results[0].item.word;
      return token;
    })
    .join(' ');
}

/**
 * Tries to match `name` against both libraries and returns whichever match
 * is stronger, tagged with its type. Fuse's score is 0 (perfect) to 1
 * (worst); we convert it to a 0-1 confidence where 1 is a perfect match.
 */
function matchAgainstLibraries(name, foodFuse, workoutFuse) {
  const foodResult = foodFuse.search(name, { limit: 1 })[0];
  const workoutResult = workoutFuse.search(name, { limit: 1 })[0];

  const foodConfidence = foodResult ? round(1 - foodResult.score) : 0;
  const workoutConfidence = workoutResult ? round(1 - workoutResult.score) : 0;

  if (foodConfidence === 0 && workoutConfidence === 0) {
    return { type: 'unknown', item: null, confidence_score: 0 };
  }

  if (foodConfidence >= workoutConfidence) {
    return { type: 'food', item: foodResult.item, confidence_score: foodConfidence };
  }
  return { type: 'workout', item: workoutResult.item, confidence_score: workoutConfidence };
}

/**
 * Full offline pipeline: segment -> strip filler -> extract quantities ->
 * correct typos -> fuzzy match -> compute calories/macros or burn.
 */
function parseOffline(text, { foodLibrary, workoutLibrary, userWeightKg }) {
  const { vocabFuse, foodFuse, workoutFuse } = buildOfflineIndexes(foodLibrary, workoutLibrary);

  const segments = segmentText(text);
  const items = segments.map((rawSegment) => {
    const stripped = stripFillerWords(rawSegment);
    const { info, cleanedName } = extractQuantities(stripped);
    const correctedName = correctTypos(cleanedName, vocabFuse);
    const match = matchAgainstLibraries(correctedName, foodFuse, workoutFuse);

    return buildEntryItem({
      raw_text: rawSegment.trim(),
      matchType: match.type,
      matchedItem: match.item,
      confidence_score: match.confidence_score,
      info,
      userWeightKg,
    });
  });

  return { source: 'offline', items, needs_manual_override: items.some((i) => i.needs_manual_override) };
}

// =========================================================================
// 3. ENERGY MATH FUNCTIONS
// =========================================================================

/**
 * Duration-based burn (cardio, timed holds, steady-state cardio machines):
 *   Burn = Duration(hrs) * MET * Weight(kg)
 */
function calorieBurnByDuration(durationHours, metValue, weightKg) {
  if (!durationHours || !metValue || !weightKg) return 0;
  return durationHours * metValue * weightKg;
}

/**
 * Rep-based burn (bodyweight sets/reps or weighted strength sets/reps):
 *   Burn = Sets * Reps * (Bodyweight_kg * ratio + External_kg) * WorkFactor
 *
 * `ratio` is the exercise's bodyweight_ratio (fraction of bodyweight moved),
 * 0 for pure-external-load gym machines where bodyweight isn't displaced.
 * `externalWeightKg` is any added load (dumbbell/barbell/plate weight).
 */
function calorieBurnByReps(sets, reps, bodyweightKg, ratio, externalWeightKg, workFactor = DEFAULT_WORK_FACTOR) {
  if (!sets || !reps) return 0;
  const effectiveLoad = (bodyweightKg || 0) * (ratio || 0) + (externalWeightKg || 0);
  return sets * reps * effectiveLoad * workFactor;
}

/**
 * Dispatches to the right formula for a workout item based on what quantity
 * info was parsed (duration wins if present; otherwise sets/reps).
 */
function computeWorkoutBurn(workout, info, userWeightKg) {
  if (info.duration_minutes != null) {
    const hrs = info.duration_minutes / 60;
    return {
      mode: 'duration',
      sets: null,
      reps: null,
      weight_kg: info.weight_kg || null,
      duration_minutes: info.duration_minutes,
      calories: round(calorieBurnByDuration(hrs, workout.met_value, userWeightKg)),
    };
  }

  const sets = info.sets != null ? info.sets : 1;
  const reps = info.reps != null ? info.reps : (info.raw_number != null ? info.raw_number : 0);
  const externalWeight = info.weight_kg || 0;
  const ratio = workout.bodyweight_ratio != null ? workout.bodyweight_ratio : 0;

  return {
    mode: 'reps',
    sets,
    reps,
    weight_kg: externalWeight || null,
    duration_minutes: null,
    calories: round(calorieBurnByReps(sets, reps, userWeightKg, ratio, externalWeight)),
  };
}

/** Pulls a reference gram/ml amount out of a base_unit string like "1 bowl (150g)" or "100g". */
function parseBaseUnitGrams(baseUnit) {
  if (!baseUnit) return null;
  const parenMatch = baseUnit.match(/\((\d+(?:\.\d+)?)\s*(g|ml)\)/i);
  if (parenMatch) return parseFloat(parenMatch[1]);
  const bareMatch = baseUnit.match(/^(\d+(?:\.\d+)?)\s*(g|ml)$/i);
  if (bareMatch) return parseFloat(bareMatch[1]);
  return null;
}

/**
 * Scales a food_library entry's macros by whatever quantity was parsed:
 * grams/ml (weight-based) or a plain serving-count multiplier (e.g. "2 rotis").
 */
function computeFoodMacros(food, info) {
  let scale = 1;
  let quantityLabel;

  if (info.grams != null) {
    const refGrams = parseBaseUnitGrams(food.base_unit) || 100;
    scale = info.grams / refGrams;
    quantityLabel = `${info.grams}g`;
  } else if (info.ml != null) {
    const refMl = parseBaseUnitGrams(food.base_unit) || 100;
    scale = info.ml / refMl;
    quantityLabel = `${info.ml}ml`;
  } else {
    scale = info.raw_number != null ? info.raw_number : 1;
    quantityLabel = `${scale} x ${food.base_unit}`;
  }

  return {
    scale,
    quantity_label: quantityLabel,
    calories: round(food.calories * scale),
    protein: round(food.protein * scale),
    carbs: round(food.carbs * scale),
    fat: round(food.fat * scale),
  };
}

// =========================================================================
// 4. ENTRY ITEM ASSEMBLY + CONFIDENCE SCORING
// =========================================================================

function buildEntryItem({ raw_text, matchType, matchedItem, confidence_score, info, userWeightKg }) {
  const base = {
    raw_text,
    type: matchType,
    matched_name: matchedItem ? matchedItem.name : null,
    confidence_score: round(confidence_score),
    needs_manual_override: confidence_score < CONFIDENCE_THRESHOLD || matchType === 'unknown',
    // Exposed so downstream UI (e.g. a manual-override review screen) can
    // re-run computeFoodMacros/computeWorkoutBurn after the user edits a
    // field, without having to re-parse or re-fetch the library record.
    matched_item: matchedItem || null,
    raw_quantity: { ...info },
  };

  if (matchType === 'food' && matchedItem) {
    const macros = computeFoodMacros(matchedItem, info);
    return {
      ...base,
      quantity: macros.quantity_label,
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
    };
  }

  if (matchType === 'workout' && matchedItem) {
    const weight = userWeightKg || DEFAULT_USER_WEIGHT_KG;
    const burn = computeWorkoutBurn(matchedItem, info, weight);
    return {
      ...base,
      quantity: burn.mode === 'duration'
        ? `${burn.duration_minutes} min`
        : `${burn.sets} sets x ${burn.reps} reps${burn.weight_kg ? ` @ ${burn.weight_kg}kg` : ''}`,
      calories: burn.calories,
      protein: null,
      carbs: null,
      fat: null,
    };
  }

  // Unmatched / unknown segment -- always needs manual override.
  return {
    ...base,
    quantity: null,
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
  };
}

function round(n, decimals = 2) {
  if (n == null || Number.isNaN(n)) return n;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

// =========================================================================
// 5. ONLINE PIPELINE -- CLAUDE API INTEGRATION
// =========================================================================
//
// IMPORTANT: never call api.anthropic.com directly from client-side code --
// that would require shipping an API key to the browser. `apiEndpoint` below
// should point at YOUR OWN backend route (e.g. POST /api/parse-entry) which
// holds the Anthropic API key server-side and forwards the request, e.g.:
//
//   // server route (Node/Express example)
//   const resp = await fetch('https://api.anthropic.com/v1/messages', {
//     method: 'POST',
//     headers: {
//       'x-api-key': process.env.ANTHROPIC_API_KEY,
//       'anthropic-version': '2023-06-01',
//       'content-type': 'application/json',
//     },
//     body: JSON.stringify({
//       model: 'claude-sonnet-4-6',
//       max_tokens: 1024,
//       system: CLAUDE_SYSTEM_PROMPT,
//       messages: [{ role: 'user', content: text }],
//     }),
//   });
//
// This module only handles the client side of that call.

const CLAUDE_SYSTEM_PROMPT = `You are an entry parser for a fitness/nutrition tracking app.
The user will send one free-form sentence that may describe food eaten and/or
exercises performed, possibly with typos or shorthand (e.g. "pushaps", "3x10").

Correct obvious typos, then extract every distinct food or workout item as a
JSON array. Respond with ONLY valid JSON, no prose, no markdown fences, in
exactly this shape:

[
  {
    "raw_text": "<verbatim substring this item was extracted from>",
    "type": "food" | "workout",
    "matched_name": "<canonical, corrected name of the food or exercise>",
    "quantity": {
      "count": <number|null>,          // e.g. 2 rotis -> 2
      "grams": <number|null>,
      "ml": <number|null>,
      "sets": <number|null>,
      "reps": <number|null>,
      "weight_kg": <number|null>,      // external weight used, if any
      "duration_minutes": <number|null>
    },
    "confidence_score": <number 0-1>   // your confidence this extraction/match is correct
  }
]

If a segment is ambiguous or you are not confident what it refers to, still
include it with your best-guess "matched_name" but set a low confidence_score
(below 0.85) so the app can ask the user to confirm it manually.`;

function buildClaudeRequestBody(text) {
  return {
    text,
    system_prompt: CLAUDE_SYSTEM_PROMPT,
  };
}

/** Basic shape validation so a malformed/partial response falls back to offline parsing. */
function isValidClaudeResponse(parsed) {
  return (
    Array.isArray(parsed) &&
    parsed.every(
      (i) =>
        i &&
        typeof i.raw_text === 'string' &&
        (i.type === 'food' || i.type === 'workout') &&
        typeof i.matched_name === 'string' &&
        typeof i.quantity === 'object'
    )
  );
}

/**
 * Converts Claude's extracted items into the same shape offline parsing
 * produces, by looking the matched_name up in the local libraries to attach
 * real calorie/macro/MET data (Claude identifies *what* was said; the local
 * library remains the source of truth for *nutrition numbers*).
 */
function hydrateClaudeItems(claudeItems, { foodLibrary, workoutLibrary, userWeightKg }) {
  const { foodFuse, workoutFuse } = buildOfflineIndexes(foodLibrary, workoutLibrary);

  return claudeItems.map((claudeItem) => {
    const info = {
      sets: claudeItem.quantity.sets ?? null,
      reps: claudeItem.quantity.reps ?? null,
      weight_kg: claudeItem.quantity.weight_kg ?? null,
      grams: claudeItem.quantity.grams ?? null,
      ml: claudeItem.quantity.ml ?? null,
      duration_minutes: claudeItem.quantity.duration_minutes ?? null,
      raw_number: claudeItem.quantity.count ?? null,
    };

    const fuse = claudeItem.type === 'food' ? foodFuse : workoutFuse;
    const result = fuse.search(claudeItem.matched_name, { limit: 1 })[0];

    // Blend Claude's own confidence with how well its suggested name maps
    // onto our local library -- whichever is lower drives the override flag,
    // since either a bad extraction OR a missing library entry should
    // trigger manual review.
    const libraryConfidence = result ? round(1 - result.score) : 0;
    const claudeConfidence = typeof claudeItem.confidence_score === 'number' ? claudeItem.confidence_score : 0.9;
    const blendedConfidence = round(Math.min(libraryConfidence, claudeConfidence));

    return buildEntryItem({
      raw_text: claudeItem.raw_text,
      matchType: result ? claudeItem.type : 'unknown',
      matchedItem: result ? result.item : null,
      confidence_score: result ? blendedConfidence : 0,
      info,
      userWeightKg,
    });
  });
}

/**
 * Calls the backend proxy endpoint that talks to the Claude API.
 * Throws on network failure / timeout / invalid response so the caller can
 * fall back to the offline pipeline.
 */
async function parseOnline(text, { apiEndpoint, foodLibrary, workoutLibrary, userWeightKg, timeoutMs = 8000 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildClaudeRequestBody(text)),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Claude proxy returned ${response.status}`);

    const payload = await response.json();
    // Backend is expected to return either the raw array, or { items: [...] }.
    const rawItems = Array.isArray(payload) ? payload : payload.items;

    if (!isValidClaudeResponse(rawItems)) {
      throw new Error('Claude response failed schema validation');
    }

    const items = hydrateClaudeItems(rawItems, { foodLibrary, workoutLibrary, userWeightKg });
    return { source: 'online', items, needs_manual_override: items.some((i) => i.needs_manual_override) };
  } finally {
    clearTimeout(timeout);
  }
}

// =========================================================================
// 6. PUBLIC API
// =========================================================================

/**
 * Parses a single free-text entry into structured food/workout items.
 *
 * @param {string} text - raw user input, e.g. "had 2 rotis with dal tadka
 *   and did 20 pushups and 3 sets of bench press 60kg 10 reps"
 * @param {object} [options]
 * @param {'auto'|'online'|'offline'} [options.mode='auto'] - 'auto' tries
 *   the Claude API first and falls back to offline fuzzy matching on any
 *   failure (offline, timeout, bad response); 'online'/'offline' force one
 *   pipeline and skip fallback.
 * @param {string} [options.apiEndpoint='/api/parse-entry'] - your backend
 *   route that proxies to the Claude API (see section 5 above).
 * @param {Array}  [options.foodLibrary] - defaults to window.FOOD_LIBRARY_SEED.
 * @param {Array}  [options.workoutLibrary] - defaults to window.WORKOUT_LIBRARY_SEED.
 * @param {number} [options.userWeightKg] - current bodyweight, used for burn
 *   calculations; defaults to the cached user_profile weight, then 70kg.
 * @returns {Promise<{source: 'online'|'offline', items: object[], needs_manual_override: boolean}>}
 */
async function parseEntryText(text, options = {}) {
  if (!text || !text.trim()) {
    return { source: 'offline', items: [], needs_manual_override: false };
  }

  const foodLibrary = options.foodLibrary || (typeof window !== 'undefined' && window.FOOD_LIBRARY_SEED) || [];
  const workoutLibrary = options.workoutLibrary || (typeof window !== 'undefined' && window.WORKOUT_LIBRARY_SEED) || [];
  const userWeightKg = options.userWeightKg || DEFAULT_USER_WEIGHT_KG;
  const apiEndpoint = options.apiEndpoint || '/api/parse-entry';
  const mode = options.mode || 'auto';

  const offlineArgs = { foodLibrary, workoutLibrary, userWeightKg };
  const onlineArgs = { apiEndpoint, foodLibrary, workoutLibrary, userWeightKg };

  if (mode === 'offline') return parseOffline(text, offlineArgs);
  if (mode === 'online') return parseOnline(text, onlineArgs);

  // 'auto': prefer online (better typo/entity handling), fall back silently.
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isOffline) return parseOffline(text, offlineArgs);

  try {
    return await parseOnline(text, onlineArgs);
  } catch (err) {
    console.warn('[parser] Online parse failed, falling back to offline pipeline:', err.message);
    return parseOffline(text, offlineArgs);
  }
}

// =========================================================================
// 7. EXPORTS
// =========================================================================

export {
  parseEntryText,
  parseOffline,
  parseOnline,
  calorieBurnByDuration,
  calorieBurnByReps,
  computeFoodMacros,
  computeWorkoutBurn,
  segmentText,
  extractQuantities,
  buildOfflineIndexes,
  CONFIDENCE_THRESHOLD,
  DEFAULT_WORK_FACTOR,
};

// Also attach to window for non-module <script> usage, consistent with db-setup.js.
if (typeof window !== 'undefined') {
  window.parseEntryText = parseEntryText;
  window.parserInternals = {
    parseOffline,
    parseOnline,
    calorieBurnByDuration,
    calorieBurnByReps,
    computeFoodMacros,
    computeWorkoutBurn,
    segmentText,
    extractQuantities,
    buildOfflineIndexes,
  };
}
