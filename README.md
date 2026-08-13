# Tracker -- Offline Calorie & Workout PWA

A single-page, offline-first PWA for logging meals and workouts via free
text, built on HTML5 + Tailwind CSS + Dexie.js (IndexedDB) + Fuse.js.

## Structure

```
pwa-tracker/
├── index.html              # App shell: tabs, header, mounts the two views
├── manifest.json            # PWA manifest (standalone, icons, theme color)
├── sw.js                    # Service worker -- precaches everything below
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── vendor/                  # Self-hosted deps -- no CDN calls at runtime
│   ├── dexie.js
│   ├── fuse.min.js
│   └── tailwind.css         # Compiled/purged Tailwind build
├── js/
│   ├── db-setup.js          # Dexie schema + 325-food/240-exercise seed data
│   ├── parser.js            # Free-text -> structured entries (online + offline)
│   ├── dashboard.js         # Questionnaire modal, energy-ring summary, date nav
│   ├── override-modal.js    # Human-verification UI for parsed entries
│   ├── backup.js            # Export/import all user data as JSON
│   └── app.js                # Boots everything, wires tabs + backup buttons
├── package.json              # Only used to rebuild vendor/tailwind.css (dev-only)
├── tailwind.config.js        # Content globs for the Tailwind build (dev-only)
└── input.css                  # Tailwind entry file (dev-only)
```

## Running it

Any static file server works (must be http/https, not `file://`, for the
service worker and IndexedDB to behave correctly):

```bash
cd pwa-tracker
python3 -m http.server 8000
# open http://localhost:8000
```

Once loaded once, the service worker precaches the full app shell (HTML,
compiled CSS, vendored Dexie/Fuse, and every JS module), so subsequent
loads work with the network fully disabled -- refresh, kill Wi-Fi, and the
app should still open and log entries.

## Rebuilding `vendor/tailwind.css`

If you change any Tailwind utility classes inside `index.html` or `js/*.js`,
recompile the CSS (the compiled file is what actually ships -- there's no
Tailwind CDN script in `index.html`):

```bash
npm install
npx tailwindcss -i input.css -o vendor/tailwind.css --minify
```

## Notes

- **Online parsing**: `parser.js`'s `mode: 'auto'` tries `POST /api/parse-entry`
  first and falls back to the offline Fuse.js pipeline on any failure. This
  static bundle has no backend, so it will always fall back to offline
  parsing unless you stand up that proxy route yourself (see the comment
  block in `parser.js` for what that route needs to do -- it must hold the
  Anthropic API key server-side, never in the browser).
- **Backups** (`js/backup.js`) export `user_profile`, `daily_logs`,
  `entry_items`, and any *custom* (`is_custom: true`) food/workout library
  entries you've added via the override modal. The pre-loaded 325/240 seed
  library is not included -- it ships with `db-setup.js` on every install.
