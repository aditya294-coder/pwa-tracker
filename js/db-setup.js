/**
 * db-setup.js
 * -----------------------------------------------------------------------
 * Offline-first database module for the mobile calorie/workout tracking PWA.
 * Stack: Dexie.js (IndexedDB wrapper) + Fuse.js (fuzzy search).
 *
 * Include AFTER dexie.js and fuse.js are loaded, e.g.:
 *   <script src="https://unpkg.com/dexie/dist/dexie.js"></script>
 *   <script src="https://cdn.jsdelivr.net/npm/fuse.js@7.0.0"></script>
 *   <script src="db-setup.js"></script>
 *
 * NOTE ON DATA VOLUME:
 * This module ships with 325 curated Indian dishes and 240 curated exercises.
 * Every entry below is a real, named dish / exercise with an internally
 * consistent, estimate-grade nutrition or MET value (not scraped/verified
 * against a lab source) -- treat calorie/macro figures as good defaults,
 * not medical-grade truth, and let users override entries via `entry_items`.
 * The arrays are plain JS objects, so bulk-extending either list later
 * (e.g. to reach 600+ / 300+) is a matter of appending more rows in the
 * same shape -- see FOOD_LIBRARY_SEED / WORKOUT_LIBRARY_SEED below.
 * -----------------------------------------------------------------------
 */

// =========================================================================
// 1. DEXIE DATABASE + SCHEMA
// =========================================================================

const db = new Dexie('MobileTrackerDB');

db.version(1).stores({
  // Single-row table holding the user's profile. `id` is always 1 (singleton).
  user_profile: `
    id,
    age,
    sex,
    height,
    weight,
    activity_level,
    target_deficit
  `,

  // Master food reference library (pre-loaded + user-added foods).
  // `name` and `local_names` are indexed for lookups; Fuse.js handles fuzzy search
  // on top of this table's in-memory array for typo-tolerant matching.
  // `is_custom` distinguishes user-learned entries (added via the override
  // modal) from the pre-loaded seed data, so backups only export the former.
  // Stored on every row but intentionally NOT indexed here -- boolean-value
  // IndexedDB indexes behave inconsistently across browsers, and backup.js
  // just filters this field in JS instead (these tables are small).
  food_library: `
    ++id,
    name,
    *local_names,
    base_unit,
    calories,
    protein,
    carbs,
    fat
  `,

  // Master exercise/workout reference library.
  workout_library: `
    ++id,
    name,
    category,
    met_value,
    bodyweight_ratio
  `,

  // One row per calendar day -- rolled-up daily totals.
  // `date` is the primary key, formatted as 'YYYY-MM-DD' (sortable string).
  daily_logs: `
    date,
    calories_in,
    calories_out,
    net_calories,
    profile_weight
  `,

  // Individual logged entries (food eaten or workout performed).
  // Indexed by date + type so a day's food/workout entries can be queried fast.
  entry_items: `
    ++id,
    date,
    type,
    raw_text,
    matched_name,
    quantity,
    calories,
    protein,
    carbs,
    fat,
    confidence_score,
    [date+type]
  `
});

// =========================================================================
// 2. FOOD LIBRARY SEED DATA (Indian cooked dishes)
// =========================================================================
// Macros are per `base_unit` serving (bowl/piece/100g as noted per item).

const FOOD_LIBRARY_SEED = [
  {
    "id": 1,
    "name": "Dal Tadka",
    "local_names": [
      "Toor Dal Tadka"
    ],
    "base_unit": "1 bowl (150g)",
    "calories": 180,
    "protein": 9,
    "carbs": 22,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 2,
    "name": "Dal Fry",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 190,
    "protein": 9,
    "carbs": 22,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 3,
    "name": "Dal Makhani",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 270,
    "protein": 10,
    "carbs": 26,
    "fat": 14,
    "is_custom": false
  },
  {
    "id": 4,
    "name": "Palak Dal",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 160,
    "protein": 8,
    "carbs": 20,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 5,
    "name": "Chana Dal",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 210,
    "protein": 11,
    "carbs": 30,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 6,
    "name": "Moong Dal",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 150,
    "protein": 9,
    "carbs": 22,
    "fat": 3,
    "is_custom": false
  },
  {
    "id": 7,
    "name": "Masoor Dal",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 160,
    "protein": 9,
    "carbs": 24,
    "fat": 3,
    "is_custom": false
  },
  {
    "id": 8,
    "name": "Rajma Masala",
    "local_names": [
      "Rajma"
    ],
    "base_unit": "1 bowl (150g)",
    "calories": 220,
    "protein": 9,
    "carbs": 30,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 9,
    "name": "Toor Dal",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 170,
    "protein": 9,
    "carbs": 24,
    "fat": 4,
    "is_custom": false
  },
  {
    "id": 10,
    "name": "Urad Dal",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 200,
    "protein": 10,
    "carbs": 26,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 11,
    "name": "Sambar",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 140,
    "protein": 6,
    "carbs": 18,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 12,
    "name": "Kadhi Pakora",
    "local_names": [
      "Kadhi"
    ],
    "base_unit": "1 bowl (150g)",
    "calories": 210,
    "protein": 6,
    "carbs": 18,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 13,
    "name": "Panchmel Dal",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 190,
    "protein": 9,
    "carbs": 24,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 14,
    "name": "Dal Palak",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 165,
    "protein": 8,
    "carbs": 20,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 15,
    "name": "Langar Dal",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 175,
    "protein": 8,
    "carbs": 22,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 16,
    "name": "Roti",
    "local_names": [
      "Chapati",
      "Phulka"
    ],
    "base_unit": "1 piece",
    "calories": 80,
    "protein": 3,
    "carbs": 15,
    "fat": 1,
    "is_custom": false
  },
  {
    "id": 17,
    "name": "Chapati",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 80,
    "protein": 3,
    "carbs": 15,
    "fat": 1,
    "is_custom": false
  },
  {
    "id": 18,
    "name": "Naan",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 260,
    "protein": 8,
    "carbs": 40,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 19,
    "name": "Butter Naan",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 310,
    "protein": 8,
    "carbs": 40,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 20,
    "name": "Garlic Naan",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 300,
    "protein": 8,
    "carbs": 42,
    "fat": 11,
    "is_custom": false
  },
  {
    "id": 21,
    "name": "Paratha (Plain)",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 180,
    "protein": 4,
    "carbs": 24,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 22,
    "name": "Aloo Paratha",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 250,
    "protein": 5,
    "carbs": 34,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 23,
    "name": "Gobi Paratha",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 230,
    "protein": 5,
    "carbs": 30,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 24,
    "name": "Paneer Paratha",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 280,
    "protein": 9,
    "carbs": 28,
    "fat": 14,
    "is_custom": false
  },
  {
    "id": 25,
    "name": "Mooli Paratha",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 220,
    "protein": 4,
    "carbs": 30,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 26,
    "name": "Lachha Paratha",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 260,
    "protein": 5,
    "carbs": 32,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 27,
    "name": "Kulcha",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 220,
    "protein": 6,
    "carbs": 34,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 28,
    "name": "Bhatura",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 340,
    "protein": 6,
    "carbs": 40,
    "fat": 17,
    "is_custom": false
  },
  {
    "id": 29,
    "name": "Puri",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 100,
    "protein": 2,
    "carbs": 11,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 30,
    "name": "Missi Roti",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 150,
    "protein": 5,
    "carbs": 22,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 31,
    "name": "Tandoori Roti",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 110,
    "protein": 4,
    "carbs": 20,
    "fat": 1.5,
    "is_custom": false
  },
  {
    "id": 32,
    "name": "Rumali Roti",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 90,
    "protein": 3,
    "carbs": 17,
    "fat": 1,
    "is_custom": false
  },
  {
    "id": 33,
    "name": "Makki di Roti",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 150,
    "protein": 3,
    "carbs": 24,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 34,
    "name": "Bajra Roti",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 110,
    "protein": 3,
    "carbs": 20,
    "fat": 2,
    "is_custom": false
  },
  {
    "id": 35,
    "name": "Jowar Roti",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 105,
    "protein": 3,
    "carbs": 21,
    "fat": 1.5,
    "is_custom": false
  },
  {
    "id": 36,
    "name": "Cheese Naan",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 320,
    "protein": 10,
    "carbs": 40,
    "fat": 13,
    "is_custom": false
  },
  {
    "id": 37,
    "name": "Onion Kulcha",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 230,
    "protein": 6,
    "carbs": 35,
    "fat": 6.5,
    "is_custom": false
  },
  {
    "id": 38,
    "name": "Steamed Rice",
    "local_names": [
      "Chawal"
    ],
    "base_unit": "1 bowl (200g)",
    "calories": 240,
    "protein": 4,
    "carbs": 53,
    "fat": 0.5,
    "is_custom": false
  },
  {
    "id": 39,
    "name": "Jeera Rice",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 280,
    "protein": 4,
    "carbs": 52,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 40,
    "name": "Veg Pulao",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 6,
    "carbs": 50,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 41,
    "name": "Chicken Biryani",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 420,
    "protein": 22,
    "carbs": 45,
    "fat": 16,
    "is_custom": false
  },
  {
    "id": 42,
    "name": "Mutton Biryani",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 460,
    "protein": 24,
    "carbs": 44,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 43,
    "name": "Egg Biryani",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 380,
    "protein": 14,
    "carbs": 46,
    "fat": 15,
    "is_custom": false
  },
  {
    "id": 44,
    "name": "Veg Biryani",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 340,
    "protein": 7,
    "carbs": 52,
    "fat": 11,
    "is_custom": false
  },
  {
    "id": 45,
    "name": "Lemon Rice",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 4,
    "carbs": 45,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 46,
    "name": "Curd Rice",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 6,
    "carbs": 36,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 47,
    "name": "Tamarind Rice",
    "local_names": [
      "Puliyodarai"
    ],
    "base_unit": "1 bowl (200g)",
    "calories": 270,
    "protein": 5,
    "carbs": 46,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 48,
    "name": "Bisi Bele Bath",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 8,
    "carbs": 48,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 49,
    "name": "Khichdi",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 230,
    "protein": 8,
    "carbs": 38,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 50,
    "name": "Ven Pongal",
    "local_names": [
      "Pongal"
    ],
    "base_unit": "1 bowl (200g)",
    "calories": 280,
    "protein": 7,
    "carbs": 42,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 51,
    "name": "Fried Rice (Veg)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 320,
    "protein": 6,
    "carbs": 50,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 52,
    "name": "Fried Rice (Egg)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 360,
    "protein": 12,
    "carbs": 48,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 53,
    "name": "Fried Rice (Chicken)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 400,
    "protein": 18,
    "carbs": 46,
    "fat": 13,
    "is_custom": false
  },
  {
    "id": 54,
    "name": "Coconut Rice",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 290,
    "protein": 4,
    "carbs": 44,
    "fat": 11,
    "is_custom": false
  },
  {
    "id": 55,
    "name": "Mushroom Pulao",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 280,
    "protein": 6,
    "carbs": 48,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 56,
    "name": "Prawn Biryani",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 430,
    "protein": 20,
    "carbs": 44,
    "fat": 17,
    "is_custom": false
  },
  {
    "id": 57,
    "name": "Paneer Biryani",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 400,
    "protein": 12,
    "carbs": 46,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 58,
    "name": "Paneer Butter Masala",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 380,
    "protein": 14,
    "carbs": 16,
    "fat": 28,
    "is_custom": false
  },
  {
    "id": 59,
    "name": "Paneer Tikka Masala",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 350,
    "protein": 15,
    "carbs": 14,
    "fat": 24,
    "is_custom": false
  },
  {
    "id": 60,
    "name": "Paneer Bhurji",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 16,
    "carbs": 8,
    "fat": 22,
    "is_custom": false
  },
  {
    "id": 61,
    "name": "Kadai Paneer",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 320,
    "protein": 14,
    "carbs": 14,
    "fat": 22,
    "is_custom": false
  },
  {
    "id": 62,
    "name": "Palak Paneer",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 290,
    "protein": 14,
    "carbs": 12,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 63,
    "name": "Matar Paneer",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 13,
    "carbs": 18,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 64,
    "name": "Paneer Do Pyaza",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 310,
    "protein": 14,
    "carbs": 15,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 65,
    "name": "Chilli Paneer (Dry)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 340,
    "protein": 14,
    "carbs": 22,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 66,
    "name": "Paneer Tikka (Grilled)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 16,
    "carbs": 8,
    "fat": 17,
    "is_custom": false
  },
  {
    "id": 67,
    "name": "Shahi Paneer",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 360,
    "protein": 13,
    "carbs": 18,
    "fat": 25,
    "is_custom": false
  },
  {
    "id": 68,
    "name": "Paneer Lababdar",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 370,
    "protein": 14,
    "carbs": 17,
    "fat": 26,
    "is_custom": false
  },
  {
    "id": 69,
    "name": "Paneer Jalfrezi",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 13,
    "carbs": 16,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 70,
    "name": "Chicken Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 320,
    "protein": 26,
    "carbs": 8,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 71,
    "name": "Butter Chicken",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 400,
    "protein": 25,
    "carbs": 10,
    "fat": 28,
    "is_custom": false
  },
  {
    "id": 72,
    "name": "Chicken Tikka Masala",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 370,
    "protein": 27,
    "carbs": 10,
    "fat": 24,
    "is_custom": false
  },
  {
    "id": 73,
    "name": "Chettinad Chicken",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 340,
    "protein": 27,
    "carbs": 8,
    "fat": 22,
    "is_custom": false
  },
  {
    "id": 74,
    "name": "Kadai Chicken",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 330,
    "protein": 26,
    "carbs": 9,
    "fat": 21,
    "is_custom": false
  },
  {
    "id": 75,
    "name": "Chicken 65",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 350,
    "protein": 24,
    "carbs": 14,
    "fat": 21,
    "is_custom": false
  },
  {
    "id": 76,
    "name": "Chicken Tikka",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 240,
    "protein": 28,
    "carbs": 4,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 77,
    "name": "Tandoori Chicken",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 30,
    "carbs": 3,
    "fat": 13,
    "is_custom": false
  },
  {
    "id": 78,
    "name": "Chicken Korma",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 380,
    "protein": 24,
    "carbs": 10,
    "fat": 26,
    "is_custom": false
  },
  {
    "id": 79,
    "name": "Chicken Manchurian",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 320,
    "protein": 22,
    "carbs": 20,
    "fat": 16,
    "is_custom": false
  },
  {
    "id": 80,
    "name": "Chicken Lollipop",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 22,
    "carbs": 16,
    "fat": 17,
    "is_custom": false
  },
  {
    "id": 81,
    "name": "Chicken Chettinad Dry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 310,
    "protein": 27,
    "carbs": 6,
    "fat": 19,
    "is_custom": false
  },
  {
    "id": 82,
    "name": "Chicken Vindaloo",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 350,
    "protein": 25,
    "carbs": 10,
    "fat": 22,
    "is_custom": false
  },
  {
    "id": 83,
    "name": "Chicken Do Pyaza",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 320,
    "protein": 26,
    "carbs": 9,
    "fat": 19,
    "is_custom": false
  },
  {
    "id": 84,
    "name": "Chicken Saagwala",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 310,
    "protein": 26,
    "carbs": 8,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 85,
    "name": "Mutton Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 380,
    "protein": 25,
    "carbs": 8,
    "fat": 26,
    "is_custom": false
  },
  {
    "id": 86,
    "name": "Mutton Rogan Josh",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 400,
    "protein": 26,
    "carbs": 9,
    "fat": 28,
    "is_custom": false
  },
  {
    "id": 87,
    "name": "Mutton Korma",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 420,
    "protein": 24,
    "carbs": 10,
    "fat": 30,
    "is_custom": false
  },
  {
    "id": 88,
    "name": "Mutton Kadai",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 390,
    "protein": 25,
    "carbs": 9,
    "fat": 27,
    "is_custom": false
  },
  {
    "id": 89,
    "name": "Mutton Do Pyaza",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 380,
    "protein": 24,
    "carbs": 10,
    "fat": 26,
    "is_custom": false
  },
  {
    "id": 90,
    "name": "Mutton Keema",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 360,
    "protein": 24,
    "carbs": 6,
    "fat": 26,
    "is_custom": false
  },
  {
    "id": 91,
    "name": "Mutton Vindaloo",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 400,
    "protein": 25,
    "carbs": 11,
    "fat": 28,
    "is_custom": false
  },
  {
    "id": 92,
    "name": "Mutton Chettinad",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 390,
    "protein": 25,
    "carbs": 8,
    "fat": 27,
    "is_custom": false
  },
  {
    "id": 93,
    "name": "Boiled Egg",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 78,
    "protein": 6.3,
    "carbs": 0.6,
    "fat": 5.3,
    "is_custom": false
  },
  {
    "id": 94,
    "name": "Egg Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 13,
    "carbs": 8,
    "fat": 19,
    "is_custom": false
  },
  {
    "id": 95,
    "name": "Egg Bhurji",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 13,
    "carbs": 4,
    "fat": 17,
    "is_custom": false
  },
  {
    "id": 96,
    "name": "Masala Omelette",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 180,
    "protein": 12,
    "carbs": 3,
    "fat": 13,
    "is_custom": false
  },
  {
    "id": 97,
    "name": "Plain Omelette",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 150,
    "protein": 11,
    "carbs": 1.5,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 98,
    "name": "Egg Fried Rice",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 360,
    "protein": 12,
    "carbs": 48,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 99,
    "name": "Egg Curry Dry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 230,
    "protein": 13,
    "carbs": 6,
    "fat": 16,
    "is_custom": false
  },
  {
    "id": 100,
    "name": "Anda Bhurji Pav",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 340,
    "protein": 15,
    "carbs": 30,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 101,
    "name": "Fish Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 280,
    "protein": 22,
    "carbs": 8,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 102,
    "name": "Fish Fry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 22,
    "carbs": 10,
    "fat": 16,
    "is_custom": false
  },
  {
    "id": 103,
    "name": "Amritsari Fish",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 20,
    "carbs": 14,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 104,
    "name": "Goan Fish Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 290,
    "protein": 21,
    "carbs": 9,
    "fat": 19,
    "is_custom": false
  },
  {
    "id": 105,
    "name": "Prawn Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 20,
    "carbs": 9,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 106,
    "name": "Prawn Masala",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 310,
    "protein": 21,
    "carbs": 10,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 107,
    "name": "Fish Tikka",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 230,
    "protein": 24,
    "carbs": 4,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 108,
    "name": "Malabar Fish Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 21,
    "carbs": 8,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 109,
    "name": "Crab Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 280,
    "protein": 19,
    "carbs": 9,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 110,
    "name": "Fish Moilee",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 280,
    "protein": 20,
    "carbs": 8,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 111,
    "name": "Aloo Gobi",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 200,
    "protein": 4,
    "carbs": 26,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 112,
    "name": "Bhindi Masala",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 180,
    "protein": 3,
    "carbs": 18,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 113,
    "name": "Baingan Bharta",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 190,
    "protein": 3,
    "carbs": 16,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 114,
    "name": "Mixed Veg Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 210,
    "protein": 5,
    "carbs": 22,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 115,
    "name": "Chana Masala",
    "local_names": [
      "Chole"
    ],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 10,
    "carbs": 34,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 116,
    "name": "Aloo Matar",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 5,
    "carbs": 28,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 117,
    "name": "Aloo Jeera",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 210,
    "protein": 3,
    "carbs": 30,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 118,
    "name": "Lauki Sabzi",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 130,
    "protein": 2,
    "carbs": 14,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 119,
    "name": "Tinda Masala",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 140,
    "protein": 3,
    "carbs": 15,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 120,
    "name": "Palak Sabzi",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 150,
    "protein": 4,
    "carbs": 12,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 121,
    "name": "Gobi Manchurian",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 6,
    "carbs": 30,
    "fat": 15,
    "is_custom": false
  },
  {
    "id": 122,
    "name": "Kadhi Chawal (Kadhi only)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 200,
    "protein": 5,
    "carbs": 16,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 123,
    "name": "Baigan Aloo",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 200,
    "protein": 3,
    "carbs": 24,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 124,
    "name": "Karela Sabzi",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 150,
    "protein": 3,
    "carbs": 14,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 125,
    "name": "Kaddu Sabzi",
    "local_names": [
      "Pumpkin Sabzi"
    ],
    "base_unit": "1 bowl (200g)",
    "calories": 140,
    "protein": 2,
    "carbs": 18,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 126,
    "name": "Bharwa Bhindi",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 190,
    "protein": 4,
    "carbs": 17,
    "fat": 11,
    "is_custom": false
  },
  {
    "id": 127,
    "name": "Sarson ka Saag",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 180,
    "protein": 5,
    "carbs": 12,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 128,
    "name": "Methi Aloo",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 200,
    "protein": 4,
    "carbs": 26,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 129,
    "name": "Vegetable Kofta Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 6,
    "carbs": 24,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 130,
    "name": "Chana Chaat",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 9,
    "carbs": 32,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 131,
    "name": "Undhiyu",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 6,
    "carbs": 26,
    "fat": 14,
    "is_custom": false
  },
  {
    "id": 132,
    "name": "Avial",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 200,
    "protein": 4,
    "carbs": 20,
    "fat": 11,
    "is_custom": false
  },
  {
    "id": 133,
    "name": "Rajma Chawal (Rajma only)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 9,
    "carbs": 30,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 134,
    "name": "Bhindi Do Pyaza",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 190,
    "protein": 3,
    "carbs": 18,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 135,
    "name": "Aloo Baingan",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 195,
    "protein": 3,
    "carbs": 25,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 136,
    "name": "Idli",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 39,
    "protein": 2,
    "carbs": 8,
    "fat": 0.2,
    "is_custom": false
  },
  {
    "id": 137,
    "name": "Plain Dosa",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 133,
    "protein": 3,
    "carbs": 20,
    "fat": 4,
    "is_custom": false
  },
  {
    "id": 138,
    "name": "Masala Dosa",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 210,
    "protein": 5,
    "carbs": 28,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 139,
    "name": "Rava Dosa",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 180,
    "protein": 4,
    "carbs": 24,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 140,
    "name": "Onion Uttapam",
    "local_names": [
      "Uttapam"
    ],
    "base_unit": "1 piece",
    "calories": 220,
    "protein": 5,
    "carbs": 30,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 141,
    "name": "Medu Vada",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 110,
    "protein": 3,
    "carbs": 12,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 142,
    "name": "Upma",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 5,
    "carbs": 34,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 143,
    "name": "Rava Upma",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 5,
    "carbs": 34,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 144,
    "name": "Idiyappam",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 110,
    "protein": 2,
    "carbs": 24,
    "fat": 0.5,
    "is_custom": false
  },
  {
    "id": 145,
    "name": "Appam",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 120,
    "protein": 2,
    "carbs": 20,
    "fat": 3,
    "is_custom": false
  },
  {
    "id": 146,
    "name": "Set Dosa",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 150,
    "protein": 3,
    "carbs": 24,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 147,
    "name": "Mysore Masala Dosa",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 260,
    "protein": 6,
    "carbs": 30,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 148,
    "name": "Pesarattu",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 160,
    "protein": 6,
    "carbs": 22,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 149,
    "name": "Vermicelli Upma",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 210,
    "protein": 4,
    "carbs": 32,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 150,
    "name": "Pongal (Sweet)",
    "local_names": [
      "Sakkarai Pongal"
    ],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 5,
    "carbs": 48,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 151,
    "name": "Samosa",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 260,
    "protein": 4,
    "carbs": 28,
    "fat": 15,
    "is_custom": false
  },
  {
    "id": 152,
    "name": "Kachori",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 280,
    "protein": 5,
    "carbs": 30,
    "fat": 16,
    "is_custom": false
  },
  {
    "id": 153,
    "name": "Vegetable Pakora",
    "local_names": [
      "Pakoda"
    ],
    "base_unit": "100g",
    "calories": 220,
    "protein": 4,
    "carbs": 20,
    "fat": 14,
    "is_custom": false
  },
  {
    "id": 154,
    "name": "Vada Pav",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 290,
    "protein": 6,
    "carbs": 38,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 155,
    "name": "Pav Bhaji",
    "local_names": [],
    "base_unit": "1 plate",
    "calories": 400,
    "protein": 8,
    "carbs": 50,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 156,
    "name": "Bhel Puri",
    "local_names": [],
    "base_unit": "1 plate (150g)",
    "calories": 250,
    "protein": 5,
    "carbs": 40,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 157,
    "name": "Sev Puri",
    "local_names": [],
    "base_unit": "1 plate (150g)",
    "calories": 280,
    "protein": 5,
    "carbs": 38,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 158,
    "name": "Pani Puri",
    "local_names": [],
    "base_unit": "6 pieces",
    "calories": 200,
    "protein": 4,
    "carbs": 34,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 159,
    "name": "Dahi Puri",
    "local_names": [],
    "base_unit": "6 pieces",
    "calories": 260,
    "protein": 6,
    "carbs": 36,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 160,
    "name": "Aloo Tikki",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 180,
    "protein": 3,
    "carbs": 22,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 161,
    "name": "Dhokla",
    "local_names": [],
    "base_unit": "100g",
    "calories": 160,
    "protein": 5,
    "carbs": 24,
    "fat": 4,
    "is_custom": false
  },
  {
    "id": 162,
    "name": "Khaman",
    "local_names": [],
    "base_unit": "100g",
    "calories": 170,
    "protein": 5,
    "carbs": 25,
    "fat": 4,
    "is_custom": false
  },
  {
    "id": 163,
    "name": "Kathi Roll (Chicken)",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 380,
    "protein": 20,
    "carbs": 34,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 164,
    "name": "Kathi Roll (Veg)",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 320,
    "protein": 8,
    "carbs": 40,
    "fat": 14,
    "is_custom": false
  },
  {
    "id": 165,
    "name": "Chole Bhature (Chole only)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 10,
    "carbs": 34,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 166,
    "name": "Momos (Veg, steamed)",
    "local_names": [],
    "base_unit": "6 pieces",
    "calories": 200,
    "protein": 5,
    "carbs": 30,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 167,
    "name": "Momos (Chicken, steamed)",
    "local_names": [],
    "base_unit": "6 pieces",
    "calories": 240,
    "protein": 12,
    "carbs": 28,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 168,
    "name": "Spring Roll (Veg)",
    "local_names": [],
    "base_unit": "3 pieces",
    "calories": 240,
    "protein": 4,
    "carbs": 28,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 169,
    "name": "Cutlet (Veg)",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 200,
    "protein": 4,
    "carbs": 22,
    "fat": 11,
    "is_custom": false
  },
  {
    "id": 170,
    "name": "Papdi Chaat",
    "local_names": [],
    "base_unit": "1 plate (150g)",
    "calories": 300,
    "protein": 6,
    "carbs": 38,
    "fat": 13,
    "is_custom": false
  },
  {
    "id": 171,
    "name": "Aloo Chaat",
    "local_names": [],
    "base_unit": "1 plate (150g)",
    "calories": 220,
    "protein": 4,
    "carbs": 32,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 172,
    "name": "Corn Chaat",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 180,
    "protein": 5,
    "carbs": 28,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 173,
    "name": "Masala Peanuts",
    "local_names": [],
    "base_unit": "50g",
    "calories": 200,
    "protein": 8,
    "carbs": 14,
    "fat": 13,
    "is_custom": false
  },
  {
    "id": 174,
    "name": "Bhakarwadi",
    "local_names": [],
    "base_unit": "50g",
    "calories": 220,
    "protein": 4,
    "carbs": 26,
    "fat": 11,
    "is_custom": false
  },
  {
    "id": 175,
    "name": "Mirchi Bajji",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 240,
    "protein": 4,
    "carbs": 22,
    "fat": 15,
    "is_custom": false
  },
  {
    "id": 176,
    "name": "Gulab Jamun",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 150,
    "protein": 2,
    "carbs": 20,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 177,
    "name": "Rasgulla",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 106,
    "protein": 2,
    "carbs": 22,
    "fat": 0.5,
    "is_custom": false
  },
  {
    "id": 178,
    "name": "Jalebi",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 150,
    "protein": 1,
    "carbs": 22,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 179,
    "name": "Besan Ladoo",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 180,
    "protein": 3,
    "carbs": 20,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 180,
    "name": "Motichoor Ladoo",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 160,
    "protein": 2,
    "carbs": 22,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 181,
    "name": "Kaju Katli",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 100,
    "protein": 2,
    "carbs": 12,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 182,
    "name": "Gajar Halwa",
    "local_names": [
      "Gajar ka Halwa"
    ],
    "base_unit": "1 bowl (150g)",
    "calories": 250,
    "protein": 4,
    "carbs": 30,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 183,
    "name": "Moong Dal Halwa",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 300,
    "protein": 5,
    "carbs": 32,
    "fat": 17,
    "is_custom": false
  },
  {
    "id": 184,
    "name": "Rice Kheer",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 220,
    "protein": 5,
    "carbs": 32,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 185,
    "name": "Seviyan Kheer",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 230,
    "protein": 5,
    "carbs": 34,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 186,
    "name": "Rasmalai",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 180,
    "protein": 5,
    "carbs": 22,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 187,
    "name": "Barfi (Milk)",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 150,
    "protein": 3,
    "carbs": 18,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 188,
    "name": "Soan Papdi",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 140,
    "protein": 1,
    "carbs": 20,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 189,
    "name": "Peda",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 120,
    "protein": 2,
    "carbs": 16,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 190,
    "name": "Shrikhand",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 220,
    "protein": 5,
    "carbs": 30,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 191,
    "name": "Kulfi",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 200,
    "protein": 4,
    "carbs": 22,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 192,
    "name": "Masala Chai",
    "local_names": [
      "Chai"
    ],
    "base_unit": "1 cup (150ml)",
    "calories": 90,
    "protein": 2,
    "carbs": 12,
    "fat": 3,
    "is_custom": false
  },
  {
    "id": 193,
    "name": "Sweet Lassi",
    "local_names": [],
    "base_unit": "1 glass (250ml)",
    "calories": 220,
    "protein": 6,
    "carbs": 30,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 194,
    "name": "Salted Lassi",
    "local_names": [],
    "base_unit": "1 glass (250ml)",
    "calories": 120,
    "protein": 5,
    "carbs": 10,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 195,
    "name": "Buttermilk",
    "local_names": [
      "Chaas"
    ],
    "base_unit": "1 glass (250ml)",
    "calories": 40,
    "protein": 2,
    "carbs": 4,
    "fat": 1,
    "is_custom": false
  },
  {
    "id": 196,
    "name": "Coconut Water",
    "local_names": [],
    "base_unit": "1 glass (250ml)",
    "calories": 45,
    "protein": 1,
    "carbs": 9,
    "fat": 0,
    "is_custom": false
  },
  {
    "id": 197,
    "name": "Filter Coffee",
    "local_names": [],
    "base_unit": "1 cup (150ml)",
    "calories": 60,
    "protein": 2,
    "carbs": 8,
    "fat": 2,
    "is_custom": false
  },
  {
    "id": 198,
    "name": "Sugarcane Juice",
    "local_names": [],
    "base_unit": "1 glass (250ml)",
    "calories": 180,
    "protein": 0,
    "carbs": 44,
    "fat": 0,
    "is_custom": false
  },
  {
    "id": 199,
    "name": "Mango Lassi",
    "local_names": [],
    "base_unit": "1 glass (250ml)",
    "calories": 260,
    "protein": 6,
    "carbs": 40,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 200,
    "name": "Badam Milk",
    "local_names": [],
    "base_unit": "1 glass (250ml)",
    "calories": 200,
    "protein": 7,
    "carbs": 20,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 201,
    "name": "Rooh Afza Sharbat",
    "local_names": [],
    "base_unit": "1 glass (250ml)",
    "calories": 150,
    "protein": 0,
    "carbs": 38,
    "fat": 0,
    "is_custom": false
  },
  {
    "id": 202,
    "name": "Banana",
    "local_names": [],
    "base_unit": "100g",
    "calories": 89,
    "protein": 1.1,
    "carbs": 23,
    "fat": 0.3,
    "is_custom": false
  },
  {
    "id": 203,
    "name": "Apple",
    "local_names": [],
    "base_unit": "100g",
    "calories": 52,
    "protein": 0.3,
    "carbs": 14,
    "fat": 0.2,
    "is_custom": false
  },
  {
    "id": 204,
    "name": "Mango (Alphonso)",
    "local_names": [],
    "base_unit": "100g",
    "calories": 60,
    "protein": 0.8,
    "carbs": 15,
    "fat": 0.4,
    "is_custom": false
  },
  {
    "id": 205,
    "name": "Papaya",
    "local_names": [],
    "base_unit": "100g",
    "calories": 43,
    "protein": 0.5,
    "carbs": 11,
    "fat": 0.3,
    "is_custom": false
  },
  {
    "id": 206,
    "name": "Guava",
    "local_names": [],
    "base_unit": "100g",
    "calories": 68,
    "protein": 2.6,
    "carbs": 14,
    "fat": 1,
    "is_custom": false
  },
  {
    "id": 207,
    "name": "Watermelon",
    "local_names": [],
    "base_unit": "100g",
    "calories": 30,
    "protein": 0.6,
    "carbs": 8,
    "fat": 0.2,
    "is_custom": false
  },
  {
    "id": 208,
    "name": "Pomegranate",
    "local_names": [],
    "base_unit": "100g",
    "calories": 83,
    "protein": 1.7,
    "carbs": 19,
    "fat": 1.2,
    "is_custom": false
  },
  {
    "id": 209,
    "name": "Orange",
    "local_names": [],
    "base_unit": "100g",
    "calories": 47,
    "protein": 0.9,
    "carbs": 12,
    "fat": 0.1,
    "is_custom": false
  },
  {
    "id": 210,
    "name": "Grapes",
    "local_names": [],
    "base_unit": "100g",
    "calories": 69,
    "protein": 0.7,
    "carbs": 18,
    "fat": 0.2,
    "is_custom": false
  },
  {
    "id": 211,
    "name": "Pineapple",
    "local_names": [],
    "base_unit": "100g",
    "calories": 50,
    "protein": 0.5,
    "carbs": 13,
    "fat": 0.1,
    "is_custom": false
  },
  {
    "id": 212,
    "name": "Chikoo",
    "local_names": [
      "Sapota"
    ],
    "base_unit": "100g",
    "calories": 83,
    "protein": 0.4,
    "carbs": 20,
    "fat": 1.1,
    "is_custom": false
  },
  {
    "id": 213,
    "name": "Custard Apple",
    "local_names": [],
    "base_unit": "100g",
    "calories": 94,
    "protein": 1.6,
    "carbs": 24,
    "fat": 0.3,
    "is_custom": false
  },
  {
    "id": 214,
    "name": "Curd (Dahi)",
    "local_names": [
      "Yogurt"
    ],
    "base_unit": "100g",
    "calories": 60,
    "protein": 3.5,
    "carbs": 4.7,
    "fat": 3.3,
    "is_custom": false
  },
  {
    "id": 215,
    "name": "Paneer (Raw)",
    "local_names": [],
    "base_unit": "100g",
    "calories": 265,
    "protein": 18,
    "carbs": 3.4,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 216,
    "name": "Ghee",
    "local_names": [],
    "base_unit": "1 tbsp (13g)",
    "calories": 900,
    "protein": 0,
    "carbs": 0,
    "fat": 100,
    "is_custom": false
  },
  {
    "id": 217,
    "name": "Butter",
    "local_names": [],
    "base_unit": "1 tbsp (14g)",
    "calories": 720,
    "protein": 0.9,
    "carbs": 0.1,
    "fat": 81,
    "is_custom": false
  },
  {
    "id": 218,
    "name": "Milk (Full Cream)",
    "local_names": [],
    "base_unit": "100ml",
    "calories": 61,
    "protein": 3.2,
    "carbs": 4.7,
    "fat": 3.3,
    "is_custom": false
  },
  {
    "id": 219,
    "name": "Toned Milk",
    "local_names": [],
    "base_unit": "100ml",
    "calories": 48,
    "protein": 3.1,
    "carbs": 4.9,
    "fat": 1.7,
    "is_custom": false
  },
  {
    "id": 220,
    "name": "Peanut Chikki",
    "local_names": [],
    "base_unit": "100g",
    "calories": 480,
    "protein": 12,
    "carbs": 45,
    "fat": 28,
    "is_custom": false
  },
  {
    "id": 221,
    "name": "Roasted Chana",
    "local_names": [],
    "base_unit": "100g",
    "calories": 364,
    "protein": 20,
    "carbs": 60,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 222,
    "name": "Boiled Sprouts (Moong)",
    "local_names": [],
    "base_unit": "100g",
    "calories": 105,
    "protein": 7,
    "carbs": 19,
    "fat": 0.4,
    "is_custom": false
  },
  {
    "id": 223,
    "name": "Almonds",
    "local_names": [],
    "base_unit": "100g",
    "calories": 579,
    "protein": 21,
    "carbs": 22,
    "fat": 50,
    "is_custom": false
  },
  {
    "id": 224,
    "name": "Cashews",
    "local_names": [],
    "base_unit": "100g",
    "calories": 553,
    "protein": 18,
    "carbs": 30,
    "fat": 44,
    "is_custom": false
  },
  {
    "id": 225,
    "name": "Peanuts (Roasted)",
    "local_names": [],
    "base_unit": "100g",
    "calories": 585,
    "protein": 26,
    "carbs": 21,
    "fat": 49,
    "is_custom": false
  },
  {
    "id": 226,
    "name": "Litti Chokha",
    "local_names": [],
    "base_unit": "2 pieces",
    "calories": 320,
    "protein": 8,
    "carbs": 44,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 227,
    "name": "Dal Baati Churma (Baati)",
    "local_names": [],
    "base_unit": "2 pieces",
    "calories": 300,
    "protein": 6,
    "carbs": 40,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 228,
    "name": "Gatte ki Sabzi",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 240,
    "protein": 8,
    "carbs": 22,
    "fat": 14,
    "is_custom": false
  },
  {
    "id": 229,
    "name": "Ker Sangri",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 180,
    "protein": 4,
    "carbs": 18,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 230,
    "name": "Laal Maas",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 400,
    "protein": 24,
    "carbs": 8,
    "fat": 28,
    "is_custom": false
  },
  {
    "id": 231,
    "name": "Dhokar Dalna",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 8,
    "carbs": 24,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 232,
    "name": "Shukto",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 150,
    "protein": 3,
    "carbs": 16,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 233,
    "name": "Machher Jhol",
    "local_names": [
      "Fish Jhol"
    ],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 20,
    "carbs": 8,
    "fat": 16,
    "is_custom": false
  },
  {
    "id": 234,
    "name": "Aloo Posto",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 3,
    "carbs": 22,
    "fat": 13,
    "is_custom": false
  },
  {
    "id": 235,
    "name": "Chingri Malai Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 330,
    "protein": 18,
    "carbs": 10,
    "fat": 24,
    "is_custom": false
  },
  {
    "id": 236,
    "name": "Kosha Mangsho",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 400,
    "protein": 24,
    "carbs": 8,
    "fat": 28,
    "is_custom": false
  },
  {
    "id": 237,
    "name": "Dhokla (Khaman variant)",
    "local_names": [],
    "base_unit": "100g",
    "calories": 165,
    "protein": 5,
    "carbs": 24,
    "fat": 4,
    "is_custom": false
  },
  {
    "id": 238,
    "name": "Thepla",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 150,
    "protein": 3,
    "carbs": 20,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 239,
    "name": "Handvo",
    "local_names": [],
    "base_unit": "1 piece (100g)",
    "calories": 220,
    "protein": 6,
    "carbs": 26,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 240,
    "name": "Undhiyu (Gujarati Mix Veg)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 6,
    "carbs": 26,
    "fat": 14,
    "is_custom": false
  },
  {
    "id": 241,
    "name": "Khandvi",
    "local_names": [],
    "base_unit": "100g",
    "calories": 150,
    "protein": 4,
    "carbs": 16,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 242,
    "name": "Fafda",
    "local_names": [],
    "base_unit": "100g",
    "calories": 280,
    "protein": 6,
    "carbs": 30,
    "fat": 15,
    "is_custom": false
  },
  {
    "id": 243,
    "name": "Sev Tameta Nu Shaak",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 210,
    "protein": 5,
    "carbs": 20,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 244,
    "name": "Puran Poli",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 260,
    "protein": 5,
    "carbs": 42,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 245,
    "name": "Misal Pav (Misal only)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 9,
    "carbs": 28,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 246,
    "name": "Sabudana Khichdi",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 280,
    "protein": 3,
    "carbs": 42,
    "fat": 11,
    "is_custom": false
  },
  {
    "id": 247,
    "name": "Vada (Maharashtrian Batata Vada)",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 200,
    "protein": 3,
    "carbs": 24,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 248,
    "name": "Kolhapuri Chicken",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 360,
    "protein": 26,
    "carbs": 9,
    "fat": 24,
    "is_custom": false
  },
  {
    "id": 249,
    "name": "Zunka",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 180,
    "protein": 5,
    "carbs": 16,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 250,
    "name": "Bharli Vangi",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 4,
    "carbs": 20,
    "fat": 13,
    "is_custom": false
  },
  {
    "id": 251,
    "name": "Pav Bhaji (extra butter)",
    "local_names": [],
    "base_unit": "1 plate",
    "calories": 450,
    "protein": 8,
    "carbs": 50,
    "fat": 22,
    "is_custom": false
  },
  {
    "id": 252,
    "name": "Modak (Steamed)",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 130,
    "protein": 2,
    "carbs": 22,
    "fat": 4,
    "is_custom": false
  },
  {
    "id": 253,
    "name": "Thalipeeth",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 210,
    "protein": 5,
    "carbs": 26,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 254,
    "name": "Kanda Poha",
    "local_names": [
      "Poha"
    ],
    "base_unit": "1 bowl (200g)",
    "calories": 250,
    "protein": 4,
    "carbs": 40,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 255,
    "name": "Sabudana Vada",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 220,
    "protein": 3,
    "carbs": 26,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 256,
    "name": "Dahi Vada",
    "local_names": [],
    "base_unit": "2 pieces",
    "calories": 220,
    "protein": 6,
    "carbs": 26,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 257,
    "name": "Rasam",
    "local_names": [],
    "base_unit": "1 bowl (150ml)",
    "calories": 90,
    "protein": 3,
    "carbs": 12,
    "fat": 3,
    "is_custom": false
  },
  {
    "id": 258,
    "name": "Poriyal (Mixed Veg)",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 130,
    "protein": 3,
    "carbs": 14,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 259,
    "name": "Kootu",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 140,
    "protein": 5,
    "carbs": 16,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 260,
    "name": "Vatha Kuzhambu",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 150,
    "protein": 4,
    "carbs": 18,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 261,
    "name": "Kara Kuzhambu",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 160,
    "protein": 4,
    "carbs": 18,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 262,
    "name": "Paruppu Usili",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 190,
    "protein": 8,
    "carbs": 16,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 263,
    "name": "Chettinad Mutton Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 390,
    "protein": 25,
    "carbs": 8,
    "fat": 27,
    "is_custom": false
  },
  {
    "id": 264,
    "name": "Erachi Ularthiyathu (Kerala Beef Fry)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 350,
    "protein": 26,
    "carbs": 6,
    "fat": 24,
    "is_custom": false
  },
  {
    "id": 265,
    "name": "Kerala Prawn Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 300,
    "protein": 20,
    "carbs": 8,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 266,
    "name": "Malabar Parotta",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 280,
    "protein": 5,
    "carbs": 38,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 267,
    "name": "Puttu",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 180,
    "protein": 3,
    "carbs": 38,
    "fat": 1,
    "is_custom": false
  },
  {
    "id": 268,
    "name": "Kadala Curry",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 9,
    "carbs": 28,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 269,
    "name": "Thoran",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 130,
    "protein": 3,
    "carbs": 14,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 270,
    "name": "Meen Pollichathu",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 280,
    "protein": 21,
    "carbs": 6,
    "fat": 19,
    "is_custom": false
  },
  {
    "id": 271,
    "name": "Hyderabadi Haleem",
    "local_names": [],
    "base_unit": "1 bowl (250g)",
    "calories": 350,
    "protein": 18,
    "carbs": 30,
    "fat": 16,
    "is_custom": false
  },
  {
    "id": 272,
    "name": "Bagara Baingan",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 230,
    "protein": 4,
    "carbs": 18,
    "fat": 15,
    "is_custom": false
  },
  {
    "id": 273,
    "name": "Double ka Meetha",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 320,
    "protein": 5,
    "carbs": 40,
    "fat": 15,
    "is_custom": false
  },
  {
    "id": 274,
    "name": "Qubani ka Meetha",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 260,
    "protein": 3,
    "carbs": 48,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 275,
    "name": "Nihari",
    "local_names": [],
    "base_unit": "1 bowl (250g)",
    "calories": 380,
    "protein": 24,
    "carbs": 10,
    "fat": 26,
    "is_custom": false
  },
  {
    "id": 276,
    "name": "Keema Matar",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 340,
    "protein": 22,
    "carbs": 12,
    "fat": 22,
    "is_custom": false
  },
  {
    "id": 277,
    "name": "Rista (Kashmiri Meatballs)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 400,
    "protein": 22,
    "carbs": 10,
    "fat": 30,
    "is_custom": false
  },
  {
    "id": 278,
    "name": "Rogan Josh (Kashmiri)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 400,
    "protein": 25,
    "carbs": 9,
    "fat": 28,
    "is_custom": false
  },
  {
    "id": 279,
    "name": "Dum Aloo (Kashmiri)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 4,
    "carbs": 28,
    "fat": 15,
    "is_custom": false
  },
  {
    "id": 280,
    "name": "Yakhni Pulao",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 320,
    "protein": 12,
    "carbs": 46,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 281,
    "name": "Amritsari Kulcha (Aloo Kulcha)",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 260,
    "protein": 6,
    "carbs": 38,
    "fat": 9,
    "is_custom": false
  },
  {
    "id": 282,
    "name": "Sarson da Saag with Makki Roti (Saag)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 180,
    "protein": 5,
    "carbs": 12,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 283,
    "name": "Chole Kulche (Chole)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 10,
    "carbs": 34,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 284,
    "name": "Amritsari Fish Fry",
    "local_names": [],
    "base_unit": "1 plate (150g)",
    "calories": 300,
    "protein": 20,
    "carbs": 14,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 285,
    "name": "Tandoori Prawns",
    "local_names": [],
    "base_unit": "1 plate (150g)",
    "calories": 220,
    "protein": 22,
    "carbs": 3,
    "fat": 13,
    "is_custom": false
  },
  {
    "id": 286,
    "name": "Reshmi Kebab",
    "local_names": [],
    "base_unit": "4 pieces",
    "calories": 260,
    "protein": 22,
    "carbs": 4,
    "fat": 17,
    "is_custom": false
  },
  {
    "id": 287,
    "name": "Seekh Kebab (Chicken)",
    "local_names": [],
    "base_unit": "4 pieces",
    "calories": 280,
    "protein": 22,
    "carbs": 4,
    "fat": 19,
    "is_custom": false
  },
  {
    "id": 288,
    "name": "Seekh Kebab (Mutton)",
    "local_names": [],
    "base_unit": "4 pieces",
    "calories": 320,
    "protein": 22,
    "carbs": 4,
    "fat": 24,
    "is_custom": false
  },
  {
    "id": 289,
    "name": "Galouti Kebab",
    "local_names": [],
    "base_unit": "4 pieces",
    "calories": 300,
    "protein": 18,
    "carbs": 6,
    "fat": 22,
    "is_custom": false
  },
  {
    "id": 290,
    "name": "Shami Kebab",
    "local_names": [],
    "base_unit": "4 pieces",
    "calories": 260,
    "protein": 16,
    "carbs": 10,
    "fat": 17,
    "is_custom": false
  },
  {
    "id": 291,
    "name": "Hara Bhara Kebab",
    "local_names": [],
    "base_unit": "4 pieces",
    "calories": 200,
    "protein": 6,
    "carbs": 20,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 292,
    "name": "Dahi Kebab",
    "local_names": [],
    "base_unit": "4 pieces",
    "calories": 220,
    "protein": 8,
    "carbs": 18,
    "fat": 13,
    "is_custom": false
  },
  {
    "id": 293,
    "name": "Malai Kofta",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 380,
    "protein": 8,
    "carbs": 26,
    "fat": 27,
    "is_custom": false
  },
  {
    "id": 294,
    "name": "Navratan Korma",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 320,
    "protein": 7,
    "carbs": 26,
    "fat": 20,
    "is_custom": false
  },
  {
    "id": 295,
    "name": "Vegetable Jalfrezi",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 220,
    "protein": 5,
    "carbs": 22,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 296,
    "name": "Baby Corn Manchurian",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 280,
    "protein": 5,
    "carbs": 30,
    "fat": 14,
    "is_custom": false
  },
  {
    "id": 297,
    "name": "Veg Manchurian (Gravy)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 260,
    "protein": 5,
    "carbs": 30,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 298,
    "name": "Paneer Manchurian",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 320,
    "protein": 13,
    "carbs": 24,
    "fat": 18,
    "is_custom": false
  },
  {
    "id": 299,
    "name": "Hakka Noodles (Veg)",
    "local_names": [],
    "base_unit": "1 plate (250g)",
    "calories": 340,
    "protein": 7,
    "carbs": 52,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 300,
    "name": "Hakka Noodles (Chicken)",
    "local_names": [],
    "base_unit": "1 plate (250g)",
    "calories": 400,
    "protein": 18,
    "carbs": 50,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 301,
    "name": "Chilli Chicken (Dry)",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 340,
    "protein": 24,
    "carbs": 16,
    "fat": 19,
    "is_custom": false
  },
  {
    "id": 302,
    "name": "Chinese Bhel",
    "local_names": [],
    "base_unit": "1 plate (150g)",
    "calories": 300,
    "protein": 6,
    "carbs": 40,
    "fat": 12,
    "is_custom": false
  },
  {
    "id": 303,
    "name": "American Chopsuey",
    "local_names": [],
    "base_unit": "1 plate (250g)",
    "calories": 380,
    "protein": 8,
    "carbs": 48,
    "fat": 15,
    "is_custom": false
  },
  {
    "id": 304,
    "name": "Schezwan Fried Rice",
    "local_names": [],
    "base_unit": "1 bowl (200g)",
    "calories": 340,
    "protein": 6,
    "carbs": 52,
    "fat": 10,
    "is_custom": false
  },
  {
    "id": 305,
    "name": "Manchow Soup",
    "local_names": [],
    "base_unit": "1 bowl (200ml)",
    "calories": 150,
    "protein": 4,
    "carbs": 18,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 306,
    "name": "Hot and Sour Soup",
    "local_names": [],
    "base_unit": "1 bowl (200ml)",
    "calories": 130,
    "protein": 4,
    "carbs": 16,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 307,
    "name": "Sweet Corn Soup",
    "local_names": [],
    "base_unit": "1 bowl (200ml)",
    "calories": 140,
    "protein": 3,
    "carbs": 22,
    "fat": 4,
    "is_custom": false
  },
  {
    "id": 308,
    "name": "Tomato Soup",
    "local_names": [],
    "base_unit": "1 bowl (200ml)",
    "calories": 100,
    "protein": 2,
    "carbs": 16,
    "fat": 3,
    "is_custom": false
  },
  {
    "id": 309,
    "name": "Multigrain Roti",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 90,
    "protein": 3,
    "carbs": 16,
    "fat": 1.5,
    "is_custom": false
  },
  {
    "id": 310,
    "name": "Ragi Roti",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 100,
    "protein": 3,
    "carbs": 18,
    "fat": 2,
    "is_custom": false
  },
  {
    "id": 311,
    "name": "Methi Thepla",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 155,
    "protein": 3,
    "carbs": 21,
    "fat": 6,
    "is_custom": false
  },
  {
    "id": 312,
    "name": "Coconut Chutney",
    "local_names": [],
    "base_unit": "2 tbsp (30g)",
    "calories": 90,
    "protein": 2,
    "carbs": 4,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 313,
    "name": "Tomato Chutney",
    "local_names": [],
    "base_unit": "2 tbsp (30g)",
    "calories": 60,
    "protein": 1,
    "carbs": 8,
    "fat": 3,
    "is_custom": false
  },
  {
    "id": 314,
    "name": "Peanut Chutney",
    "local_names": [],
    "base_unit": "2 tbsp (30g)",
    "calories": 100,
    "protein": 3,
    "carbs": 5,
    "fat": 8,
    "is_custom": false
  },
  {
    "id": 315,
    "name": "Mint Chutney",
    "local_names": [],
    "base_unit": "2 tbsp (30g)",
    "calories": 25,
    "protein": 1,
    "carbs": 3,
    "fat": 1,
    "is_custom": false
  },
  {
    "id": 316,
    "name": "Tamarind Chutney",
    "local_names": [],
    "base_unit": "2 tbsp (30g)",
    "calories": 60,
    "protein": 0.3,
    "carbs": 15,
    "fat": 0.1,
    "is_custom": false
  },
  {
    "id": 317,
    "name": "Papad (Roasted)",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 60,
    "protein": 3,
    "carbs": 9,
    "fat": 1,
    "is_custom": false
  },
  {
    "id": 318,
    "name": "Papad (Fried)",
    "local_names": [],
    "base_unit": "1 piece",
    "calories": 90,
    "protein": 3,
    "carbs": 9,
    "fat": 5,
    "is_custom": false
  },
  {
    "id": 319,
    "name": "Pickle (Mango, Oil)",
    "local_names": [],
    "base_unit": "1 tbsp (15g)",
    "calories": 45,
    "protein": 0.3,
    "carbs": 3,
    "fat": 4,
    "is_custom": false
  },
  {
    "id": 320,
    "name": "Boondi Raita",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 130,
    "protein": 4,
    "carbs": 12,
    "fat": 7,
    "is_custom": false
  },
  {
    "id": 321,
    "name": "Cucumber Raita",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 70,
    "protein": 3,
    "carbs": 6,
    "fat": 3,
    "is_custom": false
  },
  {
    "id": 322,
    "name": "Pineapple Raita",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 110,
    "protein": 3,
    "carbs": 16,
    "fat": 3,
    "is_custom": false
  },
  {
    "id": 323,
    "name": "Green Salad",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 40,
    "protein": 2,
    "carbs": 7,
    "fat": 0.3,
    "is_custom": false
  },
  {
    "id": 324,
    "name": "Kachumber Salad",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 60,
    "protein": 2,
    "carbs": 10,
    "fat": 1,
    "is_custom": false
  },
  {
    "id": 325,
    "name": "Sprouts Salad",
    "local_names": [],
    "base_unit": "1 bowl (150g)",
    "calories": 130,
    "protein": 8,
    "carbs": 18,
    "fat": 2,
    "is_custom": false
  }
];

// =========================================================================
// 3. WORKOUT LIBRARY SEED DATA (bodyweight + weighted gym exercises)
// =========================================================================
// met_value = MET (Metabolic Equivalent of Task), used with user bodyweight
// and duration to estimate calories burned:
//   calories_burned = met_value * weight_kg * (duration_minutes / 60)
//
// bodyweight_ratio = approximate fraction of bodyweight displaced/loaded for
// BODYWEIGHT exercises only (e.g. a pushup moves ~64% of bodyweight through
// the arms/chest). It is `null` for weighted/gym/cardio-machine exercises,
// since those are driven by external load or machine resistance rather than
// bodyweight displacement -- calorie estimate for those should rely on
// met_value alone (optionally scaled by the external weight used, tracked
// separately in entry_items).

const WORKOUT_LIBRARY_SEED = [
  {
    "id": 1,
    "name": "Pushup (Standard)",
    "category": "bodyweight_upper",
    "met_value": 8.0,
    "bodyweight_ratio": 0.64,
    "is_custom": false
  },
  {
    "id": 2,
    "name": "Incline Pushup",
    "category": "bodyweight_upper",
    "met_value": 6.0,
    "bodyweight_ratio": 0.5,
    "is_custom": false
  },
  {
    "id": 3,
    "name": "Decline Pushup",
    "category": "bodyweight_upper",
    "met_value": 9.0,
    "bodyweight_ratio": 0.74,
    "is_custom": false
  },
  {
    "id": 4,
    "name": "Diamond Pushup",
    "category": "bodyweight_upper",
    "met_value": 8.5,
    "bodyweight_ratio": 0.68,
    "is_custom": false
  },
  {
    "id": 5,
    "name": "Wide Grip Pushup",
    "category": "bodyweight_upper",
    "met_value": 8.0,
    "bodyweight_ratio": 0.64,
    "is_custom": false
  },
  {
    "id": 6,
    "name": "Knee Pushup",
    "category": "bodyweight_upper",
    "met_value": 5.0,
    "bodyweight_ratio": 0.49,
    "is_custom": false
  },
  {
    "id": 7,
    "name": "Archer Pushup",
    "category": "bodyweight_upper",
    "met_value": 9.5,
    "bodyweight_ratio": 0.75,
    "is_custom": false
  },
  {
    "id": 8,
    "name": "One-Arm Pushup",
    "category": "bodyweight_upper",
    "met_value": 10.0,
    "bodyweight_ratio": 0.85,
    "is_custom": false
  },
  {
    "id": 9,
    "name": "Pike Pushup",
    "category": "bodyweight_upper",
    "met_value": 8.0,
    "bodyweight_ratio": 0.66,
    "is_custom": false
  },
  {
    "id": 10,
    "name": "Hindu Pushup",
    "category": "bodyweight_upper",
    "met_value": 8.5,
    "bodyweight_ratio": 0.66,
    "is_custom": false
  },
  {
    "id": 11,
    "name": "Clap Pushup",
    "category": "bodyweight_upper",
    "met_value": 10.0,
    "bodyweight_ratio": 0.7,
    "is_custom": false
  },
  {
    "id": 12,
    "name": "Spiderman Pushup",
    "category": "bodyweight_upper",
    "met_value": 9.0,
    "bodyweight_ratio": 0.66,
    "is_custom": false
  },
  {
    "id": 13,
    "name": "Pull Up",
    "category": "bodyweight_upper",
    "met_value": 8.0,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 14,
    "name": "Chin Up",
    "category": "bodyweight_upper",
    "met_value": 8.0,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 15,
    "name": "Wide Grip Pull Up",
    "category": "bodyweight_upper",
    "met_value": 8.5,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 16,
    "name": "Commando Pull Up",
    "category": "bodyweight_upper",
    "met_value": 8.5,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 17,
    "name": "Negative Pull Up",
    "category": "bodyweight_upper",
    "met_value": 6.0,
    "bodyweight_ratio": 0.9,
    "is_custom": false
  },
  {
    "id": 18,
    "name": "Australian Row (Inverted Row)",
    "category": "bodyweight_upper",
    "met_value": 6.0,
    "bodyweight_ratio": 0.55,
    "is_custom": false
  },
  {
    "id": 19,
    "name": "Dip (Parallel Bars)",
    "category": "bodyweight_upper",
    "met_value": 8.0,
    "bodyweight_ratio": 0.9,
    "is_custom": false
  },
  {
    "id": 20,
    "name": "Bench Dip",
    "category": "bodyweight_upper",
    "met_value": 5.0,
    "bodyweight_ratio": 0.6,
    "is_custom": false
  },
  {
    "id": 21,
    "name": "Plank",
    "category": "bodyweight_core",
    "met_value": 3.5,
    "bodyweight_ratio": 0.3,
    "is_custom": false
  },
  {
    "id": 22,
    "name": "Side Plank",
    "category": "bodyweight_core",
    "met_value": 3.5,
    "bodyweight_ratio": 0.25,
    "is_custom": false
  },
  {
    "id": 23,
    "name": "Plank Shoulder Tap",
    "category": "bodyweight_core",
    "met_value": 4.0,
    "bodyweight_ratio": 0.3,
    "is_custom": false
  },
  {
    "id": 24,
    "name": "Reverse Plank",
    "category": "bodyweight_core",
    "met_value": 3.5,
    "bodyweight_ratio": 0.35,
    "is_custom": false
  },
  {
    "id": 25,
    "name": "Crunch",
    "category": "bodyweight_core",
    "met_value": 3.8,
    "bodyweight_ratio": 0.2,
    "is_custom": false
  },
  {
    "id": 26,
    "name": "Bicycle Crunch",
    "category": "bodyweight_core",
    "met_value": 5.0,
    "bodyweight_ratio": 0.22,
    "is_custom": false
  },
  {
    "id": 27,
    "name": "Sit Up",
    "category": "bodyweight_core",
    "met_value": 4.5,
    "bodyweight_ratio": 0.28,
    "is_custom": false
  },
  {
    "id": 28,
    "name": "V-Up",
    "category": "bodyweight_core",
    "met_value": 5.0,
    "bodyweight_ratio": 0.35,
    "is_custom": false
  },
  {
    "id": 29,
    "name": "Leg Raise (Lying)",
    "category": "bodyweight_core",
    "met_value": 4.0,
    "bodyweight_ratio": 0.3,
    "is_custom": false
  },
  {
    "id": 30,
    "name": "Hanging Leg Raise",
    "category": "bodyweight_core",
    "met_value": 6.5,
    "bodyweight_ratio": 0.35,
    "is_custom": false
  },
  {
    "id": 31,
    "name": "Hanging Knee Raise",
    "category": "bodyweight_core",
    "met_value": 5.5,
    "bodyweight_ratio": 0.3,
    "is_custom": false
  },
  {
    "id": 32,
    "name": "Russian Twist",
    "category": "bodyweight_core",
    "met_value": 4.5,
    "bodyweight_ratio": 0.25,
    "is_custom": false
  },
  {
    "id": 33,
    "name": "Flutter Kicks",
    "category": "bodyweight_core",
    "met_value": 4.0,
    "bodyweight_ratio": 0.22,
    "is_custom": false
  },
  {
    "id": 34,
    "name": "Mountain Climber",
    "category": "bodyweight_core",
    "met_value": 8.0,
    "bodyweight_ratio": 0.4,
    "is_custom": false
  },
  {
    "id": 35,
    "name": "Dead Bug",
    "category": "bodyweight_core",
    "met_value": 3.0,
    "bodyweight_ratio": 0.2,
    "is_custom": false
  },
  {
    "id": 36,
    "name": "Superman Hold",
    "category": "bodyweight_core",
    "met_value": 3.0,
    "bodyweight_ratio": 0.2,
    "is_custom": false
  },
  {
    "id": 37,
    "name": "Ab Wheel Rollout",
    "category": "bodyweight_core",
    "met_value": 5.0,
    "bodyweight_ratio": 0.45,
    "is_custom": false
  },
  {
    "id": 38,
    "name": "Hollow Body Hold",
    "category": "bodyweight_core",
    "met_value": 4.0,
    "bodyweight_ratio": 0.3,
    "is_custom": false
  },
  {
    "id": 39,
    "name": "Squat (Bodyweight)",
    "category": "bodyweight_lower",
    "met_value": 5.0,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 40,
    "name": "Jump Squat",
    "category": "bodyweight_lower",
    "met_value": 8.0,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 41,
    "name": "Bulgarian Split Squat (Bodyweight)",
    "category": "bodyweight_lower",
    "met_value": 6.0,
    "bodyweight_ratio": 0.85,
    "is_custom": false
  },
  {
    "id": 42,
    "name": "Pistol Squat",
    "category": "bodyweight_lower",
    "met_value": 8.0,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 43,
    "name": "Sumo Squat",
    "category": "bodyweight_lower",
    "met_value": 5.5,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 44,
    "name": "Wall Sit",
    "category": "bodyweight_lower",
    "met_value": 3.5,
    "bodyweight_ratio": 0.9,
    "is_custom": false
  },
  {
    "id": 45,
    "name": "Lunge (Bodyweight)",
    "category": "bodyweight_lower",
    "met_value": 4.0,
    "bodyweight_ratio": 0.75,
    "is_custom": false
  },
  {
    "id": 46,
    "name": "Walking Lunge",
    "category": "bodyweight_lower",
    "met_value": 5.0,
    "bodyweight_ratio": 0.75,
    "is_custom": false
  },
  {
    "id": 47,
    "name": "Reverse Lunge",
    "category": "bodyweight_lower",
    "met_value": 4.0,
    "bodyweight_ratio": 0.75,
    "is_custom": false
  },
  {
    "id": 48,
    "name": "Lateral Lunge",
    "category": "bodyweight_lower",
    "met_value": 4.5,
    "bodyweight_ratio": 0.75,
    "is_custom": false
  },
  {
    "id": 49,
    "name": "Curtsy Lunge",
    "category": "bodyweight_lower",
    "met_value": 4.5,
    "bodyweight_ratio": 0.75,
    "is_custom": false
  },
  {
    "id": 50,
    "name": "Jump Lunge",
    "category": "bodyweight_lower",
    "met_value": 8.5,
    "bodyweight_ratio": 0.8,
    "is_custom": false
  },
  {
    "id": 51,
    "name": "Step Up",
    "category": "bodyweight_lower",
    "met_value": 5.0,
    "bodyweight_ratio": 0.9,
    "is_custom": false
  },
  {
    "id": 52,
    "name": "Glute Bridge",
    "category": "bodyweight_lower",
    "met_value": 3.0,
    "bodyweight_ratio": 0.55,
    "is_custom": false
  },
  {
    "id": 53,
    "name": "Single Leg Glute Bridge",
    "category": "bodyweight_lower",
    "met_value": 3.5,
    "bodyweight_ratio": 0.7,
    "is_custom": false
  },
  {
    "id": 54,
    "name": "Hip Thrust (Bodyweight)",
    "category": "bodyweight_lower",
    "met_value": 3.5,
    "bodyweight_ratio": 0.6,
    "is_custom": false
  },
  {
    "id": 55,
    "name": "Calf Raise (Bodyweight)",
    "category": "bodyweight_lower",
    "met_value": 3.0,
    "bodyweight_ratio": 0.9,
    "is_custom": false
  },
  {
    "id": 56,
    "name": "Single Leg Calf Raise",
    "category": "bodyweight_lower",
    "met_value": 3.5,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 57,
    "name": "Donkey Kick",
    "category": "bodyweight_lower",
    "met_value": 3.0,
    "bodyweight_ratio": 0.35,
    "is_custom": false
  },
  {
    "id": 58,
    "name": "Fire Hydrant",
    "category": "bodyweight_lower",
    "met_value": 3.0,
    "bodyweight_ratio": 0.3,
    "is_custom": false
  },
  {
    "id": 59,
    "name": "Nordic Curl",
    "category": "bodyweight_lower",
    "met_value": 6.0,
    "bodyweight_ratio": 0.65,
    "is_custom": false
  },
  {
    "id": 60,
    "name": "Broad Jump",
    "category": "bodyweight_lower",
    "met_value": 8.0,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 61,
    "name": "Box Jump",
    "category": "bodyweight_lower",
    "met_value": 8.5,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 62,
    "name": "Skater Jump",
    "category": "bodyweight_lower",
    "met_value": 7.5,
    "bodyweight_ratio": 0.85,
    "is_custom": false
  },
  {
    "id": 63,
    "name": "Jumping Jack",
    "category": "bodyweight_cardio",
    "met_value": 8.0,
    "bodyweight_ratio": 0.6,
    "is_custom": false
  },
  {
    "id": 64,
    "name": "Burpee",
    "category": "bodyweight_cardio",
    "met_value": 10.0,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 65,
    "name": "Half Burpee",
    "category": "bodyweight_cardio",
    "met_value": 8.0,
    "bodyweight_ratio": 0.85,
    "is_custom": false
  },
  {
    "id": 66,
    "name": "Burpee Pull Up",
    "category": "bodyweight_cardio",
    "met_value": 11.0,
    "bodyweight_ratio": 1.0,
    "is_custom": false
  },
  {
    "id": 67,
    "name": "High Knees",
    "category": "bodyweight_cardio",
    "met_value": 8.0,
    "bodyweight_ratio": 0.5,
    "is_custom": false
  },
  {
    "id": 68,
    "name": "Butt Kicks",
    "category": "bodyweight_cardio",
    "met_value": 7.0,
    "bodyweight_ratio": 0.45,
    "is_custom": false
  },
  {
    "id": 69,
    "name": "Bear Crawl",
    "category": "bodyweight_cardio",
    "met_value": 7.0,
    "bodyweight_ratio": 0.6,
    "is_custom": false
  },
  {
    "id": 70,
    "name": "Crab Walk",
    "category": "bodyweight_cardio",
    "met_value": 5.0,
    "bodyweight_ratio": 0.55,
    "is_custom": false
  },
  {
    "id": 71,
    "name": "Inchworm",
    "category": "bodyweight_cardio",
    "met_value": 5.5,
    "bodyweight_ratio": 0.55,
    "is_custom": false
  },
  {
    "id": 72,
    "name": "Star Jump",
    "category": "bodyweight_cardio",
    "met_value": 8.0,
    "bodyweight_ratio": 0.65,
    "is_custom": false
  },
  {
    "id": 73,
    "name": "Shadow Boxing",
    "category": "bodyweight_cardio",
    "met_value": 6.5,
    "bodyweight_ratio": 0.3,
    "is_custom": false
  },
  {
    "id": 74,
    "name": "Jump Rope",
    "category": "bodyweight_cardio",
    "met_value": 11.0,
    "bodyweight_ratio": 0.35,
    "is_custom": false
  },
  {
    "id": 75,
    "name": "Sprint (Bodyweight)",
    "category": "bodyweight_cardio",
    "met_value": 12.0,
    "bodyweight_ratio": 0.2,
    "is_custom": false
  },
  {
    "id": 76,
    "name": "Yoga - Sun Salutation",
    "category": "flexibility",
    "met_value": 3.0,
    "bodyweight_ratio": 0.4,
    "is_custom": false
  },
  {
    "id": 77,
    "name": "Yoga - Vinyasa Flow",
    "category": "flexibility",
    "met_value": 4.0,
    "bodyweight_ratio": 0.4,
    "is_custom": false
  },
  {
    "id": 78,
    "name": "Yoga - Hatha",
    "category": "flexibility",
    "met_value": 2.5,
    "bodyweight_ratio": 0.3,
    "is_custom": false
  },
  {
    "id": 79,
    "name": "Stretching (General)",
    "category": "flexibility",
    "met_value": 2.3,
    "bodyweight_ratio": 0.1,
    "is_custom": false
  },
  {
    "id": 80,
    "name": "Pilates (Mat)",
    "category": "flexibility",
    "met_value": 3.0,
    "bodyweight_ratio": 0.35,
    "is_custom": false
  },
  {
    "id": 81,
    "name": "Barbell Bench Press",
    "category": "chest",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 82,
    "name": "Incline Barbell Bench Press",
    "category": "chest",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 83,
    "name": "Decline Barbell Bench Press",
    "category": "chest",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 84,
    "name": "Dumbbell Bench Press",
    "category": "chest",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 85,
    "name": "Incline Dumbbell Press",
    "category": "chest",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 86,
    "name": "Decline Dumbbell Press",
    "category": "chest",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 87,
    "name": "Dumbbell Fly",
    "category": "chest",
    "met_value": 4.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 88,
    "name": "Cable Fly",
    "category": "chest",
    "met_value": 4.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 89,
    "name": "Pec Deck Machine",
    "category": "chest",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 90,
    "name": "Chest Press Machine",
    "category": "chest",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 91,
    "name": "Smith Machine Bench Press",
    "category": "chest",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 92,
    "name": "Landmine Press",
    "category": "chest",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 93,
    "name": "Barbell Squat (Back Squat)",
    "category": "legs",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 94,
    "name": "Front Squat",
    "category": "legs",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 95,
    "name": "Goblet Squat",
    "category": "legs",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 96,
    "name": "Bulgarian Split Squat (Weighted)",
    "category": "legs",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 97,
    "name": "Leg Press",
    "category": "legs",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 98,
    "name": "Hack Squat",
    "category": "legs",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 99,
    "name": "Deadlift (Conventional)",
    "category": "legs",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 100,
    "name": "Romanian Deadlift",
    "category": "legs",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 101,
    "name": "Sumo Deadlift",
    "category": "legs",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 102,
    "name": "Stiff Leg Deadlift",
    "category": "legs",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 103,
    "name": "Trap Bar Deadlift",
    "category": "legs",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 104,
    "name": "Leg Extension",
    "category": "legs",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 105,
    "name": "Leg Curl (Lying)",
    "category": "legs",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 106,
    "name": "Seated Leg Curl",
    "category": "legs",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 107,
    "name": "Walking Lunge (Weighted)",
    "category": "legs",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 108,
    "name": "Reverse Lunge (Weighted)",
    "category": "legs",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 109,
    "name": "Step Up (Weighted)",
    "category": "legs",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 110,
    "name": "Calf Raise (Machine)",
    "category": "legs",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 111,
    "name": "Seated Calf Raise",
    "category": "legs",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 112,
    "name": "Hip Thrust (Barbell)",
    "category": "legs",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 113,
    "name": "Cable Kickback",
    "category": "legs",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 114,
    "name": "Hack Press",
    "category": "legs",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 115,
    "name": "Belt Squat",
    "category": "legs",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 116,
    "name": "Barbell Deadlift Row (Pendlay Row)",
    "category": "back",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 117,
    "name": "Bent Over Barbell Row",
    "category": "back",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 118,
    "name": "Dumbbell Row (Single Arm)",
    "category": "back",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 119,
    "name": "T-Bar Row",
    "category": "back",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 120,
    "name": "Seated Cable Row",
    "category": "back",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 121,
    "name": "Lat Pulldown",
    "category": "back",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 122,
    "name": "Close Grip Lat Pulldown",
    "category": "back",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 123,
    "name": "Straight Arm Pulldown",
    "category": "back",
    "met_value": 4.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 124,
    "name": "Assisted Pull Up Machine",
    "category": "back",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 125,
    "name": "Weighted Pull Up",
    "category": "back",
    "met_value": 8.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 126,
    "name": "Weighted Chin Up",
    "category": "back",
    "met_value": 8.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 127,
    "name": "Deadlift High Pull",
    "category": "back",
    "met_value": 6.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 128,
    "name": "Face Pull",
    "category": "back",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 129,
    "name": "Shrug (Barbell)",
    "category": "back",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 130,
    "name": "Shrug (Dumbbell)",
    "category": "back",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 131,
    "name": "Hyperextension (Back Extension)",
    "category": "back",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 132,
    "name": "Good Morning",
    "category": "back",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 133,
    "name": "Overhead Press (Barbell)",
    "category": "shoulders",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 134,
    "name": "Seated Dumbbell Shoulder Press",
    "category": "shoulders",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 135,
    "name": "Arnold Press",
    "category": "shoulders",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 136,
    "name": "Lateral Raise (Dumbbell)",
    "category": "shoulders",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 137,
    "name": "Front Raise (Dumbbell)",
    "category": "shoulders",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 138,
    "name": "Rear Delt Fly",
    "category": "shoulders",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 139,
    "name": "Cable Lateral Raise",
    "category": "shoulders",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 140,
    "name": "Upright Row",
    "category": "shoulders",
    "met_value": 4.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 141,
    "name": "Machine Shoulder Press",
    "category": "shoulders",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 142,
    "name": "Push Press",
    "category": "shoulders",
    "met_value": 6.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 143,
    "name": "Barbell Curl",
    "category": "arms",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 144,
    "name": "Dumbbell Curl",
    "category": "arms",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 145,
    "name": "Hammer Curl",
    "category": "arms",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 146,
    "name": "Preacher Curl",
    "category": "arms",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 147,
    "name": "Concentration Curl",
    "category": "arms",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 148,
    "name": "Cable Curl",
    "category": "arms",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 149,
    "name": "EZ Bar Curl",
    "category": "arms",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 150,
    "name": "21s Bicep Curl",
    "category": "arms",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 151,
    "name": "Triceps Pushdown (Cable)",
    "category": "arms",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 152,
    "name": "Overhead Triceps Extension",
    "category": "arms",
    "met_value": 3.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 153,
    "name": "Skull Crusher (Lying Triceps Extension)",
    "category": "arms",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 154,
    "name": "Close Grip Bench Press",
    "category": "arms",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 155,
    "name": "Triceps Kickback",
    "category": "arms",
    "met_value": 3.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 156,
    "name": "Dip Machine",
    "category": "arms",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 157,
    "name": "Cable Crunch",
    "category": "core",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 158,
    "name": "Weighted Sit Up",
    "category": "core",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 159,
    "name": "Weighted Russian Twist",
    "category": "core",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 160,
    "name": "Landmine Rotation",
    "category": "core",
    "met_value": 4.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 161,
    "name": "Hanging Weighted Leg Raise",
    "category": "core",
    "met_value": 6.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 162,
    "name": "Woodchopper (Cable)",
    "category": "core",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 163,
    "name": "Farmer's Carry",
    "category": "full_body",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 164,
    "name": "Sled Push",
    "category": "full_body",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 165,
    "name": "Sled Pull",
    "category": "full_body",
    "met_value": 7.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 166,
    "name": "Kettlebell Swing",
    "category": "full_body",
    "met_value": 9.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 167,
    "name": "Kettlebell Snatch",
    "category": "full_body",
    "met_value": 9.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 168,
    "name": "Kettlebell Clean",
    "category": "full_body",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 169,
    "name": "Kettlebell Goblet Squat",
    "category": "full_body",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 170,
    "name": "Barbell Clean and Jerk",
    "category": "full_body",
    "met_value": 8.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 171,
    "name": "Barbell Clean and Press",
    "category": "full_body",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 172,
    "name": "Barbell Snatch",
    "category": "full_body",
    "met_value": 8.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 173,
    "name": "Thruster (Barbell)",
    "category": "full_body",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 174,
    "name": "Man Maker",
    "category": "full_body",
    "met_value": 9.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 175,
    "name": "Battle Ropes",
    "category": "full_body",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 176,
    "name": "Tire Flip",
    "category": "full_body",
    "met_value": 8.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 177,
    "name": "Medicine Ball Slam",
    "category": "full_body",
    "met_value": 7.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 178,
    "name": "Treadmill Walking (Slow, 3km/h)",
    "category": "cardio_machine",
    "met_value": 2.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 179,
    "name": "Treadmill Walking (Brisk, 5.5km/h)",
    "category": "cardio_machine",
    "met_value": 3.8,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 180,
    "name": "Treadmill Jogging (8km/h)",
    "category": "cardio_machine",
    "met_value": 8.3,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 181,
    "name": "Treadmill Running (10km/h)",
    "category": "cardio_machine",
    "met_value": 9.8,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 182,
    "name": "Treadmill Running (12km/h)",
    "category": "cardio_machine",
    "met_value": 11.8,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 183,
    "name": "Treadmill Incline Walk",
    "category": "cardio_machine",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 184,
    "name": "Stationary Cycling (Moderate)",
    "category": "cardio_machine",
    "met_value": 7.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 185,
    "name": "Stationary Cycling (Vigorous)",
    "category": "cardio_machine",
    "met_value": 10.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 186,
    "name": "Spin Class",
    "category": "cardio_machine",
    "met_value": 8.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 187,
    "name": "Elliptical Trainer",
    "category": "cardio_machine",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 188,
    "name": "Rowing Machine (Moderate)",
    "category": "cardio_machine",
    "met_value": 7.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 189,
    "name": "Rowing Machine (Vigorous)",
    "category": "cardio_machine",
    "met_value": 8.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 190,
    "name": "Stair Climber Machine",
    "category": "cardio_machine",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 191,
    "name": "Assault Bike",
    "category": "cardio_machine",
    "met_value": 9.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 192,
    "name": "Ski Erg",
    "category": "cardio_machine",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 193,
    "name": "Outdoor Cycling (Leisure)",
    "category": "cardio_outdoor",
    "met_value": 5.8,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 194,
    "name": "Outdoor Cycling (Moderate)",
    "category": "cardio_outdoor",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 195,
    "name": "Outdoor Cycling (Vigorous)",
    "category": "cardio_outdoor",
    "met_value": 10.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 196,
    "name": "Walking (Leisure)",
    "category": "cardio_outdoor",
    "met_value": 3.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 197,
    "name": "Brisk Walking",
    "category": "cardio_outdoor",
    "met_value": 4.3,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 198,
    "name": "Jogging (Outdoor)",
    "category": "cardio_outdoor",
    "met_value": 7.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 199,
    "name": "Running (8km/h)",
    "category": "cardio_outdoor",
    "met_value": 8.3,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 200,
    "name": "Running (10km/h)",
    "category": "cardio_outdoor",
    "met_value": 9.8,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 201,
    "name": "Running (12km/h)",
    "category": "cardio_outdoor",
    "met_value": 11.8,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 202,
    "name": "Running (14km/h)",
    "category": "cardio_outdoor",
    "met_value": 14.8,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 203,
    "name": "Trail Running",
    "category": "cardio_outdoor",
    "met_value": 9.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 204,
    "name": "Hiking",
    "category": "cardio_outdoor",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 205,
    "name": "Stair Climbing (Outdoor/Building)",
    "category": "cardio_outdoor",
    "met_value": 8.8,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 206,
    "name": "Swimming (Freestyle, Moderate)",
    "category": "cardio_water",
    "met_value": 8.3,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 207,
    "name": "Swimming (Freestyle, Vigorous)",
    "category": "cardio_water",
    "met_value": 10.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 208,
    "name": "Swimming (Breaststroke)",
    "category": "cardio_water",
    "met_value": 10.3,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 209,
    "name": "Swimming (Backstroke)",
    "category": "cardio_water",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 210,
    "name": "Water Aerobics",
    "category": "cardio_water",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 211,
    "name": "Basketball (Casual)",
    "category": "sport",
    "met_value": 6.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 212,
    "name": "Basketball (Competitive)",
    "category": "sport",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 213,
    "name": "Football / Soccer (Casual)",
    "category": "sport",
    "met_value": 7.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 214,
    "name": "Football / Soccer (Competitive)",
    "category": "sport",
    "met_value": 10.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 215,
    "name": "Cricket (Batting/Bowling)",
    "category": "sport",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 216,
    "name": "Cricket (Fielding)",
    "category": "sport",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 217,
    "name": "Badminton (Casual)",
    "category": "sport",
    "met_value": 5.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 218,
    "name": "Badminton (Competitive)",
    "category": "sport",
    "met_value": 7.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 219,
    "name": "Table Tennis",
    "category": "sport",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 220,
    "name": "Tennis (Singles)",
    "category": "sport",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 221,
    "name": "Tennis (Doubles)",
    "category": "sport",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 222,
    "name": "Squash",
    "category": "sport",
    "met_value": 12.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 223,
    "name": "Volleyball (Casual)",
    "category": "sport",
    "met_value": 4.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 224,
    "name": "Volleyball (Competitive)",
    "category": "sport",
    "met_value": 6.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 225,
    "name": "Kabaddi",
    "category": "sport",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 226,
    "name": "Boxing (Sparring)",
    "category": "sport",
    "met_value": 9.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 227,
    "name": "Boxing (Bag Work)",
    "category": "sport",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 228,
    "name": "Kickboxing",
    "category": "sport",
    "met_value": 9.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 229,
    "name": "Martial Arts (General)",
    "category": "sport",
    "met_value": 10.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 230,
    "name": "Judo / Wrestling",
    "category": "sport",
    "met_value": 10.3,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 231,
    "name": "Dancing (Freestyle)",
    "category": "sport",
    "met_value": 5.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 232,
    "name": "Zumba",
    "category": "sport",
    "met_value": 6.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 233,
    "name": "Skipping Rope (Fast)",
    "category": "sport",
    "met_value": 12.3,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 234,
    "name": "Cycling to Work (Commute)",
    "category": "cardio_outdoor",
    "met_value": 6.8,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 235,
    "name": "Golf (Walking, Carrying Clubs)",
    "category": "sport",
    "met_value": 4.8,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 236,
    "name": "Rock Climbing",
    "category": "sport",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 237,
    "name": "Skating (Inline)",
    "category": "sport",
    "met_value": 7.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 238,
    "name": "CrossFit / HIIT Circuit",
    "category": "hiit",
    "met_value": 9.5,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 239,
    "name": "Tabata Training",
    "category": "hiit",
    "met_value": 10.0,
    "bodyweight_ratio": null,
    "is_custom": false
  },
  {
    "id": 240,
    "name": "Circuit Training (General Gym)",
    "category": "hiit",
    "met_value": 8.0,
    "bodyweight_ratio": null,
    "is_custom": false
  }
];

// =========================================================================
// 4. DATABASE INITIALIZATION / SEEDING
// =========================================================================

/**
 * Populates food_library and workout_library with seed data on first run only.
 * Safe to call on every app boot -- it no-ops if data already exists.
 */
async function seedDatabase() {
  const foodCount = await db.food_library.count();
  if (foodCount === 0) {
    await db.food_library.bulkAdd(FOOD_LIBRARY_SEED);
    console.log(`[db-setup] Seeded food_library with ${FOOD_LIBRARY_SEED.length} items.`);
  }

  const workoutCount = await db.workout_library.count();
  if (workoutCount === 0) {
    await db.workout_library.bulkAdd(WORKOUT_LIBRARY_SEED);
    console.log(`[db-setup] Seeded workout_library with ${WORKOUT_LIBRARY_SEED.length} items.`);
  }

  const profile = await db.user_profile.get(1);
  if (!profile) {
    await db.user_profile.put({
      id: 1,
      age: null,
      sex: null,
      height: null,
      weight: null,
      activity_level: 'moderate', // 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
      target_deficit: 500          // kcal/day target deficit, editable in onboarding
    });
    console.log('[db-setup] Created default user_profile row.');
  }
}

// =========================================================================
// 5. FUZZY SEARCH INDEXES (Fuse.js)
// =========================================================================
// Kept in-memory and rebuilt whenever the libraries change, so free-text
// logging ("2 roti and dal" -> matched_name/confidence_score) stays fast
// without round-tripping to IndexedDB on every keystroke.

let foodFuse = null;
let workoutFuse = null;

const FUSE_FOOD_OPTIONS = {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'local_names', weight: 0.3 }
  ],
  threshold: 0.35,       // lower = stricter match
  ignoreLocation: true,
  includeScore: true
};

const FUSE_WORKOUT_OPTIONS = {
  keys: [
    { name: 'name', weight: 0.8 },
    { name: 'category', weight: 0.2 }
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true
};

async function buildSearchIndexes() {
  const allFoods = await db.food_library.toArray();
  const allWorkouts = await db.workout_library.toArray();

  foodFuse = new Fuse(allFoods, FUSE_FOOD_OPTIONS);
  workoutFuse = new Fuse(allWorkouts, FUSE_WORKOUT_OPTIONS);
}

/**
 * Fuzzy-match free text (e.g. "2 bowl dal tadka") against the food library.
 * Returns { item, confidence_score } for the best match, or null.
 * confidence_score is 0-1 (1 = exact match), derived from Fuse's distance score.
 */
function matchFoodText(query) {
  if (!foodFuse) return null;
  const results = foodFuse.search(query, { limit: 1 });
  if (results.length === 0) return null;
  const { item, score } = results[0];
  return { item, confidence_score: Math.round((1 - score) * 100) / 100 };
}

/**
 * Fuzzy-match free text against the workout library.
 * Returns { item, confidence_score } for the best match, or null.
 */
function matchWorkoutText(query) {
  if (!workoutFuse) return null;
  const results = workoutFuse.search(query, { limit: 1 });
  if (results.length === 0) return null;
  const { item, score } = results[0];
  return { item, confidence_score: Math.round((1 - score) * 100) / 100 };
}

// =========================================================================
// 6. BOOTSTRAP
// =========================================================================

async function initDatabase() {
  await db.open();
  await seedDatabase();
  await buildSearchIndexes();
  console.log('[db-setup] Database ready:', db.name);
  return db;
}

// Kick off initialization immediately when this script loads.
// Consumers can also `await initDatabase()` explicitly if they need to
// guarantee readiness before rendering (e.g. inside an app-shell script).
const dbReady = initDatabase();

// Expose on window for use by other modules / inline scripts.
if (typeof window !== 'undefined') {
  window.db = db;
  window.dbReady = dbReady;
  window.matchFoodText = matchFoodText;
  window.matchWorkoutText = matchWorkoutText;
  window.buildSearchIndexes = buildSearchIndexes;
  window.FOOD_LIBRARY_SEED = FOOD_LIBRARY_SEED;
  window.WORKOUT_LIBRARY_SEED = WORKOUT_LIBRARY_SEED;
}
