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
  globals.css                      Tailwind base + GitHub canvas colors + print stylesheet
  auth-error/page.tsx              OAuth error fallback
  api/
    auth/[...nextauth]/route.ts    NextAuth handler
    generate/route.ts              POST: create draft plan (maxDuration 60). Now produces
                                   B/L/D + optional snacks (4×7 entries) and feeds the AI an
                                   AdherenceSummary built from the last 28 days of habit /
                                   supplement / analytics logs.
    swap/route.ts                  POST: replace one (day, slot) meal. Body: { dayToSwap,
                                   slotToSwap?: "breakfast"|"lunch"|"dinner"|"snack" }
    regenerate/route.ts            POST: replace all unlocked meals (slot-aware locks)
    accept/route.ts                POST: write grocery CSV + per-(day, slot) Calendar events.
                                   IDs persisted on MealPlan.eventIdByDaySlot ("${day}/${slot}").
                                   Legacy MealPlan.eventIdByDay still populated for the dinner
                                   slot for back-compat. Accepts onlyDays?: Day[] for partial.
    prep/route.ts                  POST: prep check-in events (delete-and-recreate to dedupe)
    chat/route.ts                  POST: free-form AI Q&A about plan
    setup-reminders/route.ts       POST: ONE-TIME create Friday/Sunday/Shopping recurring reminders
                                   stored on tracker.meal-planner.json (not on each plan).
                                   Weekly shopping description points at the meal-planner home —
                                   each week's grocery list lives on its own accepted plan.
    save-plan/route.ts             POST: persist edited plan to Drive without calendar side-effects
    archive/route.ts               POST: generate yearly XLSX archive { year }; writes to
                                   /AtomicTracker/archive/{year}.xlsx (overwrites if exists)
    export/route.ts                GET: zip mirror of /AtomicTracker Drive folder
    photos/route.ts                POST: upload meal photo (FormData ≤8MB) → /history/photos/
    supplements/log/route.ts       POST: per-day adherence log → /history/supplements/{date}.json
    supplements/setup-reminders/route.ts   POST: daily-recurring Calendar event per supplement slot
    habits/log/route.ts            POST: per-day habit done-list → /history/habits/{date}.json
    habits/setup-reminders/route.ts        POST: optional daily-recurring habit reminders
    analytics/log/route.ts         POST: per-day energy/mood/sleep + optional hairFall/cycle
                                   → /history/analytics/{date}.json
  dashboard/
    layout.tsx, page.tsx, actions.ts       "Today" links (Daily timeline, Insights) + Trackers + Connections
  settings/
    page.tsx                       Sections: passphrase, AI provider, YouTube, data export
    PassphraseSection.tsx          Client: IndexedDB-backed passphrase
    ConnectorWizard.tsx            Client: AI provider 3-step wizard
    YouTubeKeySection.tsx          Client: YouTube API key (separate connector)
    DataExport.tsx                 Client: zip download trigger
    actions.ts                     Server actions: read/save connectors envelope, test keys
    layout.tsx
  timeline/
    page.tsx                       Daily timeline view — fuses meals + supplements + habits
                                   into one chronological day. ?date=YYYY-MM-DD selects a day,
                                   ?print=fridge swaps to a printable table layout.
    TimelineClient.tsx             Color-coded chips (meals brand-blue, supplements emerald,
                                   habits amber, warnings amber-tone), tap-to-expand details
  insights/
    page.tsx                       Reads last 28 days of analytics/habits/supplements + last 4
                                   accepted plans → computeInsights → severity-coded card grid
    InsightsClient.tsx             Card UI with <details> citations
    log/page.tsx + InsightsLogClient.tsx   Daily log form (energy/mood/sleep, optional
                                   hairFall + cycle gated on user's symptoms / sex)
    actions.ts                     readAnalyticsLog(date), readAnalyticsLogsLast(days) — cached
  trackers/
    layout.tsx, page.tsx           Tracker picker — registry-driven from lib/tracker/registry.ts
    meal-planner/
      page.tsx                     Tracker home: config (collapsed) → WeekCard x2 → daily targets card
      actions.ts                   Read/save tracker.meal-planner.json (defensive merge with defaults)
      GenerateClient.tsx           Client: generate flow w/ overwrite confirm + per-week override panel
      RemindersClient.tsx          Client: setup-reminders trigger
      setup/
        page.tsx, MealPlannerWizard.tsx   12-step config wizard (incl. Body & goals + symptoms)
      plan/
        page.tsx, PlanClient.tsx   Plan review w/ lock/swap/regenerate, slot label per card,
                                   inline ingredient editing, accept, chat sheet
      prep/
        page.tsx, PrepClient.tsx   Sunday prep check-in (per-slot photo upload)
    supplements/
      page.tsx, SupplementsClient.tsx      Vertical schedule grouped by time-of-day band;
                                   tap-to-log, "Setup reminders" CTA, conflict warnings
      actions.ts                   readSupplementConfig (cached), saveSupplementConfig
      setup/
        page.tsx, SupplementWizard.tsx     3-step wizard (Catalog → Custom → Review)
    habits/
      page.tsx, HabitsClient.tsx   Big-tap checklist, header chips for streak + week %,
                                   7-day dot grid per habit, optimistic toggle
      actions.ts                   readHabitConfig / saveHabitConfig / readHabitLog(date) /
                                   readHabitLogsLast(days) — all cached
      setup/
        page.tsx, HabitsWizard.tsx 4-step wizard (Catalog → Custom → Reminders → Review)

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
    drive.ts                       server-only — minimal Drive REST client (no googleapis package).
                                   readAtomicTrackerLayout / ensureAtomicTrackerLayout are wrapped
                                   in React `cache()` for per-request memoization.
    calendar.ts                    server-only — minimal Calendar REST (createEvent/deleteEvent + tz helpers)
  storage/
    passphrase.ts                  client-only — IndexedDB wrapper for the passphrase
  tracker/
    meal-planner-types.ts          MealPlannerConfig schema (incl. body metrics, symptoms[], snacksEnabled)
    meal-planner-defaults.ts       Catalogs: DIET_GROUPS, HEALTH_OPTIONS, COMMON_ALLERGIES, CUISINES,
                                   SYMPTOM_OPTIONS (hair-loss, fatigue, brain-fog, irregular-cycle,
                                   etc.), COOKING_FREQUENCIES, DAYS_OF_WEEK, CUISINE_INGREDIENTS
                                   (Indian section expanded with poha/dalia/ragi/idli/dosa/millets +
                                   moong/toor/urad/chana dals)
    meal-planner-plan.ts           MealPlan/Meal/Ingredient/RecipeVideo types + ISO-week helpers.
                                   Slot type ("breakfast"|"lunch"|"dinner"|"snack") + SLOT_LABEL.
                                   eventIdByDaySlot map keyed `${day}/${slot}`.
    meal-planner-prompt.ts         AI prompt builders: full-week / swap-one / regenerate-with-locks /
                                   chat-system. Now emits a 4×7 (B/L/D + optional Snack) plan with
                                   per-slot guidance, body metrics, daily targets, symptoms-aware
                                   bias, optional WeekOverride and AdherenceSummary blocks, plus
                                   cycle-phase nutrition guidance (menstrual/follicular/ovulatory/
                                   luteal/spotting). buildAdherenceSummary() summarizes last 7 days
                                   from analytics + habit + supplement logs.
    meal-planner-validate.ts       Tolerant parser: parseMeals (1-28), parseSingleMeal (defaults
                                   missing slot to "dinner" for back-compat), parseMealEnvelope
    grocery.ts                     Build aggregated grocery rows + RFC-4180 CSV (groupGroceryRows
                                   buckets by category for the PlanClient preview)
    xlsx-archive.ts                server-only — buildYearlyArchiveXlsx(plans): Uint8Array;
                                   Open XML workbook via JSZip (already in package.json)
    nutrition.ts                   Pure: computeBmi, computeDailyTargets (Mifflin-St Jeor BMR ×
                                   activity factor + goal delta), goalLabel, canComputeTargets
                                   type guard. Macros: protein scaled by bodyweight (1.4-1.8 g/kg
                                   by goal), fat 25%, carbs fill remainder, fiber 14g per 1000kcal.
    timeline.ts                    Pure: fuseTimeline + mealsForDate + habitExpectedOn + date
                                   helpers (todayIso/dateFromIso/isoFromDate). Used by /timeline.
    supplement-types.ts            SupplementConfig schema (Supplement, TimingRule, TimingHint,
                                   AvoidTag). Storage at /AtomicTracker/config/tracker.supplements.json.
    supplement-catalog.ts          14-entry catalog: Levothyroxine, Iron bisglycinate, Vitamin D3,
                                   B12, Omega-3, Magnesium glycinate, Calcium, Vitamin C, Zinc,
                                   Multivitamin, Probiotics, Ashwagandha, Inositol, Biotin
    supplement-rules.ts            Pure: computeDailySchedule(supplements, mealtimes) →
                                   TimelineSlot[]. Greedy solver respecting empty-stomach,
                                   bedtime, with-fat hints + gap constraints (iron 2h from
                                   calcium / 4h from thyroid, magnesium 2h from iron etc.).
                                   Surfaces human-readable warnings when conflicts unavoidable.
    habit-types.ts                 HabitConfig + HabitDayLog schemas. Cadence: daily / weekdays /
                                   weekly / custom.
    habit-defaults.ts              HABIT_CATALOG (12 suggestions: soaked nuts, seed cycling,
                                   3 fruits, ginger/garlic, water, walk, sleep ≥7h, sunlight,
                                   no-screens-bed, warm-water-morning, weekly fish, weekly strength)
    habit-stats.ts                 Pure: computeHabitStats (currentStreak, longestStreak,
                                   weeklyCompletion), computeOverallWeeklyCompletion. Cadence-aware:
                                   non-expected days don't break streaks.
    analytics-types.ts             AnalyticsDayLog schema (energy 1-5, mood 1-5, sleepHours 0-14,
                                   optional hairFall, optional cycleMarker, notes) + label catalogs
    insights.ts                    Pure: computeInsights → InsightCard[]. 7 hand-coded rules
                                   (protein deficit, sleep deficit, energy uptrend, habit
                                   consistency shift, hair-fall improving, luteal-phase tip,
                                   iron-absorption tip). Each rule cites the data window.
    registry.ts                    TrackerRegistryEntry + TrackerPlaceholder types — the shared
                                   discovery surface every tracker exposes (id, title, icon,
                                   href, setupHref, isConfigured probe). app/trackers/page.tsx
                                   iterates over a TRACKERS array instead of hard-coded markup.
  youtube/
    lookup.ts                      server-only — fetchRecipeVideos(key, q, count=5) returns N results
                                   in one API call; fetchTopRecipeVideo is a backwards-compat wrapper.
                                   API routes (generate/swap/regenerate) store videos[0] as
                                   recipe_video and videos[1..4] as recipe_alternatives; PlanClient
                                   renders top video + collapsible "Other recipe videos" list.

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
    tracker.meal-planner.json            MealPlannerConfig (body metrics, symptoms, snacksEnabled,
                                         reminderEventIds, eventIdByDay…)
    tracker.supplements.json             SupplementConfig (list of supplements + their TimingRule
                                         + per-supplement reminderEventIds)
    tracker.habits.json                  HabitConfig (list of habits + cadence + remindersEnabled
                                         + per-habit reminderEventIds)
  history/
    meals/
      {weekId}.draft.json                Draft (after generate, before accept)
      {weekId}.json                      Accepted plan (with calendarEventIds, eventIdByDay,
                                         eventIdByDaySlot, modifiedByDay, weekOverride?)
      {weekId}-prep.json                 Prep check-in state (with calendarEventIds + photo viewUrls)
    chats/{ISO-datetime}.json            Optional chat transcripts
    photos/
      {weekId}/
        {day}-{slot}-{timestamp}.{ext}   Meal photos uploaded via PrepClient; viewUrl attached
                                         to Calendar event description and stored in prep.json
    supplements/
      {YYYY-MM-DD}.json                  { date, taken: { [supplementId]: takenAtISO } }
    habits/
      {YYYY-MM-DD}.json                  { v: 1, date, done: string[], loggedAt }
    analytics/
      {YYYY-MM-DD}.json                  AnalyticsDayLog — energy/mood/sleep + optional
                                         hairFall/cycleMarker/notes
  grocery/
    {weekId}-list.csv                    RFC-4180 CSV — aggregated, sorted by category
    {weekId}-list.json                   JSON mirror with rows
  archive/
    {year}.xlsx                          Yearly XLSX archive — built on demand via /api/archive
                                         and auto-built on first accept of a new year
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
defaultBreakfast?  defaultLunch?       ← legacy fallback fields, AI-gen now produces B/L too
favoriteMeals: string[]    favoriteIngredients: string[]
heightCm? weightKg? age? sex?           ← body metrics, drives BMI + Mifflin-St Jeor targets
activityLevel? goal?                    ← "sedentary"|"light"|... and "lose"|"maintain"|"gain"
nutritionistNotes?: string              ← free-text, fed verbatim into the AI prompt
symptoms?: string[]                     ← SYMPTOM_OPTIONS ids (hair-loss, fatigue, brain-fog…)
snacksEnabled?: boolean                 ← toggles 4×7 (B/L/D + Snack) vs 3×7 generation
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
meals: Meal[]   (3-28 entries; one per (day, slot); cheatDay fully omitted)
calendarEventIds: string[]   ← legacy admin/B/L event IDs (kept for back-compat)
eventIdByDay: { [Day]: string }       ← legacy dinner-only map (still populated for back-compat)
eventIdByDaySlot: { [`${Day}/${Slot}`]: string }   ← canonical map for slot-aware re-accept
modifiedByDay: { [Day]: ISO }          ← set by /api/swap when plan was already accepted
weekOverride?: WeekOverride            ← per-week override applied at generate time
```

### Meal
```
day, slot, name, cuisine, calories, macros, health_notes, instructions
slot: "breakfast" | "lunch" | "dinner" | "snack"   ← optional on read (legacy plans → "dinner")
ingredients: { name, qty, unit, category? }   category: produce|protein|dairy|grain|pantry|spice|frozen|other
youtube_query: string
recipe_url?: string                       YouTube search URL fallback (always set)
recipe_video?: { id, title, channel, url }   top-result video (when YouTube key configured)
recipe_alternatives?: RecipeVideo[]       up to 4 further videos
storage?: string                          AI-generated: how to refrigerate/freeze after cooking
reheat?: string                           AI-generated: how to reheat and serve
locked?: boolean
```

### SupplementConfig (`lib/tracker/supplement-types.ts`)
```
v: 1
supplements: Supplement[]               ← each: { id, name, dose?, catalogId?, timesPerDay,
                                          rule: TimingRule, reminderEventIds? }
TimingRule: { hints?: TimingHint[], avoidTags?: AvoidTag[],
              gapMinutesFrom?: { tag, minutes }[], selfTags?: AvoidTag[] }
TimingHint: empty-stomach | before-food | with-food | after-food | with-fat |
            morning | bedtime | any-time
AvoidTag: calcium | iron | thyroid | tea-coffee | magnesium | vitamin-c | fiber-meal
createdAt / updatedAt
```

### HabitConfig (`lib/tracker/habit-types.ts`)
```
v: 1
habits: Habit[]                          ← each: { id, name, cadence, weeklyDay?, customDays?,
                                          tags?, reminderEventIds?, catalogId? }
cadence: "daily" | "weekdays" | "weekly" | "custom"
remindersEnabled: boolean
createdAt / updatedAt
```

### AnalyticsDayLog (`lib/tracker/analytics-types.ts`)
```
v: 1, date, energy?, mood?, sleepHours?, hairFall?, cycleMarker?, notes, loggedAt
energy/mood: 1-5 scale       sleepHours: 0-14
hairFall: low | moderate | heavy        ← weekly cadence
cycleMarker: menstrual | follicular | ovulatory | luteal | spotting
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
The schema for who-owns-which-event was iterated several times. The current model:
- **Recurring meal-planner admin events** (Friday plan / Sunday prep / weekly shopping) → IDs on `tracker.meal-planner.json` `reminderEventIds`. Created/refreshed via `POST /api/setup-reminders`. **Never created by `/api/accept`** (used to be — caused duplicates).
- **Per-(day, slot) meal events** → IDs on `MealPlan.eventIdByDaySlot["${day}/${slot}"]`. Created by `/api/accept`. Deleted+recreated on full re-accept or partial re-accept (`onlyDays`). The legacy `MealPlan.eventIdByDay[day]` map is also still populated for the dinner slot to keep older code paths working.
- **Prep check-in events** → IDs on `prep.json.calendarEventIds`. Created by `/api/prep`. Re-submission deletes-and-recreates.
- **Per-supplement daily-recurring events** → IDs on each `Supplement.reminderEventIds`. Created by `POST /api/supplements/setup-reminders`. RRULE `FREQ=DAILY`. Idempotent re-run deletes prior IDs and re-creates.
- **Per-habit recurring events (optional)** → IDs on each `Habit.reminderEventIds`. Created by `POST /api/habits/setup-reminders` only when `HabitConfig.remindersEnabled` is true. RRULE per cadence: `DAILY` for daily, `WEEKLY;BYDAY=MO,TU,WE,TH,FR` for weekdays, `WEEKLY;BYDAY=<day>` for weekly/custom.

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

The repo has a long log; only the high-signal recent commits are listed. Run `git log --oneline -30` for the full picture.

| Commit  | Title |
|---------|-------|
| f396544 | scaffold next.js + tailwind + ts + pwa |
| 3d8a285 | nextauth google login (drive.file + calendar.events) |
| 968afd8 | ai meal-plan generation against saved provider key |
| 41a7eb6 | per-meal lock + swap, regenerate-with-locks |
| a1f1b2d | chat panel + acceptance flow (grocery csv + recurring calendar) |
| abc1abe | sunday prep check-in flow |
| 73018e3 | data export (zip mirror) |
| 15eebc4 | switch palette to github primer colors |
| 6f188e8 | aggregate grocery, one-time recurring reminders, B/L on accept |
| 1a38321 | 9 UX fixes — recipe alts, grocery groups, weekly prep, storage/reheat |
| 71bde27 | yearly XLSX archive endpoint + plan save without calendar side-effects |
| eb46c84 | fix: schedule step crash on old configs + UI polish |
| 6137063 | feat: body metrics, BMI + daily targets, nutritionist notes, weekly override |
| 9a2044b | perf: per-request memoize Drive layout + config; parallelize page loads |
| 01bc78c | feat(phase1-3): Supplement Scheduler + Habit Tracker + B/L/D/Snacks meals |
| 64a0311 | feat(phase4-5): Daily Timeline + Analytics & Insights |
| 5e96a0a | feat(phase6): adherence-aware AI prompt + cycle-based nutrition + print CSS |
| d485f29 | feat(phase7): registry-driven Trackers picker |

## Pending / TODO

These are unfinished pieces. Most of the original Phase-2 backlog was shipped in the seven-phase health-and-wellness expansion (commits `01bc78c` → `d485f29`). What remains:

### Bugs / rough edges
- **Stale recurring reminders from older accepts.** Existing users have admin events on Calendar from before commit `6f188e8` moved them out. The new `/api/setup-reminders` won't see those (their IDs aren't in the new `reminderEventIds`). Users have to manually delete the dupes once. A one-time info notice is shown on the meal planner home when `reminderEventIds` is not yet configured.

### External-integration features (each needs its own setup flow + auth)
- **Telegram bot** — paste BotFather token in Settings, mirror chat in Telegram, accept/swap from chat commands. Plan in PLAN.md §6 Phase 2.
- **OpenClaw setup wizard** — recurring tasks via user's local OpenClaw gateway; multi-platform messaging bridge (WhatsApp/Discord/Slack/Signal). Plan in PLAN.md §8.4.
- **Claude Code Routine setup wizard** — alternative for paid Claude users. PLAN.md §8.2.

### Phase-3 ordering integrations
- **Walmart Open API** + **Amazon PA-API** for product disambiguation (vs the current search-URL-only fallback).
- **DoorDash DashMart** deep-link cart prefill.

### Validation of the tracker abstraction
- **Second concrete tracker** (e.g. Workout Planner) using `lib/tracker/registry.ts`. The registry pattern shipped in Phase 7; a second active tracker would validate it end-to-end. Workout/Finance placeholders are already shown in the picker.

### Already shipped — recorded so future agents don't re-build them
- ✅ Body metrics (height, weight, age, sex, activity, goal) + BMI + Mifflin-St Jeor daily targets
- ✅ Nutritionist notes free-text field
- ✅ Symptoms multi-select (hair-loss, fatigue, brain-fog, irregular-cycle, etc.)
- ✅ B/L/D + optional snacks AI generation (slot-aware swap/regenerate/accept)
- ✅ Indian carb staples (poha, dalia, ragi, idli, dosa, millets) in CUISINE_INGREDIENTS
- ✅ Per-week override (cuisines / ingredients / kcal / notes) in GenerateClient
- ✅ Supplement Scheduler tracker with conflict-aware solver
- ✅ Habit Tracker with cadence-aware streaks
- ✅ Daily Timeline view fusing meals + supplements + habits (+ printable mode)
- ✅ Analytics + Insights (daily energy/mood/sleep, optional hairFall/cycle, 7 hand-coded insight rules)
- ✅ AI prompt adherence-aware + cycle-phase nutrition guidance
- ✅ Yearly XLSX archive — `POST /api/archive { year }` + Settings UI button + auto-trigger on first accept of a new year
- ✅ Tracker registry — `lib/tracker/registry.ts`, drives `app/trackers/page.tsx`
- ✅ Granular ingredient editing on plan review (PlanClient `addIngredient` / `removeIngredient`)
- ✅ Favorite meals as first-class — heart toggle on meal cards + Favorites manager on the meal-planner home
- ✅ Per-request `cache()` memoization for `auth()`, `readAtomicTrackerLayout`, `ensureAtomicTrackerLayout`, `readMealPlannerConfig`, etc.

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
