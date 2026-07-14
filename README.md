# Compound

*Small reps, compounded.* — Ahmed's personal life-maxing app.

A private, installable web app (PWA) to run every area of life: habits & streaks, tasks,
goals, gym, diet, trading discipline, a content inbox, money/debt payoff, and reading —
with Claude as the coach behind it.

## Run it locally
It's plain HTML/CSS/JS — no build step. Because it uses ES modules, open it through a
local server (not by double-clicking the file):

```
# from the "Life App" folder, either:
python -m http.server 5173
# then visit http://localhost:5173
```

## How it's built
- `index.html` — the shell (app bar, view area, bottom tabs)
- `styles.css` — the dark, mobile-first design system
- `js/store.js` — all data, saved to the browser's localStorage
- `js/ui.js` — small shared helpers (DOM + dates)
- `js/app.js` — boots the app and switches between tabs
- `js/modules/*.js` — one file per tab

## Privacy rule
**The code is public; your data never is.** Personal data lives only in the browser
(localStorage) and, later, your own Supabase account. Never commit backups, exports,
API keys, or the `_mydata/` drop-folder.

## Roadmap
- **M1 ✅** Core loop: Today, Habits + streaks, Tasks, evening check-in, Settings/export.
- **M2** Goals, Gym, Diet, Trading discipline, Inbox, Money, Books.
- **M3** PWA polish: icons, offline, install on devices.
- **M4** Cloud sync (Supabase) so all devices share data.
- **M5** Deploy to GitHub Pages; install on phone/iPad/laptop.
- **M6** Go live: real habits/goals in; first inbox item processed end-to-end.

### Backlog (later)
- Reading HQ (book tutor, learning journal that pipes insights into habits/goals)
- Reminders / notifications
- Progress charts & weekly auto-reports
- Claude AI inside the app (API)
- Richer finance (budgets, net worth)
- Photo progress log
- Project 2: business / marketing workspace (separate folder)
