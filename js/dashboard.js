/**
 * dashboard.js
 * -----------------------------------------------------------------------
 * Mobile-first HTML5 + Tailwind dashboard for the offline calorie/workout
 * tracker. Mounts into a container element and manages three pieces:
 *
 *   1. First-run questionnaire modal (age/sex/height/weight/activity/goal)
 *      -> computes BMR (Mifflin-St Jeor) + TDEE, saves to Dexie.
 *   2. Daily summary header: a concentric "Energy Ring" (consumed vs.
 *      budget, workout burn vs. movement goal), net caloric status, and a
 *      protein progress bar.
 *   3. Date navigation: a horizontal day strip + prev/next arrows for
 *      browsing historical daily_logs.
 *
 * Dependencies (script tags, same pattern as db-setup.js / parser.js):
 *   - Tailwind CSS (CDN or build): <script src="https://cdn.tailwindcss.com"></script>
 *   - Dexie.js, already initialized via db-setup.js (window.db / window.dbReady)
 *
 * Usage:
 *   <div id="dashboard-root"></div>
 *   <script type="module">
 *     import { mountDashboard } from './dashboard.js';
 *     await window.dbReady;
 *     const handle = mountDashboard(document.getElementById('dashboard-root'));
 *     // after parser.js logs new entries for today:
 *     handle.refresh();
 *   </script>
 * -----------------------------------------------------------------------
 */

// =========================================================================
// 0. DESIGN TOKENS (injected once as CSS custom properties + fonts)
// =========================================================================

const THEME_STYLE_ID = 'dashboard-theme-styles';
const FONT_LINK_ID = 'dashboard-theme-fonts';

const THEME_CSS = `
:root {
  --db-ink: #14181C;
  --db-surface: #1C2126;
  --db-surface-2: #242A30;
  --db-text: #EDEEEA;
  --db-muted: #9AA2A8;
  --db-gold: #D9A441;
  --db-coral: #E85D4C;
  --db-teal: #1F8A70;
  --db-indigo: #5B5FEF;
  --db-track: #2C333A;
}
.db-font-display { font-family: 'Space Grotesk', system-ui, sans-serif; font-variant-numeric: tabular-nums; }
.db-font-body { font-family: 'Inter', system-ui, sans-serif; }
.db-font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.db-ring-arc { transition: stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
.db-day-chip { scroll-snap-align: center; }
.db-day-strip { scroll-snap-type: x proximity; -ms-overflow-style: none; scrollbar-width: none; }
.db-day-strip::-webkit-scrollbar { display: none; }
@media (prefers-reduced-motion: reduce) {
  .db-ring-arc { transition: none; }
}
.db-focusable:focus-visible {
  outline: 2px solid var(--db-gold);
  outline-offset: 2px;
}
`;

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
    style.textContent = THEME_CSS;
    document.head.appendChild(style);
  }
}

// =========================================================================
// 1. BMR / TDEE MATH
// =========================================================================

/** kcal/day activity multipliers applied to BMR to get TDEE. */
const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2, // little/no exercise
  light: 1.375, // light exercise 1-3 days/week
  moderate: 1.55, // moderate exercise 3-5 days/week
  active: 1.725, // hard exercise 6-7 days/week
  very_active: 1.9, // physical job or 2x/day training
};

const ACTIVITY_LABELS = {
  sedentary: 'Sedentary (little/no exercise)',
  light: 'Light (1-3 days/week)',
  moderate: 'Moderate (3-5 days/week)',
  active: 'Active (6-7 days/week)',
  very_active: 'Very active (physical job / 2x/day)',
};

/** kcal/day offsets applied against TDEE to derive a daily calorie budget. Positive = deficit. */
const GOAL_DEFICITS = {
  lose: 500, // ~0.45kg/week loss
  maintain: 0,
  gain: -300, // surplus
};

const GOAL_LABELS = {
  lose: 'Lose weight',
  maintain: 'Maintain weight',
  gain: 'Gain weight',
};

/**
 * Mifflin-St Jeor BMR (kcal/day).
 *   Men:   10*weight(kg) + 6.25*height(cm) - 5*age + 5
 *   Women: 10*weight(kg) + 6.25*height(cm) - 5*age - 161
 * For sex === 'other' (no biological-sex value provided), we average the
 * two sex-specific constants (+5 and -161 -> -78) as a documented, inclusive
 * fallback -- flag this to the user as an estimate if precision matters.
 */
function calculateBMR({ sex, weight, height, age }) {
  const base = 10 * weight + 6.25 * height - 5 * age;
  if (sex === 'male') return round(base + 5);
  if (sex === 'female') return round(base - 161);
  return round(base - 78); // 'other' / unspecified
}

function calculateTDEE(bmr, activityLevel) {
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] || ACTIVITY_MULTIPLIERS.moderate;
  return round(bmr * multiplier);
}

function deriveTargetDeficit(goal) {
  return GOAL_DEFICITS[goal] != null ? GOAL_DEFICITS[goal] : 0;
}

function isProfileComplete(profile) {
  return !!(
    profile &&
    profile.age &&
    profile.sex &&
    profile.height &&
    profile.weight &&
    profile.activity_level &&
    profile.target_deficit != null
  );
}

function round(n, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

// =========================================================================
// 2. DATE HELPERS
// =========================================================================

function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dateKey, delta) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}

function isToday(dateKey) {
  return dateKey === toDateKey(new Date());
}

function formatDayLabel(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  const day = d.getDate();
  return { weekday, day };
}

function formatHeaderDate(dateKey) {
  if (isToday(dateKey)) return 'Today';
  const d = new Date(`${dateKey}T00:00:00`);
  const yesterday = addDays(toDateKey(new Date()), -1);
  if (dateKey === yesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

// =========================================================================
// 3. DATA LAYER (Dexie queries + rollup)
// =========================================================================

async function loadProfile(db) {
  return db.user_profile.get(1);
}

async function saveProfile(db, profile) {
  await db.user_profile.put({ id: 1, ...profile });
}

/**
 * Sums today's logged food/workout entries and computes the full energy
 * picture for one calendar day, then upserts daily_logs so the rollup is
 * persisted (self-healing: recomputed from entry_items every time it's
 * viewed, so it's always in sync even if entries were edited after the fact).
 */
async function computeDaySummary(db, dateKey, profile, { proteinPerKg = 1.6, activeBurnGoal = 300 } = {}) {
  const entries = await db.entry_items.where('date').equals(dateKey).toArray();

  const caloriesIn = round(sumBy(entries, (e) => (e.type === 'food' ? e.calories : 0)));
  const proteinIn = round(sumBy(entries, (e) => (e.type === 'food' ? e.protein : 0)), 1);
  const workoutBurn = round(sumBy(entries, (e) => (e.type === 'workout' ? e.calories : 0)));

  const bmr = calculateBMR(profile);
  const tdee = calculateTDEE(bmr, profile.activity_level);
  const dailyTarget = Math.max(tdee - profile.target_deficit, 0); // calorie budget for the day
  const totalOutput = tdee + workoutBurn;
  const netCalories = round(caloriesIn - totalOutput);
  const goalNet = -profile.target_deficit; // e.g. -500 for a 500kcal/day deficit goal
  const deltaFromGoal = round(netCalories - goalNet); // <=0 means on/ahead of goal

  const proteinTarget = round(profile.weight * proteinPerKg);

  await db.daily_logs.put({
    date: dateKey,
    calories_in: caloriesIn,
    calories_out: totalOutput,
    net_calories: netCalories,
    profile_weight: profile.weight,
  });

  return {
    dateKey,
    caloriesIn,
    proteinIn,
    workoutBurn,
    bmr,
    tdee,
    dailyTarget,
    totalOutput,
    netCalories,
    goalNet,
    deltaFromGoal,
    proteinTarget,
    activeBurnGoal,
  };
}

function sumBy(arr, fn) {
  return arr.reduce((total, item) => total + (Number(fn(item)) || 0), 0);
}

// =========================================================================
// 4. RENDERING -- QUESTIONNAIRE MODAL
// =========================================================================

function renderModalMarkup(existingProfile) {
  const p = existingProfile || {};
  const activityOptions = Object.entries(ACTIVITY_LABELS)
    .map(([val, label]) => `<option value="${val}" ${p.activity_level === val ? 'selected' : ''}>${label}</option>`)
    .join('');
  const goalOptions = Object.entries(GOAL_LABELS)
    .map(([val, label]) => {
      const selected = deficitMatchesGoal(p.target_deficit, val) ? 'selected' : '';
      return `<option value="${val}" ${selected}>${label}</option>`;
    })
    .join('');

  return `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center db-font-body" role="dialog" aria-modal="true" aria-labelledby="db-modal-title">
    <div class="absolute inset-0 bg-black/70" data-db-backdrop></div>
    <form data-db-form class="relative w-full sm:max-w-sm max-h-[92vh] overflow-y-auto bg-[var(--db-surface)] text-[var(--db-text)] rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl">
      <h2 id="db-modal-title" class="db-font-display text-2xl font-bold mb-1">Set up your profile</h2>
      <p class="text-sm text-[var(--db-muted)] mb-6">We use this to estimate your daily calorie budget. Nothing leaves your device.</p>

      <div class="grid grid-cols-2 gap-3 mb-4">
        <label class="block">
          <span class="text-xs uppercase tracking-wide text-[var(--db-muted)] db-font-mono">Age</span>
          <input required type="number" min="10" max="100" name="age" value="${p.age ?? ''}"
            class="db-focusable mt-1 w-full rounded-xl bg-[var(--db-surface-2)] border border-white/10 px-3 py-2.5 text-base" />
        </label>
        <label class="block">
          <span class="text-xs uppercase tracking-wide text-[var(--db-muted)] db-font-mono">Sex</span>
          <select required name="sex" class="db-focusable mt-1 w-full rounded-xl bg-[var(--db-surface-2)] border border-white/10 px-3 py-2.5 text-base">
            <option value="" disabled ${!p.sex ? 'selected' : ''}>Select</option>
            <option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option>
            <option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option>
            <option value="other" ${p.sex === 'other' ? 'selected' : ''}>Other</option>
          </select>
        </label>
        <label class="block">
          <span class="text-xs uppercase tracking-wide text-[var(--db-muted)] db-font-mono">Height (cm)</span>
          <input required type="number" min="100" max="250" name="height" value="${p.height ?? ''}"
            class="db-focusable mt-1 w-full rounded-xl bg-[var(--db-surface-2)] border border-white/10 px-3 py-2.5 text-base" />
        </label>
        <label class="block">
          <span class="text-xs uppercase tracking-wide text-[var(--db-muted)] db-font-mono">Weight (kg)</span>
          <input required type="number" step="0.1" min="30" max="300" name="weight" value="${p.weight ?? ''}"
            class="db-focusable mt-1 w-full rounded-xl bg-[var(--db-surface-2)] border border-white/10 px-3 py-2.5 text-base" />
        </label>
      </div>

      <label class="block mb-4">
        <span class="text-xs uppercase tracking-wide text-[var(--db-muted)] db-font-mono">Activity level</span>
        <select required name="activity_level" class="db-focusable mt-1 w-full rounded-xl bg-[var(--db-surface-2)] border border-white/10 px-3 py-2.5 text-base">
          <option value="" disabled ${!p.activity_level ? 'selected' : ''}>Select</option>
          ${activityOptions}
        </select>
      </label>

      <label class="block mb-6">
        <span class="text-xs uppercase tracking-wide text-[var(--db-muted)] db-font-mono">Goal</span>
        <select required name="goal" class="db-focusable mt-1 w-full rounded-xl bg-[var(--db-surface-2)] border border-white/10 px-3 py-2.5 text-base">
          ${goalOptions}
        </select>
      </label>

      <button type="submit" class="db-focusable w-full rounded-xl bg-[var(--db-gold)] text-[var(--db-ink)] font-semibold py-3.5 text-base active:scale-[0.98] transition-transform">
        Save and continue
      </button>
      ${existingProfile ? '<button type="button" data-db-cancel class="db-focusable w-full mt-2 rounded-xl border border-white/10 text-[var(--db-muted)] py-3 text-sm">Cancel</button>' : ''}
    </form>
  </div>`;
}

function deficitMatchesGoal(deficit, goal) {
  if (deficit == null) return goal === 'maintain' ? true : false;
  return GOAL_DEFICITS[goal] === deficit;
}

// =========================================================================
// 5. RENDERING -- ENERGY RING (signature visual)
// =========================================================================

const RING_SIZE = 220;
const RING_STROKE = 16;
const RING_GAP = 6;
const OUTER_R = (RING_SIZE - RING_STROKE) / 2;
const INNER_R = OUTER_R - RING_STROKE - RING_GAP;
const OUTER_C = 2 * Math.PI * OUTER_R;
const INNER_C = 2 * Math.PI * INNER_R;

function arcOffset(circumference, fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return circumference * (1 - clamped);
}

function renderEnergyRing(summary) {
  const consumedFraction = summary.dailyTarget > 0 ? summary.caloriesIn / summary.dailyTarget : 0;
  const burnFraction = summary.activeBurnGoal > 0 ? summary.workoutBurn / summary.activeBurnGoal : 0;
  const overConsumed = consumedFraction > 1;

  const statusOnTrack = summary.deltaFromGoal <= 0;
  const statusColor = statusOnTrack ? 'var(--db-teal)' : 'var(--db-gold)';
  const statusText = statusOnTrack
    ? `On track (${Math.abs(summary.deltaFromGoal)} kcal ahead)`
    : `${summary.deltaFromGoal} kcal over goal`;

  return `
  <div class="relative mx-auto" style="width:${RING_SIZE}px;height:${RING_SIZE}px;">
    <svg width="${RING_SIZE}" height="${RING_SIZE}" viewBox="0 0 ${RING_SIZE} ${RING_SIZE}" class="-rotate-90">
      <circle cx="${RING_SIZE / 2}" cy="${RING_SIZE / 2}" r="${OUTER_R}" fill="none" stroke="var(--db-track)" stroke-width="${RING_STROKE}" />
      <circle cx="${RING_SIZE / 2}" cy="${RING_SIZE / 2}" r="${INNER_R}" fill="none" stroke="var(--db-track)" stroke-width="${RING_STROKE}" />
      <circle data-db-ring-outer class="db-ring-arc" cx="${RING_SIZE / 2}" cy="${RING_SIZE / 2}" r="${OUTER_R}" fill="none"
        stroke="${overConsumed ? 'var(--db-coral)' : 'var(--db-coral)'}" stroke-width="${RING_STROKE}" stroke-linecap="round"
        stroke-dasharray="${OUTER_C}" stroke-dashoffset="${arcOffset(OUTER_C, consumedFraction)}" />
      <circle data-db-ring-inner class="db-ring-arc" cx="${RING_SIZE / 2}" cy="${RING_SIZE / 2}" r="${INNER_R}" fill="none"
        stroke="var(--db-teal)" stroke-width="${RING_STROKE}" stroke-linecap="round"
        stroke-dasharray="${INNER_C}" stroke-dashoffset="${arcOffset(INNER_C, burnFraction)}" />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center db-font-display">
      <span class="text-[11px] db-font-mono uppercase tracking-wider text-[var(--db-muted)]">Net</span>
      <span class="text-4xl font-bold leading-none mt-1">${summary.netCalories}</span>
      <span class="text-[11px] db-font-mono text-[var(--db-muted)] mt-1">kcal</span>
    </div>
  </div>
  <p class="text-center text-xs db-font-mono mt-3" style="color:${statusColor}">${statusText}</p>
  `;
}

// =========================================================================
// 6. RENDERING -- SUMMARY STATS + PROTEIN BAR
// =========================================================================

function renderStatPills(summary) {
  return `
  <div class="grid grid-cols-2 gap-3 mt-5">
    <div class="rounded-2xl bg-[var(--db-surface)] p-3.5">
      <div class="flex items-center gap-1.5 text-[11px] db-font-mono uppercase tracking-wide text-[var(--db-coral)]">
        <span class="w-2 h-2 rounded-full bg-[var(--db-coral)]"></span> Consumed
      </div>
      <div class="db-font-display text-xl font-bold mt-1">${summary.caloriesIn}<span class="text-xs text-[var(--db-muted)] font-normal ml-1">/ ${summary.dailyTarget} kcal</span></div>
    </div>
    <div class="rounded-2xl bg-[var(--db-surface)] p-3.5">
      <div class="flex items-center gap-1.5 text-[11px] db-font-mono uppercase tracking-wide text-[var(--db-teal)]">
        <span class="w-2 h-2 rounded-full bg-[var(--db-teal)]"></span> Burned
      </div>
      <div class="db-font-display text-xl font-bold mt-1">${summary.totalOutput}<span class="text-xs text-[var(--db-muted)] font-normal ml-1">kcal</span></div>
      <div class="text-[11px] text-[var(--db-muted)] db-font-mono mt-0.5">${summary.tdee} base + ${summary.workoutBurn} workout</div>
    </div>
  </div>`;
}

function renderProteinBar(summary) {
  const fraction = summary.proteinTarget > 0 ? summary.proteinIn / summary.proteinTarget : 0;
  const pct = Math.max(0, Math.min(100, round(fraction * 100)));
  return `
  <div class="mt-4 rounded-2xl bg-[var(--db-surface)] p-3.5">
    <div class="flex items-center justify-between text-[11px] db-font-mono uppercase tracking-wide text-[var(--db-indigo)]">
      <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-[var(--db-indigo)]"></span> Protein</span>
      <span class="text-[var(--db-muted)] normal-case">${summary.proteinIn}g / ${summary.proteinTarget}g</span>
    </div>
    <div class="mt-2 h-2.5 rounded-full bg-[var(--db-track)] overflow-hidden">
      <div class="h-full rounded-full db-ring-arc" style="width:${pct}%;background:var(--db-indigo);"></div>
    </div>
  </div>`;
}

// =========================================================================
// 7. RENDERING -- DATE NAVIGATION
// =========================================================================

function renderDateNav(currentDateKey) {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) days.push(addDays(currentDateKey, -i));
  // Always include a few future slots up to today so the strip doesn't jump around
  // as you page forward; forward navigation is capped at today.

  const chips = days
    .map((d) => {
      const { weekday, day } = formatDayLabel(d);
      const active = d === currentDateKey;
      return `
      <button type="button" data-db-day="${d}"
        class="db-focusable db-day-chip flex-shrink-0 w-11 h-14 rounded-2xl flex flex-col items-center justify-center db-font-mono transition-colors
          ${active ? 'bg-[var(--db-gold)] text-[var(--db-ink)]' : 'bg-[var(--db-surface)] text-[var(--db-muted)]'}">
        <span class="text-[10px] uppercase">${weekday}</span>
        <span class="text-sm font-semibold mt-0.5">${day}</span>
      </button>`;
    })
    .join('');

  const nextDisabled = isToday(currentDateKey);

  return `
  <div class="flex items-center justify-between mb-3">
    <button type="button" data-db-prev aria-label="Previous day" class="db-focusable w-9 h-9 rounded-full bg-[var(--db-surface)] flex items-center justify-center text-[var(--db-text)]">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <h1 class="db-font-display text-base font-semibold">${formatHeaderDate(currentDateKey)}</h1>
    <button type="button" data-db-next aria-label="Next day" ${nextDisabled ? 'disabled' : ''}
      class="db-focusable w-9 h-9 rounded-full bg-[var(--db-surface)] flex items-center justify-center ${nextDisabled ? 'text-[var(--db-muted)]/40' : 'text-[var(--db-text)]'}">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>
  <div data-db-day-strip class="db-day-strip flex gap-2 overflow-x-auto pb-1 mb-1">
    ${chips}
  </div>`;
}

// =========================================================================
// 8. MOUNT / CONTROLLER
// =========================================================================

/**
 * Mounts the dashboard into `container`. Shows the questionnaire modal on
 * first run (or when the saved profile is incomplete); otherwise renders
 * the daily summary header + date nav immediately.
 *
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {object} [options.db] - Dexie instance; defaults to window.db.
 * @param {number} [options.proteinPerKg=1.6] - g protein/kg bodyweight target.
 * @param {number} [options.activeBurnGoal=300] - kcal workout-burn ring goal.
 * @returns {{ refresh: Function, gotoDate: Function, openProfileEditor: Function, destroy: Function }}
 */
function mountDashboard(container, options = {}) {
  if (!container) throw new Error('mountDashboard: container element is required');

  const db = options.db || (typeof window !== 'undefined' ? window.db : null);
  if (!db) throw new Error('mountDashboard: no Dexie db instance found (pass options.db or set window.db)');

  const proteinPerKg = options.proteinPerKg || 1.6;
  const activeBurnGoal = options.activeBurnGoal || 300;

  injectThemeAssets();

  const state = {
    currentDateKey: toDateKey(new Date()),
    profile: null,
    modalEl: null,
  };

  container.innerHTML = `
    <div class="db-font-body min-h-screen bg-[var(--db-ink)] text-[var(--db-text)] px-4 pt-6 pb-10 max-w-sm mx-auto" data-db-app>
      <div data-db-datenav></div>
      <div data-db-summary></div>
    </div>
  `;

  const dateNavEl = container.querySelector('[data-db-datenav]');
  const summaryEl = container.querySelector('[data-db-summary]');

  async function renderSummary() {
    const summary = await computeDaySummary(db, state.currentDateKey, state.profile, {
      proteinPerKg,
      activeBurnGoal,
    });

    summaryEl.innerHTML = `
      ${renderEnergyRing(summary)}
      ${renderStatPills(summary)}
      ${renderProteinBar(summary)}
    `;
    return summary;
  }

  function renderDateNavigation() {
    dateNavEl.innerHTML = renderDateNav(state.currentDateKey);

    dateNavEl.querySelector('[data-db-prev]').addEventListener('click', () => gotoDate(addDays(state.currentDateKey, -1)));
    const nextBtn = dateNavEl.querySelector('[data-db-next]');
    nextBtn.addEventListener('click', () => {
      if (!nextBtn.disabled) gotoDate(addDays(state.currentDateKey, 1));
    });
    dateNavEl.querySelectorAll('[data-db-day]').forEach((chip) => {
      chip.addEventListener('click', () => gotoDate(chip.getAttribute('data-db-day')));
    });
  }

  async function gotoDate(dateKey) {
    // Never allow navigating past today.
    if (dateKey > toDateKey(new Date())) return;
    state.currentDateKey = dateKey;
    renderDateNavigation();
    await renderSummary();
  }

  function openModal({ dismissible = false } = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderModalMarkup(state.profile);
    const modalEl = wrapper.firstElementChild;
    document.body.appendChild(modalEl);
    state.modalEl = modalEl;

    const form = modalEl.querySelector('[data-db-form]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const newProfile = {
        age: Number(data.get('age')),
        sex: data.get('sex'),
        height: Number(data.get('height')),
        weight: Number(data.get('weight')),
        activity_level: data.get('activity_level'),
        target_deficit: deriveTargetDeficit(data.get('goal')),
      };
      await saveProfile(db, newProfile);
      state.profile = newProfile;
      closeModal();
      renderDateNavigation();
      await renderSummary();
    });

    if (dismissible) {
      const cancelBtn = modalEl.querySelector('[data-db-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      modalEl.querySelector('[data-db-backdrop]').addEventListener('click', closeModal);
    }
  }

  function closeModal() {
    if (state.modalEl) {
      state.modalEl.remove();
      state.modalEl = null;
    }
  }

  async function init() {
    state.profile = await loadProfile(db);
    renderDateNavigation();

    if (!isProfileComplete(state.profile)) {
      // First run (or incomplete profile): block on the questionnaire before
      // showing a summary that would otherwise divide by missing data.
      summaryEl.innerHTML = '';
      openModal({ dismissible: false });
    } else {
      await renderSummary();
    }
  }

  init();

  return {
    refresh: () => renderSummary(),
    gotoDate,
    openProfileEditor: () => openModal({ dismissible: true }),
    destroy: () => {
      closeModal();
      container.innerHTML = '';
    },
  };
}

// =========================================================================
// 9. EXPORTS
// =========================================================================

export {
  mountDashboard,
  calculateBMR,
  calculateTDEE,
  deriveTargetDeficit,
  computeDaySummary,
  toDateKey,
  addDays,
  isProfileComplete,
};

if (typeof window !== 'undefined') {
  window.mountDashboard = mountDashboard;
}
