/**
 * backup.js
 * -----------------------------------------------------------------------
 * Export / import all user-owned data as a single portable .json file:
 *   - user_profile (age/sex/height/weight/activity/goal)
 *   - daily_logs (historical rolled-up totals)
 *   - entry_items (every individual logged food/workout)
 *   - custom-learned food_library / workout_library entries (is_custom: true)
 *
 * The pre-loaded 325-food / 240-exercise seed dataset is intentionally
 * excluded from backups -- it ships with db-setup.js and is reproduced on
 * every install, so including it would just bloat every backup file.
 * -----------------------------------------------------------------------
 */

const BACKUP_SCHEMA_VERSION = 1;

/**
 * Reads every user-owned table and triggers a browser download of a single
 * JSON backup file.
 * @param {object} db - Dexie instance (e.g. window.db).
 * @param {object} [options]
 * @param {string} [options.filename] - defaults to `tracker-backup-<date>.json`.
 */
async function exportData(db, options = {}) {
  const [userProfile, dailyLogs, entryItems, allFoods, allWorkouts] = await Promise.all([
    db.user_profile.toArray(),
    db.daily_logs.toArray(),
    db.entry_items.toArray(),
    db.food_library.toArray(),
    db.workout_library.toArray(),
  ]);
  // Filtered in JS rather than via a Dexie .where('is_custom') index query --
  // boolean-indexed IndexedDB queries are inconsistent across browsers, and
  // these tables are small (hundreds of rows), so a plain filter is both
  // simpler and more reliable.
  const customFoods = allFoods.filter((f) => f.is_custom);
  const customWorkouts = allWorkouts.filter((w) => w.is_custom);

  const backup = {
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    user_profile: userProfile,
    daily_logs: dailyLogs,
    entry_items: entryItems,
    custom_food_library: customFoods,
    custom_workout_library: customWorkouts,
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = options.filename || `tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return backup;
}

function isValidBackup(parsed) {
  return (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray(parsed.user_profile) &&
    Array.isArray(parsed.daily_logs) &&
    Array.isArray(parsed.entry_items) &&
    Array.isArray(parsed.custom_food_library) &&
    Array.isArray(parsed.custom_workout_library)
  );
}

/**
 * Restores a backup file into the local database. Existing rows with
 * matching primary keys (date for daily_logs, id for everything else) are
 * overwritten; everything else is added alongside what's already there.
 * @param {object} db - Dexie instance.
 * @param {File} file - the .json file selected via an <input type="file">.
 */
async function importData(db, file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isValidBackup(parsed)) {
    throw new Error('That file does not look like a tracker backup (missing expected fields).');
  }

  await db.transaction(
    'rw',
    db.user_profile,
    db.daily_logs,
    db.entry_items,
    db.food_library,
    db.workout_library,
    async () => {
      if (parsed.user_profile.length) {
        await db.user_profile.put({ id: 1, ...parsed.user_profile[0] });
      }
      if (parsed.daily_logs.length) await db.daily_logs.bulkPut(parsed.daily_logs);
      if (parsed.entry_items.length) await db.entry_items.bulkPut(parsed.entry_items);
      if (parsed.custom_food_library.length) {
        await db.food_library.bulkPut(parsed.custom_food_library.map((f) => ({ ...f, is_custom: true })));
      }
      if (parsed.custom_workout_library.length) {
        await db.workout_library.bulkPut(parsed.custom_workout_library.map((w) => ({ ...w, is_custom: true })));
      }
    }
  );

  // Keep the in-memory seed arrays (used by parser.js's offline fuzzy match)
  // in sync with whatever custom entries were just restored.
  if (typeof window !== 'undefined') {
    const existingFoodIds = new Set((window.FOOD_LIBRARY_SEED || []).map((f) => f.id));
    const newFoods = parsed.custom_food_library.filter((f) => !existingFoodIds.has(f.id));
    window.FOOD_LIBRARY_SEED = (window.FOOD_LIBRARY_SEED || []).concat(newFoods);

    const existingWorkoutIds = new Set((window.WORKOUT_LIBRARY_SEED || []).map((w) => w.id));
    const newWorkouts = parsed.custom_workout_library.filter((w) => !existingWorkoutIds.has(w.id));
    window.WORKOUT_LIBRARY_SEED = (window.WORKOUT_LIBRARY_SEED || []).concat(newWorkouts);
  }

  return {
    profileRestored: parsed.user_profile.length > 0,
    dailyLogsRestored: parsed.daily_logs.length,
    entryItemsRestored: parsed.entry_items.length,
    customFoodsRestored: parsed.custom_food_library.length,
    customWorkoutsRestored: parsed.custom_workout_library.length,
  };
}

export { exportData, importData, BACKUP_SCHEMA_VERSION };

if (typeof window !== 'undefined') {
  window.exportData = exportData;
  window.importData = importData;
}
