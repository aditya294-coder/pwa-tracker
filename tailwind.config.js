/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  safelist: [
    // Dynamic/arbitrary classes assembled at runtime inside template
    // strings (dashboard.js / override-modal.js) that the content scanner
    // can't always statically detect from a full-file scan.
    { pattern: /bg-\[var\(--db-.*\)\]/ },
    { pattern: /text-\[var\(--db-.*\)\]/ },
    { pattern: /border-\[var\(--db-.*\)\]/ },
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

