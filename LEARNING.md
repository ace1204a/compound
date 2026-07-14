# Ahmed's Claude Code cheatsheet

My running notes on how this stuff works. One entry per lesson. Reread anytime.

---

## Lesson 1 — How a web app is actually put together (M1)

**What we built:** the skeleton of Compound and its first three screens.

**The concept:** a web app is just a folder of plain text files a browser reads.
- **HTML** (`index.html`) = the structure — the boxes on the page.
- **CSS** (`styles.css`) = the styling — colours, spacing, the "look".
- **JavaScript** (`js/…`) = the behaviour — what happens when you tap.
Splitting the JS into small files ("modules"), one per screen, keeps it easy to grow.
Your data is saved in the browser's own storage (**localStorage**) — no internet needed yet.

**One word to remember:** **files**. There's no magic — an app is organised text files.

**How I work with Claude (what I learned this session):**
- **Plan mode** = Claude proposes a plan and waits for my OK before building. Good for big things.
- Claude writes all the code; I only do the human steps (signing up, installing, using it).
- Claude **remembers me between sessions** in its memory — I don't re-explain myself each time.
- To change anything, I just say it in plain English: "make the streak flame bigger", "add a sleep habit".

---

## Lesson 2 — Real debugging: the £ bug (M2)

**What happened:** the whole app went blank. Cause: Claude named a function `£` —
and JavaScript doesn't allow £ as a name. One typo in one file killed everything,
because all the files load as a chain.

**The concept:** this is what debugging actually is — not guessing, but narrowing:
1. Did the files arrive? (checked the network — all fine)
2. Does each file parse? (tested them one by one — found `finance.js`, then `app.js` via caching)
3. Fix, force a truly fresh reload, confirm.

**One word to remember:** **narrow**. Bugs die when you cut the search space in half, repeatedly.

---

## Lesson 3 — Git: the save-game system (M3)

**What we did:** `git init` then the first **commit** — a permanent snapshot of all 26 files.

**The concept:** git is version control — every commit is a save point you can
always return to. No more "final_v2_REAL.docx". **GitHub** is just a website that
hosts your git snapshots online, which is also how the app gets to your phone.
And `.gitignore` is the bouncer: `_mydata/` (your personal stuff) never gets in.

**One word to remember:** **commit** = save point.

---
<!-- New lessons get added below as we go. -->
