/**
 * override-modal.js
 * -----------------------------------------------------------------------
 * Human-verification UI for parsed daily log text. Sits between parser.js
 * (which turns free text into best-guess entries) and Dexie (which stores
 * confirmed entries) -- this is where a low-confidence guess gets corrected
 * before it affects the daily calorie total.
 *
 * Flow:
 *   1. Paste/type free text -> "Parse" runs parser.js's parseEntryText().
 *   2. Each recognized item renders as a card with its computed
 *      calories/macros. Cards with needs_manual_override: true are
 *      highlighted amber and start expanded for review.
 *   3. Each card can be corrected via a local-library search, an optional
 *      pluggable online search, or by directly editing the numeric fields.
 *   4. "Save & Update Daily Net Calorie Output" commits every item to
 *      entry_items and rolls daily_logs up via dashboard.js's
 *      computeDaySummary(). "Save unknown food item to local food_library"
 *      persists a brand-new item so parser.js recognizes it next time.
 *
 * Dependencies (script tags, same pattern as the rest of the app):
 *   - Tailwind CSS
 *   - Dexie.js, initialized via db-setup.js (window.db)
 *   - Fuse.js (used internally by parser.js's buildOfflineIndexes)
 *
 * Usage:
 *   <div id="override-modal-root"></div>
 *   <script type="module">
 *     import { mountOverrideModal } from './override-modal.js';
 *     await window.dbReady;
 *     mountOverrideModal(document.getElementById('override-modal-root'), {
 *       onSaved: (summary) => dashboardHandle.refresh(),
 *     });
 *   </script>
 * -----------------------------------------------------------------------
 */

import {
  parseEntryText,
  computeFoodMacros,
  computeWorkoutBurn,
  buildOfflineIndexes,
} from './parser.js';
import { computeDaySummary, toDateKey } from './dashboard.js';

// =========================================================================
// 0. THEME (reuses the app's design tokens; safe to call even if
//    dashboard.js already injected them -- guarded by element id).
// =========================================================================

const THEME_STYLE_ID = 'dashboard-theme-styles';
const FONT_LINK_ID = 'dashboard-theme-fonts';

function injectThemeAssets() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById(FONT_LINK_ID)) {
    const link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
  }
  if (!document.getElementById(THEME_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = THEME_STYLE_ID;
    style.textContent = `
      :root {
        --db-ink: #14181C; --db-surface: #1C2126; --db-surface-2: #242A30;
        --db-text: #EDEEEA; --db-muted: #9AA2A8; --db-gold: #D9A441;
        --db-coral: #E85D4C; --db-teal: #1F8A70; --db-indigo: #5B5FEF;
        --db-track: #2C333A; --db-amber: #E3A008; --db-amber-bg: rgba(227,160,8,0.10);
      }
      .db-font-display { font-family: 'Space Grotesk', system-ui, sans-serif; font-variant-numeric: tabular-nums; }
      .db-font-body { font-family: 'Inter', system-ui, sans-serif; }
      .db-font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      .db-focusable:focus-visible { outline: 2px solid var(--db-gold); outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
    `;
    document.head.appendChild(style);
  }
}

// =========================================================================
// 1. HELPERS
// =========================================================================

let uidCounter = 0;
function nextUid() {
  uidCounter += 1;
  return `om-${uidCounter}`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function round(n, decimals = 1) {
  if (n == null || Number.isNaN(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function debounce(fn, delay = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// =========================================================================
// 2. MOUNT / CONTROLLER
// =========================================================================

/**
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {object} [options.db] - Dexie instance; defaults to window.db.
 * @param {string} [options.date] - 'YYYY-MM-DD' to log against; defaults to today.
 * @param {number} [options.userWeightKg] - overrides the profile's stored weight for burn math.
 * @param {(query:string, type:'food'|'workout') => Promise<Array>} [options.onlineSearch]
 *   Pluggable online lookup. Each result should look like a food_library or
 *   workout_library row. If omitted, the online-search control is disabled.
 * @param {'auto'|'online'|'offline'} [options.parseMode='offline'] - forwarded
 *   to parser.js's parseEntryText(). Defaults to 'offline' because this static
 *   bundle has no backend at /api/parse-entry -- 'auto' would otherwise make a
 *   network call that's guaranteed to fail on every single parse before
 *   falling back, adding latency and console noise for no benefit. Switch to
 *   'auto' once you've stood up a real backend proxy (see parser.js's header
 *   comment for what that route needs to do).
 * @param {(summary: object) => void} [options.onSaved]
 * @returns {{ reset: Function, destroy: Function }}
 */
function mountOverrideModal(container, options = {}) {
  if (!container) throw new Error('mountOverrideModal: container element is required');
  const db = options.db || (typeof window !== 'undefined' ? window.db : null);
  if (!db) throw new Error('mountOverrideModal: no Dexie db instance found (pass options.db or set window.db)');

  injectThemeAssets();

  const state = {
    dateKey: options.date || toDateKey(new Date()),
    items: [], // review-state item objects, see makeItemState()
    userWeightKg: options.userWeightKg || null,
    profile: null,
    parseMode: options.parseMode || 'offline',
  };

  container.innerHTML = `
    <div class="db-font-body bg-[var(--db-ink)] text-[var(--db-text)] max-w-sm mx-auto px-4 pt-6 pb-28 min-h-screen" data-om-root>
      <div class="flex items-center justify-between mb-1">
        <h1 class="db-font-display text-xl font-bold">Verify your log</h1>
        <input type="date" data-om-date value="${state.dateKey}" max="${toDateKey(new Date())}"
          class="db-focusable db-font-mono text-xs bg-[var(--db-surface)] border border-white/10 rounded-lg px-2 py-1.5 text-[var(--db-muted)]" />
      </div>
      <p class="text-xs text-[var(--db-muted)] mb-4">Paste what you ate and did in one go -- we'll split it up and flag anything we're not sure about.</p>

      <textarea data-om-textarea rows="3" placeholder="e.g. had 2 rotis with dal tadka and did 20 pushups and 3 sets of bench press 60kg 10 reps"
        class="db-focusable w-full rounded-2xl bg-[var(--db-surface)] border border-white/10 px-3.5 py-3 text-sm resize-none placeholder:text-[var(--db-muted)]"></textarea>

      <button type="button" data-om-parse
        class="db-focusable w-full mt-3 rounded-xl bg-[var(--db-gold)] text-[var(--db-ink)] font-semibold py-3 text-sm active:scale-[0.98] transition-transform disabled:opacity-40">
        Parse entry
      </button>

      <div data-om-status class="text-xs db-font-mono text-[var(--db-muted)] mt-2 min-h-[1em]"></div>

      <div data-om-results class="mt-4 flex flex-col gap-3"></div>
    </div>

    <div data-om-footer class="fixed inset-x-0 bottom-0 hidden bg-[var(--db-surface)] border-t border-white/10 px-4 py-3">
      <div class="max-w-sm mx-auto flex items-center justify-between gap-3">
        <div class="text-xs db-font-mono text-[var(--db-muted)]">
          <span data-om-footer-count>0</span> items &middot; <span data-om-footer-flagged>0</span> flagged
        </div>
        <button type="button" data-om-save
          class="db-focusable rounded-xl bg-[var(--db-teal)] text-white font-semibold px-4 py-2.5 text-sm active:scale-[0.98] transition-transform">
          Save & update daily net
        </button>
      </div>
    </div>
  `;

  const el = {
    dateInput: container.querySelector('[data-om-date]'),
    textarea: container.querySelector('[data-om-textarea]'),
    parseBtn: container.querySelector('[data-om-parse]'),
    status: container.querySelector('[data-om-status]'),
    results: container.querySelector('[data-om-results]'),
    footer: container.querySelector('[data-om-footer]'),
    footerCount: container.querySelector('[data-om-footer-count]'),
    footerFlagged: container.querySelector('[data-om-footer-flagged]'),
    saveBtn: container.querySelector('[data-om-save]'),
  };

  // ---- profile / weight bootstrap --------------------------------------
  async function ensureProfile() {
    state.profile = await db.user_profile.get(1);
    if (!state.userWeightKg && state.profile) state.userWeightKg = state.profile.weight;
  }

  // ---- item state shape ---------------------------------------------
  function makeItemState(parsedItem) {
    const isFood = parsedItem.type === 'food';
    const isWorkout = parsedItem.type === 'workout';
    const q = parsedItem.raw_quantity || {};
    return {
      uid: nextUid(),
      raw_text: parsedItem.raw_text,
      type: parsedItem.type, // 'food' | 'workout' | 'unknown'
      matched_name: parsedItem.matched_name,
      matched_item: parsedItem.matched_item || null,
      confidence_score: parsedItem.confidence_score,
      needs_manual_override: parsedItem.needs_manual_override,
      saved_to_library: false,
      expanded: parsedItem.needs_manual_override, // auto-open flagged items for review
      quantityMode: isWorkout && q.duration_minutes != null ? 'duration' : 'reps',
      // editable fields:
      servingCount: isFood ? (q.raw_number != null ? q.raw_number : 1) : null,
      grams: isFood ? q.grams : null,
      ml: isFood ? q.ml : null,
      sets: isWorkout ? (q.sets != null ? q.sets : 1) : null,
      reps: isWorkout ? (q.reps != null ? q.reps : (q.raw_number != null ? q.raw_number : 0)) : null,
      weight_kg: isWorkout ? (q.weight_kg || 0) : null,
      duration_minutes: isWorkout ? q.duration_minutes : null,
      calories: parsedItem.calories || 0,
      protein: isFood ? (parsedItem.protein || 0) : null,
      carbs: isFood ? (parsedItem.carbs || 0) : null,
      fat: isFood ? (parsedItem.fat || 0) : null,
    };
  }

  // ---- recompute derived calorie/macro fields from a driver-field edit --
  function recomputeFood(item) {
    if (!item.matched_item) return;
    const info = item.grams != null ? { grams: item.grams } : item.ml != null ? { ml: item.ml } : { raw_number: item.servingCount };
    const macros = computeFoodMacros(item.matched_item, info);
    item.calories = macros.calories;
    item.protein = macros.protein;
    item.carbs = macros.carbs;
    item.fat = macros.fat;
  }

  function recomputeWorkout(item) {
    if (!item.matched_item) return;
    const info =
      item.quantityMode === 'duration'
        ? { duration_minutes: item.duration_minutes }
        : { sets: item.sets, reps: item.reps, weight_kg: item.weight_kg };
    const burn = computeWorkoutBurn(item.matched_item, info, state.userWeightKg || 70);
    item.calories = burn.calories;
  }

  // ---- library search (local) ------------------------------------------
  function searchLocal(query, type) {
    if (!query || !query.trim()) return [];
    const { foodFuse, workoutFuse } = buildOfflineIndexes(
      window.FOOD_LIBRARY_SEED || [],
      window.WORKOUT_LIBRARY_SEED || []
    );
    const fuse = type === 'workout' ? workoutFuse : foodFuse;
    return fuse.search(query, { limit: 5 }).map((r) => r.item);
  }

  function applyMatch(item, libraryItem, type) {
    item.type = type;
    item.matched_item = libraryItem;
    item.matched_name = libraryItem.name;
    item.confidence_score = 1;
    item.needs_manual_override = false;
    item.saved_to_library = false;
    if (type === 'food') {
      item.servingCount = 1;
      item.grams = null;
      item.ml = null;
      recomputeFood(item);
    } else {
      item.sets = item.sets || 1;
      item.reps = item.reps || 10;
      item.weight_kg = item.weight_kg || 0;
      recomputeWorkout(item);
    }
  }

  // =========================================================================
  // 3. RENDERING
  // =========================================================================

  function confidencePct(item) {
    return Math.round((item.confidence_score || 0) * 100);
  }

  function renderCard(item) {
    const flagged = item.needs_manual_override;
    const cardTone = flagged
      ? 'border-[var(--db-amber)]/60 bg-[var(--db-amber-bg)]'
      : 'border-white/5 bg-[var(--db-surface)]';
    const typeIcon = item.type === 'food' ? '🍽️' : item.type === 'workout' ? '🏋️' : '❓';
    const macroLine =
      item.type === 'food'
        ? `${item.protein ?? 0}p &middot; ${item.carbs ?? 0}c &middot; ${item.fat ?? 0}f`
        : item.type === 'workout'
        ? (item.quantityMode === 'duration' ? `${item.duration_minutes ?? 0} min` : `${item.sets ?? 0}x${item.reps ?? 0}${item.weight_kg ? ` @ ${item.weight_kg}kg` : ''}`)
        : 'unclassified';

    return `
    <div data-om-item="${item.uid}" class="rounded-2xl border ${cardTone} p-3.5 transition-colors">
      <div class="flex items-start gap-2.5">
        <span class="text-lg leading-none mt-0.5">${typeIcon}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="db-font-display font-semibold text-sm truncate">${escapeHtml(item.matched_name || '(unrecognized)')}</span>
            ${flagged ? '<span class="db-font-mono text-[10px] uppercase tracking-wide text-[var(--db-amber)] bg-[var(--db-amber)]/15 px-1.5 py-0.5 rounded">Needs review</span>' : ''}
          </div>
          <p class="text-xs text-[var(--db-muted)] truncate mt-0.5">"${escapeHtml(item.raw_text)}"</p>
          <div class="flex items-center justify-between mt-2">
            <span data-om-macro-line class="db-font-mono text-[11px] text-[var(--db-muted)]">${macroLine}</span>
            <span class="flex items-center gap-2">
              <span data-om-cal-line class="db-font-display text-sm font-bold">${round(item.calories, 0)} kcal</span>
              <span class="db-font-mono text-[10px] ${confidencePct(item) < 85 ? 'text-[var(--db-amber)]' : 'text-[var(--db-teal)]'}">${confidencePct(item)}%</span>
            </span>
          </div>
        </div>
        <div class="flex flex-col items-end gap-1.5">
          <button type="button" data-om-action="remove" aria-label="Remove item" class="db-focusable text-[var(--db-muted)] hover:text-[var(--db-coral)] text-xs px-1">✕</button>
          <button type="button" data-om-action="toggle" aria-expanded="${item.expanded}" class="db-focusable text-[10px] db-font-mono text-[var(--db-muted)] underline underline-offset-2">
            ${item.expanded ? 'hide' : 'edit'}
          </button>
        </div>
      </div>
      ${item.expanded ? renderEditPanel(item) : ''}
    </div>`;
  }

  function renderEditPanel(item) {
    return `
    <div class="mt-3 pt-3 border-t border-white/10" data-om-edit-panel>
      ${renderSearchRow(item)}
      ${item.type === 'unknown' ? renderTypeChooser(item) : ''}
      ${item.type === 'food' ? renderFoodFields(item) : ''}
      ${item.type === 'workout' ? renderWorkoutFields(item) : ''}
      ${(item.type === 'food' || item.type === 'unknown') && !item.matched_item ? renderSaveToLibraryRow(item) : ''}
      ${item.saved_to_library ? '<p class="text-[11px] db-font-mono text-[var(--db-teal)] mt-2">Saved to local library ✓</p>' : ''}
    </div>`;
  }

  function renderSearchRow(item) {
    return `
    <div class="relative mb-3">
      <div class="flex gap-2">
        <input type="text" data-om-field="search" placeholder="Search local library..."
          class="db-focusable flex-1 rounded-xl bg-[var(--db-surface-2)] border border-white/10 px-3 py-2 text-sm placeholder:text-[var(--db-muted)]" />
        <button type="button" data-om-action="online-search" ${options.onlineSearch ? '' : 'disabled title="No online search configured"'}
          class="db-focusable shrink-0 rounded-xl border border-white/10 px-3 py-2 text-xs db-font-mono text-[var(--db-muted)] disabled:opacity-30">
          Online
        </button>
      </div>
      <div data-om-search-results class="absolute z-10 left-0 right-0 mt-1 rounded-xl bg-[var(--db-surface-2)] border border-white/10 overflow-hidden hidden"></div>
    </div>`;
  }

  function renderTypeChooser(item) {
    return `
    <div class="flex gap-2 mb-3">
      <button type="button" data-om-action="set-type" data-om-type="food" class="db-focusable flex-1 rounded-lg border border-white/10 py-2 text-xs db-font-mono text-[var(--db-muted)]">Classify as food</button>
      <button type="button" data-om-action="set-type" data-om-type="workout" class="db-focusable flex-1 rounded-lg border border-white/10 py-2 text-xs db-font-mono text-[var(--db-muted)]">Classify as workout</button>
    </div>`;
  }

  function numField(label, field, value, step = '1') {
    return `
    <label class="block">
      <span class="text-[10px] uppercase tracking-wide db-font-mono text-[var(--db-muted)]">${label}</span>
      <input type="number" step="${step}" data-om-field="${field}" value="${value ?? ''}"
        class="db-focusable mt-0.5 w-full rounded-lg bg-[var(--db-surface-2)] border border-white/10 px-2.5 py-1.5 text-sm" />
    </label>`;
  }

  function renderFoodFields(item) {
    return `
    <div class="grid grid-cols-2 gap-2.5 mb-1">
      ${numField('Servings', 'servingCount', item.servingCount, '0.5')}
      ${numField('Grams (optional)', 'grams', item.grams, '1')}
      ${numField('Calories', 'calories', round(item.calories, 0))}
      ${numField('Protein (g)', 'protein', item.protein, '0.1')}
      ${numField('Carbs (g)', 'carbs', item.carbs, '0.1')}
      ${numField('Fat (g)', 'fat', item.fat, '0.1')}
    </div>
    <p class="text-[10px] text-[var(--db-muted)] mt-1.5">Editing servings/grams recalculates the macros above from the matched food.</p>`;
  }

  function renderWorkoutFields(item) {
    const durationMode = item.quantityMode === 'duration';
    return `
    <div class="flex gap-2 mb-2.5">
      <button type="button" data-om-action="mode" data-om-mode="reps" class="db-focusable flex-1 rounded-lg py-1.5 text-xs db-font-mono ${!durationMode ? 'bg-[var(--db-gold)] text-[var(--db-ink)]' : 'border border-white/10 text-[var(--db-muted)]'}">Sets &amp; reps</button>
      <button type="button" data-om-action="mode" data-om-mode="duration" class="db-focusable flex-1 rounded-lg py-1.5 text-xs db-font-mono ${durationMode ? 'bg-[var(--db-gold)] text-[var(--db-ink)]' : 'border border-white/10 text-[var(--db-muted)]'}">Duration</button>
    </div>
    <div class="grid grid-cols-2 gap-2.5 mb-1">
      ${durationMode
        ? numField('Duration (min)', 'duration_minutes', item.duration_minutes, '1')
        : `${numField('Sets', 'sets', item.sets, '1')}${numField('Reps', 'reps', item.reps, '1')}${numField('Weight (kg)', 'weight_kg', item.weight_kg, '0.5')}`}
      ${numField('Calories', 'calories', round(item.calories, 0))}
    </div>
    <p class="text-[10px] text-[var(--db-muted)] mt-1.5">Editing sets/reps/duration recalculates calories using the exercise's MET value.</p>`;
  }

  function renderSaveToLibraryRow(item) {
    return `
    <div class="mt-2.5 flex gap-2 items-center">
      <input type="text" data-om-field="newName" placeholder="Name to save as..." value="${escapeHtml(item.matched_name || item.raw_text)}"
        class="db-focusable flex-1 rounded-lg bg-[var(--db-surface-2)] border border-white/10 px-2.5 py-1.5 text-sm placeholder:text-[var(--db-muted)]" />
      <button type="button" data-om-action="save-to-library"
        class="db-focusable shrink-0 rounded-lg bg-[var(--db-indigo)] text-white text-xs db-font-mono px-3 py-2">
        Save to library
      </button>
    </div>`;
  }

  function renderResults() {
    el.results.innerHTML = state.items.map(renderCard).join('');
    const flaggedCount = state.items.filter((i) => i.needs_manual_override).length;
    el.footerCount.textContent = String(state.items.length);
    el.footerFlagged.textContent = String(flaggedCount);
    el.footer.classList.toggle('hidden', state.items.length === 0);
  }

  function findItem(uid) {
    return state.items.find((i) => i.uid === uid);
  }

  // =========================================================================
  // 4. EVENT WIRING (delegated on the results container + parse controls)
  // =========================================================================

  el.dateInput.addEventListener('change', () => {
    state.dateKey = el.dateInput.value || toDateKey(new Date());
  });

  el.parseBtn.addEventListener('click', async () => {
    const text = el.textarea.value.trim();
    if (!text) return;
    el.parseBtn.disabled = true;
    el.status.textContent = 'Parsing...';
    try {
      await ensureProfile();
      const result = await parseEntryText(text, {
        mode: state.parseMode,
        userWeightKg: state.userWeightKg || 70,
      });
      const newItems = result.items.map(makeItemState);
      state.items = state.items.concat(newItems);
      el.status.textContent = `Parsed via ${result.source} pipeline -- ${result.items.length} item(s) found.`;
      el.textarea.value = '';
      renderResults();
    } catch (err) {
      el.status.textContent = `Couldn't parse that: ${err.message}`;
    } finally {
      el.parseBtn.disabled = false;
    }
  });

  // Clicks (remove / toggle / apply match / online search / classify / mode / save-to-library)
  el.results.addEventListener('click', async (e) => {
    const cardEl = e.target.closest('[data-om-item]');
    if (!cardEl) return;
    const item = findItem(cardEl.getAttribute('data-om-item'));
    if (!item) return;

    const actionEl = e.target.closest('[data-om-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-om-action');

    if (action === 'remove') {
      state.items = state.items.filter((i) => i.uid !== item.uid);
      renderResults();
      return;
    }

    if (action === 'toggle') {
      item.expanded = !item.expanded;
      renderResults();
      return;
    }

    if (action === 'set-type') {
      item.type = actionEl.getAttribute('data-om-type');
      if (item.type === 'food') {
        item.servingCount = 1;
      } else {
        item.sets = 1;
        item.reps = 10;
        item.weight_kg = 0;
        item.quantityMode = 'reps';
      }
      renderResults();
      return;
    }

    if (action === 'mode') {
      item.quantityMode = actionEl.getAttribute('data-om-mode');
      recomputeWorkout(item);
      renderResults();
      return;
    }

    if (action === 'online-search') {
      const query = cardEl.querySelector('[data-om-field="search"]').value.trim();
      if (!query || !options.onlineSearch) return;
      const dropdown = cardEl.querySelector('[data-om-search-results]');
      dropdown.innerHTML = `<div class="px-3 py-2 text-xs db-font-mono text-[var(--db-muted)]">Searching online...</div>`;
      dropdown.classList.remove('hidden');
      try {
        const results = await options.onlineSearch(query, item.type === 'unknown' ? 'food' : item.type);
        renderSearchDropdown(cardEl, item, results || []);
      } catch (err) {
        dropdown.innerHTML = `<div class="px-3 py-2 text-xs db-font-mono text-[var(--db-coral)]">Online search failed: ${escapeHtml(err.message)}</div>`;
      }
      return;
    }

    if (action === 'apply-search-result') {
      const idx = Number(actionEl.getAttribute('data-om-idx'));
      const type = actionEl.getAttribute('data-om-result-type');
      const libraryItem = actionEl._resultRef; // attached when the dropdown was rendered
      if (libraryItem) applyMatch(item, libraryItem, type);
      renderResults();
      return;
    }

    if (action === 'save-to-library') {
      const nameInput = cardEl.querySelector('[data-om-field="newName"]');
      const name = (nameInput.value || item.raw_text).trim();
      if (!name) return;
      const chosenType = item.type === 'unknown' ? 'food' : item.type;

      if (chosenType === 'food') {
        const record = {
          name,
          local_names: [],
          base_unit: item.grams != null ? `${item.grams}g` : `${item.servingCount || 1} serving`,
          calories: round(item.calories, 0),
          protein: round(item.protein, 1),
          carbs: round(item.carbs, 1),
          fat: round(item.fat, 1),
          is_custom: true,
        };
        const id = await db.food_library.add(record);
        record.id = id;
        window.FOOD_LIBRARY_SEED = (window.FOOD_LIBRARY_SEED || []).concat(record);
        item.matched_item = record;
        item.matched_name = record.name;
      } else {
        const record = {
          name,
          category: 'custom',
          met_value: 5, // reasonable general default; user can refine later via the library.
          bodyweight_ratio: null,
          is_custom: true,
        };
        const id = await db.workout_library.add(record);
        record.id = id;
        window.WORKOUT_LIBRARY_SEED = (window.WORKOUT_LIBRARY_SEED || []).concat(record);
        item.matched_item = record;
        item.matched_name = record.name;
      }

      item.type = chosenType;
      item.confidence_score = 1;
      item.needs_manual_override = false;
      item.saved_to_library = true;
      renderResults();
    }
  });

  // Live numeric/text field edits (delegated 'input' listener)
  el.results.addEventListener('input', (e) => {
    const fieldEl = e.target.closest('[data-om-field]');
    if (!fieldEl) return;
    const cardEl = e.target.closest('[data-om-item]');
    const item = findItem(cardEl.getAttribute('data-om-item'));
    if (!item) return;
    const field = fieldEl.getAttribute('data-om-field');

    if (field === 'search') {
      debouncedLocalSearch(cardEl, item, fieldEl.value);
      return;
    }
    if (field === 'newName') return; // no side effects while typing a save-as name

    const numericValue = fieldEl.value === '' ? null : Number(fieldEl.value);

    if (item.type === 'food') {
      if (field === 'servingCount') {
        item.servingCount = numericValue;
        item.grams = null;
        item.ml = null;
        recomputeFood(item);
        updateCardStatsInPlace(cardEl, item);
        syncMacroInputs(cardEl, item);
        return;
      }
      if (field === 'grams') {
        item.grams = numericValue;
        recomputeFood(item);
        updateCardStatsInPlace(cardEl, item);
        syncMacroInputs(cardEl, item);
        return;
      }
      if (['calories', 'protein', 'carbs', 'fat'].includes(field)) {
        item[field] = numericValue || 0;
        updateCardStatsInPlace(cardEl, item);
        return;
      }
    }

    if (item.type === 'workout') {
      if (['sets', 'reps', 'weight_kg', 'duration_minutes'].includes(field)) {
        item[field] = numericValue;
        recomputeWorkout(item);
        updateCardStatsInPlace(cardEl, item);
        const calInput = cardEl.querySelector('[data-om-field="calories"]');
        if (calInput) calInput.value = round(item.calories, 0);
        return;
      }
      if (field === 'calories') {
        item.calories = numericValue || 0;
        updateCardStatsInPlace(cardEl, item);
      }
    }
  });

  function syncMacroInputs(cardEl, item) {
    ['calories', 'protein', 'carbs', 'fat'].forEach((f) => {
      const input = cardEl.querySelector(`[data-om-field="${f}"]`);
      if (input) input.value = f === 'calories' ? round(item[f], 0) : round(item[f], 1);
    });
  }

  function updateCardStatsInPlace(cardEl, item) {
    const calLine = cardEl.querySelector('[data-om-cal-line]');
    if (calLine) calLine.textContent = `${round(item.calories, 0)} kcal`;
    const macroLine = cardEl.querySelector('[data-om-macro-line]');
    if (macroLine) {
      macroLine.innerHTML =
        item.type === 'food'
          ? `${item.protein ?? 0}p &middot; ${item.carbs ?? 0}c &middot; ${item.fat ?? 0}f`
          : item.quantityMode === 'duration'
          ? `${item.duration_minutes ?? 0} min`
          : `${item.sets ?? 0}x${item.reps ?? 0}${item.weight_kg ? ` @ ${item.weight_kg}kg` : ''}`;
    }
  }

  const debouncedLocalSearch = debounce((cardEl, item, query) => {
    const dropdown = cardEl.querySelector('[data-om-search-results]');
    if (!query.trim()) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      return;
    }
    const searchType = item.type === 'unknown' ? 'food' : item.type;
    const results = searchLocal(query, searchType);
    renderSearchDropdown(cardEl, item, results, searchType);
  }, 200);

  function renderSearchDropdown(cardEl, item, results, type = item.type) {
    const dropdown = cardEl.querySelector('[data-om-search-results]');
    if (!results.length) {
      dropdown.innerHTML = `<div class="px-3 py-2 text-xs db-font-mono text-[var(--db-muted)]">No matches</div>`;
      dropdown.classList.remove('hidden');
      return;
    }
    dropdown.innerHTML = results
      .map(
        (r, idx) => `
      <button type="button" data-om-action="apply-search-result" data-om-idx="${idx}" data-om-result-type="${type}"
        class="db-focusable w-full text-left px-3 py-2 text-sm hover:bg-white/5 border-b border-white/5 last:border-0">
        ${escapeHtml(r.name)}
        <span class="block text-[10px] db-font-mono text-[var(--db-muted)]">${type === 'food' ? `${r.calories} kcal / ${r.base_unit}` : `MET ${r.met_value}`}</span>
      </button>`
      )
      .join('');
    dropdown.classList.remove('hidden');
    // Attach direct references so the click handler doesn't need to re-search.
    Array.from(dropdown.children).forEach((btn, idx) => {
      btn._resultRef = results[idx];
    });
  }

  // ---- global save --------------------------------------------------
  el.saveBtn.addEventListener('click', async () => {
    if (!state.items.length) return;
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = 'Saving...';
    try {
      await ensureProfile();
      const rows = state.items.map((item) => ({
        date: state.dateKey,
        type: item.type === 'unknown' ? 'food' : item.type,
        raw_text: item.raw_text,
        matched_name: item.matched_name || item.raw_text,
        quantity:
          item.type === 'food'
            ? (item.grams != null ? `${item.grams}g` : `${item.servingCount || 1} serving(s)`)
            : item.quantityMode === 'duration'
            ? `${item.duration_minutes || 0} min`
            : `${item.sets || 1} sets x ${item.reps || 0} reps${item.weight_kg ? ` @ ${item.weight_kg}kg` : ''}`,
        calories: round(item.calories, 0),
        protein: item.protein != null ? round(item.protein, 1) : null,
        carbs: item.carbs != null ? round(item.carbs, 1) : null,
        fat: item.fat != null ? round(item.fat, 1) : null,
        confidence_score: item.confidence_score,
      }));

      await db.entry_items.bulkAdd(rows);

      let summary = null;
      if (state.profile) {
        summary = await computeDaySummary(db, state.dateKey, state.profile);
      }

      state.items = [];
      renderResults();
      el.status.textContent = `Saved ${rows.length} item(s) to ${state.dateKey}.`;
      if (options.onSaved) options.onSaved(summary);
    } catch (err) {
      el.status.textContent = `Save failed: ${err.message}`;
    } finally {
      el.saveBtn.disabled = false;
      el.saveBtn.textContent = 'Save & update daily net';
    }
  });

  renderResults();

  return {
    reset: () => {
      state.items = [];
      el.textarea.value = '';
      el.status.textContent = '';
      renderResults();
    },
    destroy: () => {
      container.innerHTML = '';
    },
  };
}

export { mountOverrideModal };

if (typeof window !== 'undefined') {
  window.mountOverrideModal = mountOverrideModal;
}

