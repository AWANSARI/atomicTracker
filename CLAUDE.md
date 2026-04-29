# CLAUDE.md

Guidance for Claude Code (and any other agent) working on this repo. Read this top-to-bottom before making changes — it captures both architecture and the conventions established across 18+ commits, plus the current state of pending work.

## Project at a glance

- **Repo:** [github.com/AWANSARI/atomicTracker](https://github.com/AWANSARI/atomicTracker) · MIT · public · default branch `main`
- **Live:** https://atomictracker.vercel.app (Vercel free tier, auto-deploy from `main`)
- **Stack:** Next.js 14 App Router · React 18 · TypeScript strict · Tailwind · `next-pwa` · NextAuth v5 (beta)
- **Storage:** User's Google Drive (`/AtomicTracker/...`) — no project-side DB/KV/cron
- **Auth:** Google OAuth via NextAuth v5; refresh token in encrypted JWT cookie (no server store)
- **AI:** BYOK (Anthropic Claude / OpenAI / Google Gemini) — keys encrypted client-side, stored in user's Drive
- **License:** MIT

## Commands

```bash
npm run dev          # Next.js dev server on localhost:3000
npm run build        # Production build
npm run lint         # ESLint (next/core-web-vitals)  — REQUIRED before push, Vercel fails the build on lint errors
npm run typecheck    # tsc --noEmit (strict + noUncheckedIndexedAccess)
```

**Always run lint + typecheck before pushing.** No test suite — those two are the safety net.

Local dev needs `.env.local` (copy from `.env.example`) with `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. On Vercel these live in project Environment Variables.

## Architecture (one-paragraph version)

The Next.js app is a **stateless function host**. Every user's persistent data lives in their own Drive under `/AtomicTracker/`. The app is the function layer between the user's session and Google + AI provider APIs. There is no project-owned database, no KV, no cron. Scheduling is done via Google Calendar recurring events the app creates on the user's calendar (set up once via `/api/setup-reminders`, not per-accept). Multi-user from day one — each user's own Drive is the source of truth.

## Repo layout

```
app/
  layout.tsx                       Root: html/body/font/theme; bg-white dark:bg-[#0d1117]
  page.tsx                         Landing — sign-in form action
  globals.css                      Tailwind base + GitHub canvas colors
  auth-error/page.tsx              OAuth error fallback
  api/
    auth/[...nextauth]/route.ts    NextAuth handler
    generate/route.ts              POST: create draft plan (maxDuration 60)
    swap/route.ts                  POST: replace one day's meal
    regenerate/route.ts            POST: replace all unlocked meals
    accept/route.ts                POST: write grocery CSV + per-day B/L/D Calendar events;
                                   accepts onlyDays?: Day[] for partial re-accept
    prep/route.ts                  POST: prep check-in events (delete-and-recreate to dedupe)
    chat/route.ts                  POST: free-form AI Q&A about plan
    setup-reminders/route.ts       POST: ONE-TIME create Friday/Sunday/Shopping recurring reminders
                                   stored on tracker.meal-planner.json (not on each plan)
    export/route.ts                GET: zip mirror of /AtomicTracker Drive folder
    photos/route.ts                Added externally (commit 1a38321 — verify intent before editing)
  dashboard/
    layout.tsx, page.tsx, actions.ts
  settings/
    page.tsx                       Sections: passphrase, AI provider, YouTube, data export
    PassphraseSection.tsx          Client: IndexedDB-backed passphrase
    ConnectorWizard.tsx            Client: AI provider 3-step wizard
    YouTubeKeySection.tsx          Client: YouTube API key (separate connector)
    DataExport.tsx                 Client: zip download trigger
    actions.ts                     Server actions: read/save connectors envelope, test keys
    layout.tsx
  trackers/
    layout.tsx, page.tsx           Tracker picker
    meal-planner/
      page.tsx                     Tracker home: WeekCard x2, config readout, prep + reminders
      actions.ts                   Read/save tracker.meal-planner.json
      GenerateClient.tsx           Client: generate flow w/ overwrite confirm
      RemindersClient.tsx          Client: setup-reminders trigger
      setup/
        page.tsx, MealPlannerWizard.tsx   11-step config wizard
      plan/
        page.tsx, PlanClient.tsx   Plan review w/ lock/swap/regenerate, accept, chat sheet
      prep/
        page.tsx, PrepClient.tsx   Sunday prep check-in

components/
  AppShell.tsx                     Sticky header + scrollable middle + fixed bottom nav (Lucide icons)
  WeekCard.tsx                     Apple-Calendar-style mini-grid, brand-colored left-border for current week

lib/
  ai/
    providers.ts                   Provider catalog (chooser metadata, console links, steps) — client-safe
    test-keys.ts                   server-only — validate AI key with cheapest endpoint per provider
    generate.ts                    server-only — generateJson + generateChatReply dispatcher (Claude/OpenAI/Gemini)
  crypto/
    webcrypto.ts                   AES-GCM + PBKDF2-SHA256 (250k iters), versioned envelope, browser+Node
  google/
    drive.ts                       server-only — minimal Drive REST client (no googleapis package)
    calendar.ts                    server-only — minimal Calendar REST (createEvent/deleteEvent + tz helpers)
  storage/
    passphrase.ts                  client-only — IndexedDB wrapper for the passphrase
  tracker/
    meal-planner-types.ts          MealPlannerConfig schema
    meal-planner-defaults.ts       Catalogs (diets, health, allergies, cuisines, cooking freq, days)
    meal-planner-plan.ts           MealPlan/Meal/Ingredient/RecipeVideo types + ISO-week helpers
    meal-planner-prompt.ts         AI prompt builders: full-week / swap-one / regenerate-with-locks / chat-system
    meal-planner-validate.ts       Tolerant parser: parseMeals (1-7), parseSingleMeal, parseMealEnvelope
    grocery.ts                     Build aggregated grocery rows + RFC-4180 CSV
  youtube/
    lookup.ts                      server-only — fetchRecipeVideos (N results), fetchTopRecipeVideo,
                                   testYouTubeKey. NOTE: returning N results is wired in but
                                   consumers (api/generate, api/swap, api/regenerate) still call
                                   the single-result helper. Wiring up alternates in UI is a TODO.

types/
  next-auth.d.ts                   Module augmentation: Session.accessToken, Session.googleSub, JWT fields

public/
  manifest.json + icon-192/512/favicon.svg + service worker (auto-generated by next-pwa, gitignored)

PLAN.md                            Full design plan (700+ lines) — read for context on decisions
README.md                          Public README with setup + Google OAuth wizard
LICENSE                            MIT
.env.example                       AUTH_SECRET / AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
```

## Drive folder layout (per user)

```
/AtomicTracker/
  config/
    user.json                            { folderIds, googleSub, tz, locale, bootstrappedAt, appVersion }
    connectors.enc.json                  EncryptedEnvelope { v, ct, iv, salt } — base64
    tracker.meal-planner.json            MealPlannerConfig (incl. reminderEventIds, eventIdByDay)
  history/
    meals/
      {weekId}.draft.json                Draft (after generate, before accept)
      {weekId}.json                      Accepted plan (with calendarEventIds, eventIdByDay, modifiedByDay)
      {weekId}-prep.json                 Prep check-in state (with calendarEventIds)
    chats/{ISO-datetime}.json            Optional chat transcripts
    photos/                              Meal photos (added by /api/photos — verify shape before editing)
  grocery/
    {weekId}-list.csv                    RFC-4180 CSV — aggregated, sorted by category
    {weekId}-list.json                   JSON mirror with rows
  archive/
    {year}.xlsx                          Yearly XLSX archive (planned, not yet implemented)
  exports/
    atomictracker-export-{date}.zip      User-triggered exports
  logs/
    runs.log                             Generation runs (debug)
```

## Schema highlights

### MealPlannerConfig (`lib/tracker/meal-planner-types.ts`)
```
v: 1
diets: string[]            customDiet?
healthConditions: string[] customHealth?
allergies: string[]        customAllergies: string[]
cuisines: string[]         customCuisines: string[]
ingredients: string[]      customIngredients: string[]
repeatsPerWeek: 1..7
cookingFrequency: "daily" | "alternate" | "twice-weekly" | "weekly" | "custom" + customCookingFrequency?
cheatDay: Day | null
cookingDays: Day[]
shoppingDay: Day
shoppingTime: HH:MM
mealtimes: { breakfast, lunch, dinner }
defaultBreakfast?  defaultLunch?
favoriteMeals: string[]    favoriteIngredients: string[]
reminderEventIds?: { fridayPlan?, sundayPrep?, weeklyShopping? }   ← created by /api/setup-reminders
createdAt / updatedAt
```

### MealPlan (`lib/tracker/meal-planner-plan.ts`)
```
v: 1
weekId: "YYYY-Www"   weekStart / weekEnd: ISO date
status: "draft" | "accepted"
generatedAt / acceptedAt
generatedBy: { provider, model }
meals: Meal[]   (1-7 entries; cheatDay omitted)
calendarEventIds: string[]   ← per-day B/L event IDs from /api/accept
eventIdByDay: { [Day]: string }  ← per-day dinner event ID
modifiedByDay: { [Day]: ISO }    ← set by /api/swap when plan was already accepted
```

### Meal
```
day, name, cuisine, calories, macros, health_notes, instructions
ingredients: { name, qty, unit, category? }   category: produce|protein|dairy|grain|pantry|spice|frozen|other
youtube_query: string
recipe_url?: string                    YouTube search URL fallback (always set)
recipe_video?: { id, title, channel, url }   specific top-result video (when YouTube key configured)
locked?: boolean
```

### connectors.enc.json plaintext (after decrypt)
```
v: 1
ai?: { provider, apiKey, addedAt }
youtube?: { apiKey, addedAt }
telegram? (planned, not yet)
```

## Conventions — DO NOT BREAK

### Auth
- **Never `useSession()` in client components.** All auth checks happen server-side via `auth()` from `@/auth`.
- `auth()` returns `Session` with `accessToken`, `googleSub`, `error?`, `user`. The access token is fresh — `jwt()` callback handles transparent refresh with 60s buffer.
- API routes & server actions: `await auth()` at the top, return 401 if no session.

### Encryption / connector keys
- Server **never sees plaintext** AI keys at rest. They live encrypted in Drive at `/config/connectors.enc.json`.
- For one-shot AI calls: browser decrypts envelope client-side (passphrase from IndexedDB), sends plaintext key in the API request body. Server uses in-memory and discards. Never log the key.
- The encryption key is `PBKDF2(passphrase + ":" + googleSub, 250k iters, SHA-256)`. Versioned envelope `{ v: 1, ct, iv, salt }` — bump `v` if params ever change.

### No `googleapis` package
We use direct `fetch` to Drive v3 + Calendar v3. The package is too heavy for Vercel cold starts. New helpers go in `lib/google/{drive,calendar}.ts`. Both files are `"server-only"`.

### Vercel constraints
- Hobby plan function timeout: 10s default, **60s if you `export const maxDuration = 60`**. Used on `/api/generate`, `/api/swap`, `/api/regenerate`, `/api/accept`, `/api/prep`, `/api/chat`, `/api/setup-reminders`, `/api/export`.
- AI generation can take 5-15s. Use the 60s budget; don't try to fit in 10s.

### Drive
- Scope is `drive.file` only — we can only see/touch files this app created.
- Folder bootstrap is idempotent via `ensureAtomicTrackerLayout` (fast-path reads `config/user.json`).
- Don't add `googleapis`. Don't broaden the OAuth scope without a strong reason.

### Calendar event tracking — IMPORTANT
The schema for who-owns-which-event was iterated several times. The current model (post commit 16):
- **Recurring admin events** (Friday plan / Sunday prep / weekly shopping) → IDs on `tracker.meal-planner.json` `reminderEventIds`. Created/refreshed via `POST /api/setup-reminders`. **Never created by `/api/accept`** (used to be — caused duplicates).
- **Per-day dinner events** → IDs on `MealPlan.eventIdByDay[day]`. Created by `/api/accept`. Deleted+recreated on full re-accept or partial re-accept (`onlyDays`).
- **Per-day breakfast/lunch events (Mon-Fri)** → IDs on `MealPlan.calendarEventIds` (flat list). Created by `/api/accept` if `config.defaultBreakfast` / `defaultLunch` is set. Deleted+recreated on full re-accept (not partial).
- **Prep check-in events** → IDs on `prep.json.calendarEventIds`. Created by `/api/prep`. Re-submission deletes-and-recreates.

If you add a new Calendar event, **store its ID somewhere persistent** so re-accept / re-submit can clean up. Otherwise duplicates pile up.

### Color theme — GitHub Primer
- Tailwind `slate` is overridden to GitHub neutrals (`#0d1117` dark canvas, `#161b22` surface, `#30363d` border, `#f6f8fa` light subtle).
- `brand` is GitHub blue (`#0969da`). `emerald` is GitHub success green. `amber` is GitHub attention yellow. `red` is GitHub danger red.
- **Always pair `bg-white` with `dark:bg-slate-900`**, `border-slate-200` with `dark:border-slate-800`, `text-slate-900` with `dark:text-slate-100`, etc. This was a recurring bug (cards rendering bright in dark mode). New components MUST add `dark:` variants for backgrounds, borders, and text colors.
- Use `lucide-react` icons, **never emojis** in UI chrome (calendar event titles can use emojis — they help scanning, but UI buttons/icons should be SVG).
- Border radii: `rounded-md` (6px), `rounded-lg` (8px), `rounded-xl` (12px). Avoid the chunky `rounded-2xl` look.
- `darkMode: "media"` — tracks OS preference. No theme toggle.

### Wizard / form patterns
- Pills: bordered chips, `border-slate-200 bg-white text-slate-700` light, `dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300` dark, brand-blue when on.
- Inputs: `bg-white dark:bg-slate-900` with `border-slate-300 dark:border-slate-700`, focus ring brand-blue.
- Time inputs: add `dark:[color-scheme:dark]` so the native picker chrome flips.
- Stepper chips: subtle bordered pills (NOT bright fills) for completed steps.

## Commit log (high-signal recent)

| Commit  | Title |
|---------|-------|
| f396544 | scaffold next.js + tailwind + ts + pwa |
| 3d8a285 | nextauth google login (drive.file + calendar.events) |
| c987e99 | drive folder bootstrap + settings + encryption passphrase |
| 8a72067 | connector wizard for claude/openai/gemini |
| b5ad584 | tracker picker + meal-planner config wizard |
| 968afd8 | ai meal-plan generation against saved provider key |
| cd09144 | fix: bump gemini model to 2.5-flash |
| 41a7eb6 | per-meal lock + swap, regenerate-with-locks |
| a1f1b2d | chat panel + acceptance flow (grocery csv + recurring calendar) |
| abc1abe | sunday prep check-in flow |
| 73018e3 | data export (zip mirror) |
| f0004a2 | dark theme + sticky shell + cooking freq + cheat day + prep autofill |
| 15eebc4 | switch palette to github primer colors |
| 658e240 | dark-mode contrast + lucide-react icons (no more emojis) |
| d275cf4 | re-accept overwrites calendar events instead of duplicating |
| d3546d4 | multi-week home + overwrite confirm + thorough dark-mode audit |
| 546064c | youtube two links + grouped grocery + per-day re-accept + week-card fix |
| 6f188e8 | aggregate grocery, one-time recurring reminders, B/L on accept, schedule step |
| 1a38321 | (external) feat: 9 UX fixes — recipe alts, grocery groups, weekly prep, storage/reheat |
| c5d4521 | (external) updated code |

## Pending / TODO

These are unfinished pieces. Low → high priority within each section:

### Wired but not exposed in UI
- **YouTube alternates.** `lib/youtube/lookup.ts` has `fetchRecipeVideos` that returns N results in a single API call (same cost as 1). Consumers (`api/generate`, `api/swap`, `api/regenerate`) still call `fetchTopRecipeVideo`. Plan view shows only one specific link + a search fallback. **Wire the alternates** by:
  1. Bumping the meal schema: `recipe_videos: RecipeVideo[]` (replace `recipe_video?` or keep both).
  2. Updating the validate.ts to accept the array.
  3. Updating the API routes to call `fetchRecipeVideos` and store the array.
  4. Updating PlanClient MealCard to show top video + a small "More options" disclosure with 2-4 alternates.

### Bugs / rough edges
- **Stale recurring reminders from older accepts.** Existing users have admin events on Calendar from before commit `6f188e8` moved them out. The new `/api/setup-reminders` won't see those (their IDs aren't in the new `reminderEventIds`). Users have to manually delete the dupes once. Worth documenting in the README or a one-time cleanup banner.
- **`/api/photos`** was added externally (commit `1a38321`). Verify intent and schema before touching it.

### Bigger features
- **Telegram bot** — paste BotFather token in Settings, mirror chat in Telegram, accept/swap from chat commands. Plan in PLAN.md §6 Phase 2.
- **OpenClaw setup wizard** — recurring tasks via user's local OpenClaw gateway; multi-platform messaging bridge. Plan in PLAN.md §8.4.
- **Real ordering deep-links** — Walmart Open API + Amazon PA-API for product disambiguation (vs current search URLs). Phase 3.
- **Yearly XLSX archive** — auto-build when first week of new year is accepted. PLAN.md §13.
- **Tracker abstraction** — refactor `Tracker` as a plug-in interface; add a second tracker (e.g. workout planner) to validate. PLAN.md §13.
- **Granular ingredient editing** — per-ingredient swap/add/remove on plan review.

## Working with this repo

### Pushing changes
The user's local Mac filesystem is mounted into the sandbox via FUSE that **blocks `git` unlinks** — meaning `git init` / `git commit` fails inside the sandbox if you try to operate against `/sessions/.../mnt/Atomic Tracker/.git/`. Workaround pattern used throughout:

```bash
TOKEN='<github_pat>'
SRC="/sessions/<session>/mnt/Atomic Tracker"
DEST=/tmp/atomictracker-pushN
git clone -q "https://x-access-token:${TOKEN}@github.com/AWANSARI/atomicTracker.git" "$DEST"
rsync -a --exclude='node_modules' --exclude='.next' --exclude='.git' \
  --exclude='next-env.d.ts' --exclude='*.tsbuildinfo' \
  --exclude='public/sw.js' --exclude='public/sw.js.map' \
  --exclude='public/workbox-*.js' --exclude='public/workbox-*.js.map' \
  --exclude='public/worker-*.js' --exclude='public/fallback-*.js' \
  --exclude='.DS_Store' --exclude='.env*' \
  "$SRC/" "$DEST/"
cd "$DEST" && git add -A && git commit -q -m "..." && git push origin main
rm -rf "$DEST"
```

The user provides a **fresh fine-grained PAT** for each push (1-day expiry, scoped to repo Contents:write + Metadata:read). Ask them for one rather than reusing.

If running in a normal local dev environment (not the FUSE-mounted sandbox), just `git commit && git push` from the workspace folder works — no workaround needed.

### Always before push
```bash
npm run typecheck && npm run lint
```

ESLint rules from `next/core-web-vitals` are strict — `react/no-unescaped-entities` will trip on bare apostrophes in JSX. Use `&rsquo;` / `&apos;` for those.

### Vercel
- Auto-deploys on push to `main`
- Custom domain: none. Stick to `atomictracker.vercel.app`
- Required env vars (already set): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`

## Decision log (why we did things)

- **No project state** — was a hard requirement from the user. We dropped Vercel KV early; everything that needs persistence goes in the user's Drive. Trade-off: weekly auto-generate via cron is impossible. Replaced with Calendar reminders the user taps, plus optional Claude Code Routine / OpenClaw integrations (Phase 2).
- **GitHub Primer palette** — original indigo + slate looked off, several iterations of dark-mode contrast complaints. Switched to GitHub Primer colors via Tailwind palette override; existing utility classes auto-pick up the new look.
- **`darkMode: "media"`** — no toggle. User explicitly wanted system-driven.
- **`recipe_url` (search) + `recipe_video` (specific)** — kept both because the YouTube key is optional. Without the key, search URL is the fallback. With it, we get a specific video.
- **Recurring reminders moved out of `/api/accept`** — the old code created them on every accept, leading to stacks of duplicate "AtomicTracker · Plan next week" events on the user's calendar. Now created once via `/api/setup-reminders`, stored on the config (not per-plan).
- **Per-day re-accept** — added so swapping one meal post-accept doesn't require redoing the whole calendar. `MealPlan.modifiedByDay` flags the dirty day; PlanClient shows a per-card "Sync to Calendar" button that calls `/api/accept` with `onlyDays: ["Tue"]`.
- **Aggregated grocery** — first version emitted one row per (day, ingredient), so a user saw "1 tomato" four times. Now we bucket by `(item, unit)` and sum numeric quantities (with fraction / mixed-number / range parsing).
- **Lucide icons replacing emojis** — the bottom nav with 🏠 📋 ⚙️ looked sloppy. Lucide gives consistent stroke icons. Calendar event titles still use emojis (helps glanceability in Calendar UI).

## Repo conventions one-liner cheatsheet

- File header `import "server-only";` for any module that mustn't reach the browser.
- Server actions live in `actions.ts` files with `"use server"` at top, alongside the page that uses them.
- Auth check: `const session = await auth(); if (!session?.accessToken || !session.googleSub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });`
- Drive write: `await ensureAtomicTrackerLayout(...)` first to get folder IDs.
- Crypto: pass `Uint8Array<ArrayBuffer>` (use the `randomBytes` / `utf8` helpers in `webcrypto.ts` — TS 5.7's strict ArrayBuffer typing breaks naive `new Uint8Array(n)`).
- No `console.log` of secrets. Sed the token out of any URL before logging (`sed "s|${TOKEN}|***REDACTED***|g"`).
