# Compound — shared brief for AI agents

**Read this before changing anything.** Both Claude Code and Codex work in this repo.
This file is the single source of truth for how the app is built and how we avoid
standing on each other's toes.

## What this is

A personal life-tracking PWA ("Compound") built for Ahmed. Plain HTML/CSS/JS, **no build
step, no framework, no npm dependencies**. It's deployed to GitHub Pages and installed on
his phone/iPad/laptop. He uses it every single day — **breaking `main` breaks his daily system.**

## Architecture (keep it this way)

```
index.html            shell: app bar, #view, bottom tabs
styles.css            design system: CSS custom properties, dark UI
sw.js                 service worker (offline + install). VERSION const at the top.
js/app.js             boot, hash routing (#/today), renders active module into #view
js/tabs.js            tab registry (metadata only — no render fns, avoids circular imports)
js/store.js           ALL state. localStorage. defaultData() defines the schema.
js/ui.js              shared helpers: el(), dates, restoreScroll()
js/sync.js            Supabase cloud sync. MERGERS per module. SYNC_MODULES list.
js/vendor/supabase.js bundled library (do NOT swap for a CDN link)
js/modules/*.js       one file per tab. Each exports { render(view) }.
```

### Conventions
- Build DOM with the `el()` helper from `ui.js`. **Never pass `null` to a native
  `.append()`** — it renders the literal text "null".
- Every module's `render()` starts with `const y = window.scrollY` and ends with
  `restoreScroll(y)` so ticking something doesn't jump the page.
- State changes go through `update((d) => {...})` from `store.js` — it saves + notifies.
- New data field? Add it to `defaultData()` in `store.js`, add a merger in `sync.js`
  if two devices could edit it, and add the key to `SYNC_MODULES`.
- **Bump `VERSION` in `sw.js` on every change to a cached file.** If you don't, devices
  keep serving the OLD file from cache and your fix appears not to work.

## 🚫 Hard rules — do not break these

1. **Never commit personal data.** `_mydata/`, backups, exports, spreadsheets and
   screenshots are gitignored. The repo is PUBLIC — code only.
2. **Never put an API key in frontend code.** Anything in `js/` is visible to the world.
   API calls that need a secret must go through a server-side proxy (see AI Coach below).
3. **Never do a destructive git operation** (`reset --hard`, `checkout .`, force push)
   without checking `git status` first. His working tree may hold unsaved work.
4. **No build tooling, no frameworks, no npm runtime deps.** The whole point is that it
   stays readable and deployable as static files.
5. **Data migrations must be additive.** `migrate()` in `store.js` merges saved data over
   defaults so old backups never break. Don't rename or delete existing fields.

## Deploying

```
git add -A
git commit -m "..."
git push origin main
git push origin main:gh-pages     # <- both, or the live site won't update
```
Live at https://ace1204a.github.io/compound/ . Pages can take 1–3 min; if it stalls, an
empty commit re-triggers the build.

## Branches — who works where

| Branch | Purpose | Rules |
|---|---|---|
| `main` | **Ahmed's personal app.** Deployed, used daily. | Must always work. Test before pushing. |
| `product` | The commercial version (aimed at 30–40 year olds). | Experiment freely. Never auto-deploys. |

- Build a feature on **one** branch; port it to the other deliberately (`git cherry-pick <sha>`).
- **Before starting work: `git pull`.** Before finishing: commit. Small, frequent commits
  mean the other agent can see and merge your work cleanly.
- If you're an agent doing a big/risky change, branch off first: `git checkout -b feature/x`.

## The AI Coach feature (planned)

Compound is a static site with no backend. So:

- ❌ **Do NOT** call the Anthropic/OpenAI API directly from `js/` with a key in the code.
  The repo is public and the key would be stolen and billed within hours.
- ✅ **Do** put the key server-side. Cleanest fit here: a **Supabase Edge Function** (he
  already has Supabase for sync) that holds the key, receives a request from the app, calls
  the model, and returns the reply. The frontend only ever talks to that function, authed
  with his existing Supabase login.
- The coach's context should be assembled from the existing store (habits, check-ins,
  trading log, journal) — reuse the "coach brief" logic in `js/modules/settings.js`.

## Working notes (keep updated)

- Current version: see the About card in `js/modules/settings.js` and `VERSION` in `sw.js`.
- Sync merges by module; a patch file with `{"__merge": {...}}` updates only listed fields,
  `{"__append": [...]}` adds array items. Used to ship plan/rules updates without wiping data.

## The AI coach (v0.23+)

`js/modules/coach.js` is a conversation, nothing else. It deliberately does NOT
add promises, reflections or weekly reviews — Habits, Today and Journal already
own those, and duplicating them splits the data.

Three rules, none of them optional:

1. **The Anthropic API key lives only in `Deno.env` inside
   `supabase/functions/coach/`.** Never in `js/`. Everything in `js/` is served
   to the browser and this repo is public.
2. **No personal facts in this repo.** The coach's persona (`PERSONA` in the
   edge function) is style and guardrails only. Who the user is arrives at
   request time in `coach.profile`, which is private synced data delivered by a
   patch file from `_mydata/`.
3. **The spend cap fails closed.** If `coach_usage` can't be read, the function
   refuses to call the API at all. Do not "fix" this by defaulting to zero.

Setup is three steps: run `supabase/coach-usage.sql`, deploy the function, set
`ANTHROPIC_API_KEY`. Optional env: `COACH_CAP_CALLS_PER_DAY`,
`COACH_CAP_USD_PER_DAY`, `COACH_CAP_USD_PER_MONTH`.

Context sent to the coach comes from `buildBrief()` in `js/modules/settings.js`
— the same brief the "copy coach brief" button produces. Extend that one
function when new data should be visible to the coach.
