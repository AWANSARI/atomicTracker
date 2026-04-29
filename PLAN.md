# AtomicTracker — Weekly Meal Planner

**Repo:** `AWANSARI/atomicTracker`
**Stack:** Next.js 14 (App Router) + React + Tailwind + TypeScript
**Hosting:** Vercel (Hobby / free tier)
**Storage:** User's Google Drive (per-user folder) — *only*
**AI:** BYOK chooser — Anthropic Claude / OpenAI / Google Gemini
**Multi-user:** Yes, from day one
**Project-owned state:** None. Everything lives in the user's Drive or in their own Claude/Telegram account.
**Plan status:** v3 — all earlier questions answered. One small confirm in §11. Otherwise ready to start Phase 1 on your word.

---

## 1. Product vision

AtomicTracker is a mobile-friendly PWA where a user signs in with Google, grants Drive + Calendar access, plugs in their own AI provider key (guided by a wizard), and sets up "trackers." The first tracker is a **Weekly Meal Planner**.

Two user-initiated weekly moments drive the app:

- **Friday evening** — user gets a Calendar reminder titled *"Plan next week's meals."* They tap; the PWA opens, generates next week's plan with cuisines, ingredients, frequency rules, history, health conditions, and diet category in mind. The plan includes calories, macros, ingredients, and a YouTube recipe link per meal. The user iterates in chat, locks favorites, swaps meals, accepts.
- **Sunday evening** — user gets a Calendar reminder titled *"What did you prep this week?"* They tap; the PWA asks what was actually prepared, and creates breakfast/lunch/dinner events on the user's Calendar for the week ahead.

Acceptance produces (a) the next-week plan written to Drive, (b) a grocery shopping list as a CSV in Drive *with online product links* (Walmart/Amazon/DoorDash search URLs per item — Phase 3 upgrades to deep-linked carts), (c) a Calendar event for the shopping run, (d) a Telegram nudge if connected. The same flow is reachable through a Telegram bot, and — for users who self-host **OpenClaw** — through WhatsApp, Discord, Slack, or Signal as well. The architecture is generic enough that more trackers (workouts, finance, habits) can be added later. A Settings page lets the user export everything (Drive folder as a zip) at any time. The whole project is open source under MIT and runs on Vercel's free tier; no custom domain, no paid services.

---

## 2. Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────┐
│              Browser / PWA / Telegram / Claude Routine           │
└────────┬──────────────────┬─────────────────────┬───────────────┘
         │                  │                     │
         │ HTTPS            │ Bot webhook         │ POST /api/dispatch
         ▼                  ▼                     ▼
┌──────────────────────────────────────────────────────────────────┐
│         Next.js on Vercel (App Router + API routes)              │
│   No KV, no DB, no project-owned state. Stateless functions.     │
└────────┬──────────────────────────────────────┬─────────────────┘
         │                                      │
         ▼                                      ▼
   ┌──────────────────┐                ┌────────────────────┐
   │ User's Google    │                │  AI provider APIs  │
   │ Drive + Calendar │                │ Claude / OpenAI /  │
   │ (source of truth)│                │ Gemini             │
   └──────────────────┘                │ Telegram Bot API   │
                                       │ YouTube Data API   │
                                       └────────────────────┘

Triggers (all user-controlled, zero project state):
  ① Google Calendar reminder → notification → user taps → PWA runs        (default, everyone)
  ② OpenClaw self-hosted agent (free, open source) → POST /api/dispatch    (power users)
  ③ Claude Code Routine (paid Claude plan)        → POST /api/dispatch    (paid Claude users)
  ④ Telegram bot message from user → bot webhook → action                  (Telegram users)
```

There is no project-side cron, no KV, no database. The Next.js app on Vercel is a *stateless function host*. Everything persistent lives in the user's Drive. The "Friday 6pm cron" is replaced by a recurring **Calendar event with a phone notification** that the user owns.

---

## 3. Tech choices and why

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | Mobile-friendly, PWA-ready, API routes for OAuth callbacks and webhooks, first-class on Vercel |
| Styling | Tailwind CSS | Mobile-first by default, small bundle |
| Auth | NextAuth (Auth.js) v5 with Google provider | Standard OAuth flow, refresh-token in encrypted session cookie (no server store) |
| State | React Server Components + minimal Zustand client store | Most reads come from Drive via server actions |
| AI SDKs | `@anthropic-ai/sdk`, `openai`, `@google/generative-ai` | Official, well-maintained |
| Storage | Google Drive Files API (`drive.file` scope, named folder) | User owns the data, free, fits the brief |
| Calendar | Google Calendar API (`calendar.events`) | Required by brief; *also our scheduler* (§8) |
| Recipe links | YouTube Data API v3 (free quota: 10k units/day, plenty) | Surface a recipe video per meal |
| Encryption | WebCrypto AES-GCM, key derived via PBKDF2 from session passphrase | Server never sees plaintext |
| Scheduling | **Calendar reminders** (default) + **OpenClaw** (free, self-hosted) + **Claude Code Routines** (paid Claude users) + **Telegram** (optional) | All user-controlled. No project cron. See §8. |
| Messaging | Telegram Bot API natively; **WhatsApp/Discord/Slack/Signal via OpenClaw** if user runs it | Free, no Meta approval needed because OpenClaw bridges via the user's own device |
| License | MIT | Open source per your direction |
| Domain | `atomictracker.vercel.app` (Vercel default) | No custom domain, no recurring cost |
| PWA | `next-pwa` | Installable on iOS/Android home screen |
| Project-owned KV/DB | **None** | Per your direction. Trade-off documented in §10. |

---

## 4. Drive folder layout (per user)

```
/AtomicTracker/                          ← root, user-visible
  /config/
    user.json                            ← prefs, tz, locale
    connectors.enc.json                  ← AES-GCM-encrypted: { ai: {...}, telegram: {...}, walmart: {...} }
    tracker.meal-planner.json            ← cuisines[], ingredients[], frequency, dietCategory,
                                            healthConditions[], allergies[], favoriteMeals[],
                                            favoriteIngredients[]
  /history/
    meals/
      2026-W18.json                      ← accepted plan, ISO-week-keyed
      2026-W18-prep.json                 ← Sunday "what I actually prepped" answer
    chats/
      2026-04-28T14-22.json              ← chat transcripts (opt-in)
  /grocery/
    2026-W18-list.csv                    ← weekly shopping list, CSV — easy to view/edit
    2026-W18-list.json                   ← machine-readable mirror
  /archive/
    2026.xlsx                            ← yearly archive, multi-sheet workbook
                                            sheets: Groceries | Meals | Prep | Orders | Chats
    2025.xlsx                            ← prior years (created when first week of new year accepted)
  /exports/
    atomictracker-export-2026-04-28.zip  ← user-triggered "Download my data" exports
  /logs/
    runs.log                             ← last 50 generation runs (debug)
```

JSON for nested data (the live weekly plan); CSV for the live weekly grocery list (opens directly in Sheets/Excel); **XLSX for the yearly archive** because you asked for "one csv per year, multiple sheets if needed" — multi-sheet means a workbook, so we use XLSX (still openable by Sheets, Excel, LibreOffice).

Weekly CSV columns:
`week, day_added, item, qty, unit, category, walmart_url, amazon_url, doordash_url, recipe_link, status, purchased_at`

Yearly XLSX sheets:
- **Groceries** — every item across all weeks (≈1,500 rows/year)
- **Meals** — every accepted meal (≈365 rows/year)
- **Prep** — Sunday check-in answers
- **Orders** — Phase 3 click-throughs
- **Chats** — opt-in chat history

The yearly archive is built/refreshed when the user opens the app in a new year, OR when they tap "Rebuild archive" in Settings.

---

## 5. Authentication and key handling

### 5.1 Google login (the only OAuth we *operate*)
- NextAuth Google provider with scopes:
  - `openid email profile`
  - `https://www.googleapis.com/auth/drive.file` (least-privilege; only files we create)
  - `https://www.googleapis.com/auth/calendar.events` (only events we create)
- Refresh token lives in an **encrypted httpOnly session cookie** (NextAuth's JWT strategy). The Vercel function decrypts on each request using a server-side `NEXTAUTH_SECRET`. **No server-side token store, no KV.**
- Trade-off: when the cookie expires (~30 days), the user re-authenticates with one tap. Fine.

### 5.2 Connector keys (Claude / OpenAI / Gemini / Telegram bot / YouTube / etc.)
- Stored encrypted in **the user's own Drive** at `/config/connectors.enc.json`.
- Encryption: AES-GCM, key derived via PBKDF2(passphrase + Google `sub`).
- Passphrase is set on first connector setup; cached in the browser's IndexedDB (never sent to server) and re-prompted if cleared.
- **Server never sees plaintext keys** — connector calls happen either client-side (where the key is decrypted in the browser) or server-side using a key the browser sends in the request body, used in-memory and discarded.
- For automated triggers (Claude Routines, Telegram), see §8.3 — we use a separate **pre-derived dispatch token** the user generates and configures in the trigger.

### 5.3 Guided key-onboarding wizard
When a user picks a connector, the wizard walks them through getting the key:

| Connector | Wizard steps |
|---|---|
| Anthropic Claude | "Open console.anthropic.com → API Keys → Create Key → paste here." Includes a screenshot. |
| OpenAI | "Open platform.openai.com/api-keys → Create new secret key → paste here." |
| Google Gemini | "Open aistudio.google.com → Get API key → paste here." (Free tier mentioned.) |
| Telegram | "DM @BotFather on Telegram → /newbot → follow prompts → paste the token here. Then send /start to your new bot." |
| YouTube Data API | "Already covered by your Google login if you enable the API in Cloud Console — we'll show you the link." |
| Walmart / Amazon (Phase 3) | Affiliate-API onboarding flow with link to register. |

Each wizard step has a "Test it" button that makes one cheap call to validate before saving.

### 5.4 Future ordering connectors
- **No public consumer-ordering APIs** for DoorDash/Walmart/Amazon. We do **product-search + deep-linked cart URLs**:
  - Phase 1: search URLs for each item (e.g. `walmart.com/search?q=tomato+1lb`) — the CSV column `walmart_url` is filled.
  - Phase 3: affiliate APIs (Walmart Open API, Amazon PA-API) for product disambiguation; for DoorDash, list nearby stores via DashMart and prefill cart deep links.
- **All "ordering" is user-confirmed in the merchant's app.** We never place an order, never store payment info.

---

## 6. Phased delivery

### Phase 1 — MVP (target: usable end-to-end without leaving Drive)
1. Project scaffold (Next.js + Tailwind + TS + PWA), Vercel deploy, GitHub repo `AWANSARI/atomicTracker`.
2. NextAuth Google login with Drive + Calendar scopes. JWT session cookie strategy, no KV.
3. Drive folder bootstrap, settings page, encryption passphrase setup.
4. Guided connector wizard: AI provider (Claude/OpenAI/Gemini chooser), Telegram (optional), YouTube (optional).
5. Tracker picker (single option: Weekly Meal Planner).
6. Meal-planner config wizard:
   - Step 1: **Diet category** (multi-select — these can overlap, e.g. Halal + Low-carb):
     - Vegetarian, Non-vegetarian, Vegan, Pescatarian
     - Halal, Kosher
     - Keto / Low-carb, Paleo, Mediterranean, Whole30
     - Gluten-free, Dairy-free, Nut-free
     - Low-sodium, High-protein, Diabetic-friendly
     - Custom (free text)
   - Step 2: **Health conditions** — Thyroid (Hypo/Hyper) / Diabetes (Type 1/2) / Hypertension / High cholesterol / PCOS / IBS / GERD / Kidney issues / Anemia / Other (free text). Multi-select.
   - Step 3: **Allergies** — common chips (peanuts, tree nuts, shellfish, eggs, soy, wheat, fish, sesame) + free text
   - Step 4: **Cuisines** (chip multiselect + custom)
   - Step 5: **Ingredients** (suggested by cuisine + custom)
   - Step 6: **Repeat frequency** (slider 1–7)
   - Step 7: **Mealtime defaults** — breakfast, lunch, dinner times (used by Sunday prep flow). Default 8am/12:30pm/7pm.
   - Step 8: **Review + Save**
7. Plan generation flow ("Generate next week" button on tracker home).
8. Plan review UI: per-meal swap, lock favorite, ingredient add/remove, regenerate. Each meal shows YouTube recipe link.
9. Acceptance flow:
   - Write plan to `/history/meals/{week}.json`
   - Write grocery CSV to `/grocery/{week}-list.csv` with Walmart/Amazon/DoorDash search URLs
   - Append to `/grocery/history.csv`
   - Create Calendar event "Grocery run for week of {date}" with grocery items in description
   - Create recurring Calendar reminders: Friday 6pm "Plan next week's meals" (deep link `/plan-now`) and Sunday 6pm "What did you prep this week?" (deep link `/prep-checkin`) — set once, repeats indefinitely
10. **Sunday prep check-in** flow: lists planned meals, user marks which ones are prepped/cooked, app creates **three Calendar events per day** (breakfast/lunch/dinner) at the user's configured mealtimes for the coming week, using prepped items and leftovers.
11. Chat interface with the user-selected AI: answers about config, history, upcoming plan; can suggest meals on demand.
12. PWA manifest + service worker + iOS/Android home-screen install prompt.
13. **Data export**: Settings → "Download all my data" → server zips the entire `/AtomicTracker/` Drive folder and streams it to the user (skipping `/exports/` itself). Also writes a copy to `/exports/atomictracker-export-{date}.zip` so it's available next time without rebuilding.
14. **Yearly archive job**: on first app-open of a new year, rebuild the previous year's XLSX from JSON/CSV history and store at `/archive/{year}.xlsx`.

### Phase 2 — Auto-triggers + messaging parity (free options first)
1. **OpenClaw setup wizard** — `npm i -g openclaw` instructions + Test button; we register Friday/Sunday recurring tasks via OpenClaw's local API; user picks which messaging bridge (WhatsApp/Telegram/Discord/Slack/Signal) gets nudges. **Recommended for technical users — free and open source.**
2. **Claude Routine setup wizard** (alternative for users on paid Claude plans) — generates routine config + bearer token + schedule; one-click install.
3. **Telegram bot full parity** — pair via Settings; mirror chat UI; accept/swap meals from chat; receive nudges + grocery list. (For users who don't want OpenClaw.)
4. **Favorite ingredients / favorite meals** as first-class entities with "Hold this meal, regenerate the rest."

### Phase 3 — Real cart deep-links + ordering polish
1. Walmart Open API → product disambiguation → deep-link cart.
2. Amazon PA-API → deep-link cart.
3. DoorDash DashMart → list nearby grocery stores → deep-link cart.
4. Disclaimer UI: "We open your cart with these items pre-added. You confirm and pay in their app."
5. Order history: append to `/history/orders.csv` whenever the user confirms a click-through.

### Phase 4 — More trackers + multi-user polish
1. Refactor tracker logic into a `Tracker` interface (config schema, generation prompt, review UI).
2. Add a second tracker (e.g. workout planner) to validate the abstraction.
3. WhatsApp Business API (only if you want to invest in Meta approval).

---

## 7. Phase 1 screens (mobile-first)

1. **Landing** — "Sign in with Google" CTA, one-line explainer.
2. **Permission steps** — three cards, each a button: Drive, Calendar, AI provider. Each card flips to "✓ Connected."
3. **Connector wizard** (per provider — see §5.3).
4. **Trackers** — empty state with "Add a tracker" → bottom sheet. Today: "Weekly Meal Planner."
5. **Meal planner config** — 7-step wizard (see Phase 1 step 6 above).
6. **Tracker home** — current week's plan card, "Generate next week" button, chat link, settings link, "Set reminders" toggle (on by default).
7. **Plan review** — 7-day grid (or list on mobile). Each meal row: name, calories, macros (collapsed), YouTube recipe link, swap, lock, expand for ingredients.
8. **Grocery summary + accept** — CSV preview grouped by category, "Accept and save" CTA. Each item shows three small icons: Walmart / Amazon / DoorDash search links.
9. **Sunday prep check-in** — list of last-week's planned meals; user taps "✓ prepped" / "✗ skipped" / "♻ leftovers"; reviews proposed breakfast/lunch/dinner schedule for the coming week; confirms → events go to Calendar.
10. **Chat** — bottom-sheet on mobile, right-rail on desktop. Streams from selected AI with system prompt that includes config + recent history + upcoming plan.
11. **Settings** — connectors, encryption passphrase rotation, reminder toggles, mealtime defaults (breakfast/lunch/dinner times), Claude Routine setup (Phase 2), OpenClaw setup (Phase 2), data export ("Download all my data"), sign out, delete-everything.

---

## 8. Scheduling — three triggers, all user-controlled

We replace the cron with three layered triggers. None of them require project-owned state.

### 8.1 Default for everyone — Calendar reminder + tap
On acceptance, we create two **recurring** Calendar events on the user's calendar:
- **Friday 6pm (user's tz):** *"Plan next week's meals — tap to open."* Description contains the deep link `https://atomictracker.app/plan-now`.
- **Sunday 6pm (user's tz):** *"What did you prep this week?"* Deep link `/prep-checkin`.

The user's phone fires the notification at the right time — Calendar handles the timezone, recurrence, and notification delivery for free. The user taps. The PWA opens. Everything happens in their session. **Zero project state.**

Trade-off: no plan exists until the user taps. Mitigation: notification text says "Tap to generate" so it's a one-tap action.

### 8.2 Power users — Claude Code Routine (paid Claude plans)
For users who want true background generation, we offer a **one-click Claude Routine setup**:
1. Settings → "Set up Claude Routine."
2. We generate a routine config (prompt + Friday/Sunday schedule + API trigger).
3. User pastes our generated bearer token + schedule into their Claude account.
4. Claude fires the routine on schedule from Anthropic's infrastructure; the routine POSTs to our `/api/dispatch/[userToken]`.
5. Our endpoint receives the token, looks up *nothing project-side* — the token itself encodes a Drive folder ID + an encrypted refresh token; we decrypt with a server-side master key and act on behalf of the user.
6. Plan lands in Drive; Telegram nudge if connected.

Eligibility: paid Claude plans (Pro 5 runs/day, Max 15/day, Team/Enterprise 25/day) — we use 2/week, well within free quota.

### 8.3 Telegram users — bot-driven
Once the user pairs Telegram, the bot can take any chat command (`/plan`, `/prep`, `/swap monday`, `/grocery`). The user can use a third-party scheduler bot (e.g. `@reminderbot`) to send `/plan` to AtomicTracker's bot every Friday — the bot becomes the trigger. We can also document a one-click setup for this.

### 8.4 OpenClaw — recommended power-user trigger (free, open source, self-hosted)

I checked openclaw.ai. **OpenClaw is a much better fit than I had in v2.** It's an open-source personal AI agent gateway — a single Node.js process the user runs on their own machine (defaults to `127.0.0.1:18789`) that bridges WhatsApp, Telegram, Discord, Slack, and Signal, manages calendars/email, and runs recurring tasks. It's free, MIT-licensed, and gives us three things at once:

1. **Cron without project state.** The user adds a recurring task to OpenClaw: "Friday 6pm local, POST to atomictracker.vercel.app/api/dispatch with my token." OpenClaw fires it locally; we get the dispatch.
2. **WhatsApp/Discord/Slack/Signal for free.** OpenClaw bridges via the user's own logged-in accounts on their device — no Meta approval, no business APIs, no per-message cost. Our bot logic talks to OpenClaw on the local Gateway port, OpenClaw talks to the messaging app. The user gets meal-plan nudges on whichever platform they prefer.
3. **Local-first AI.** If the user has Claude/GPT/Gemini keys configured in OpenClaw, our `/api/dispatch` can delegate the *generation* itself to the user's local agent — keys never leave their device.

**Trade-off:** the user has to install and run OpenClaw locally (one `npm install`, then keep it running). For non-technical users, the Calendar-reminder default still works without any of this. For technical users who care, OpenClaw is the recommended Phase 2 upgrade *over* Claude Routines because it's free and not paywalled.

Phase 2 setup wizard:
1. Settings → "Connect OpenClaw."
2. We show: "Make sure OpenClaw is running on this device. Click Test."
3. The browser hits `http://127.0.0.1:18789/...` to verify. (Localhost-only, never crosses network.)
4. We register a recurring task in OpenClaw via its local API: `Friday 18:00 → POST atomictracker.vercel.app/api/dispatch/{userToken}`.
5. Same for Sunday prep check-in.
6. Optionally: pair messaging — pick which OpenClaw-bridged platform (WhatsApp, Discord, etc.) should get nudges and accept commands.

**Order of preference for power users:** OpenClaw (free, open source, multi-platform) > Claude Routines (cloud, paid Claude plan) > self-rolled scheduling.

### 8.5 What we don't pursue
- Generic "ClaudeBot" hosted service — doesn't exist as a turnkey product separate from OpenClaw / Claude Routines.
- Claude Agent SDK self-host — superseded by OpenClaw, which already wraps similar functionality.

---

## 9. AI prompt design (high level)

System prompt skeleton, populated per call. Now includes diet, health, recipe-link guidance:

```
You are a meal-planning assistant. Generate exactly 7 dinner meals for {weekStart}–{weekEnd}.

User profile:
  Diet category: {dietCategory}        ← vegetarian | non-vegetarian | vegan | custom
  Health conditions: {healthConditions}  ← e.g. ["diabetes", "hypothyroid"] — adjust sodium, glycemic load, iodine
  Allergies: {allergies}
  Cuisines: {cuisines}
  Allowed ingredients: {ingredients}
  Max repeats per dish per week: {frequency}
  Favorite meals (must include if possible): {favoriteMeals}

History (last 4 weeks, do NOT repeat consecutively): {historySummary}

For each meal, also produce a YouTube search query that will surface a good recipe video.
We will run that query through the YouTube Data API; the top result becomes recipe_link.

Return JSON matching this schema (no prose outside JSON):
{
  "meals": [
    {
      "day": "Mon",
      "name": "...",
      "cuisine": "...",
      "calories": 0,
      "macros": { "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0 },
      "health_notes": "Low sodium; diabetic-friendly carbs",
      "ingredients": [ { "name": "...", "qty": "...", "unit": "..." } ],
      "instructions": "...",
      "youtube_query": "vegan thai green curry recipe authentic"
    }
  ]
}
```

Provider-specific structured output:
- Claude: tool-use schema enforcement
- OpenAI: JSON mode + Pydantic-style validation
- Gemini: `responseSchema`

Post-processing: hit YouTube Data API for each `youtube_query`, take top result, attach `recipe_link` and `recipe_title`.

---

## 10. Risks and unknowns

1. **No project state means no truly background generation for free users.** They get a Calendar notification and tap. If they don't tap, no plan. Acceptable per your direction; Phase 2's Claude Routines fill the gap for power users.
2. **Encrypted refresh-token in cookie expires every ~30 days.** User re-signs-in. One tap. Acceptable.
3. **Claude Code Routines are in research preview (April 2026).** Schema may change. We keep our `/api/dispatch` contract stable; the routine config is what changes if Anthropic iterates.
4. **Claude Routines require a paid Claude plan.** Free users get the Calendar-tap path only.
5. **Ordering connectors are not "place an order."** They're search URLs (Phase 1) and deep-linked carts (Phase 3). Users confirm and pay in the merchant's app. The brief originally implied automated ordering; this plan reflects what's actually possible.
6. **Drive `drive.file` scope** can't see files the app didn't create. If the user manually edits/deletes our files, we re-create defaults on next open.
7. **PWA push on iOS** is limited to iOS 16.4+ for non-Calendar pushes. Calendar reminders work on every iOS — good thing we're using them.
8. **YouTube API quota** — 10k units/day free. Each search ≈ 100 units. We can do 100 plans/day across all users before hitting the cap. Fine for now. Could cache by `youtube_query` in Drive to reduce calls.
9. **History grows unboundedly.** We archive each prior year into `/archive/{year}.xlsx` (multi-sheet workbook) on first app-open of a new year. Live `/grocery/{week}-list.csv` files older than 12 weeks are deleted (the data is preserved in the yearly archive).
10. **OpenClaw requires the user's machine to be running** when the scheduled task fires. If the user's laptop is asleep on Friday 6pm, the task fires next time OpenClaw wakes (it has catch-up logic). Documented in the OpenClaw setup wizard.
11. **Vercel serverless function timeout (10s on Hobby, 60s on Pro free)**. Plan generation against Claude can take 5-15s. We stream the AI response to the client and finalize Drive writes asynchronously to stay under the limit. If we hit the 10s ceiling reliably, we move to Vercel Pro free tier (still $0).

---

## 11. Decisions — all resolved

- ✅ Encryption model: **(c)** per-user service key, stored in the user's Drive (not project KV).
- ✅ Project-owned dependency: **None.** Triggers are Calendar reminders (default), OpenClaw (free, self-hosted), Claude Routines (paid Claude), Telegram.
- ✅ Ordering deferred to Phase 3 with deep-link carts.
- ✅ Messaging Phase 1: Telegram. Phase 2 adds WhatsApp/Discord/Slack/Signal *free* via OpenClaw bridge.
- ✅ Repo: `AWANSARI/atomicTracker`.
- ✅ CSV grocery list with online product links per item.
- ✅ History: one **XLSX per year, multi-sheet** workbook (Groceries / Meals / Prep / Orders / Chats).
- ✅ YouTube recipe links per meal.
- ✅ Guided connector wizard with per-provider key-acquisition steps.
- ✅ Diet category expanded to multi-select (Vegetarian, Non-veg, Vegan, Pescatarian, Halal, Kosher, Keto, Paleo, Mediterranean, Whole30, GF, DF, Nut-free, Low-sodium, High-protein, Diabetic-friendly, Custom).
- ✅ Health conditions: Thyroid (Hypo/Hyper), Diabetes (T1/T2), Hypertension, High cholesterol, PCOS, IBS, GERD, Kidney issues, Anemia, Other.
- ✅ Sunday prep check-in → **three events per day** (breakfast/lunch/dinner) with mealtime defaults (8am / 12:30pm / 7pm) editable in Settings.
- ✅ Reminder times: **Friday 6pm + Sunday 6pm**, user's local tz.
- ✅ Domain: `atomictracker.vercel.app` (no custom domain, no recurring cost).
- ✅ License: MIT, public repo.
- ✅ "Download all my data" export in Settings.
- ✅ OpenClaw integration is the recommended Phase 2 trigger.

**One last confirm before I scaffold:**
- [ ] Does your GitHub account `AWANSARI` already have the `atomicTracker` repo created (empty), or should the first thing I do be to create it via `gh` / the GitHub MCP? Either is fine — I just need to know whether to push to existing or create-then-push. -create a new one

---

## 12. First five commits (once you accept v2)

1. `chore: scaffold next.js + tailwind + typescript + pwa, deploy to vercel, repo AWANSARI/atomicTracker`
2. `feat: nextauth google login with drive.file + calendar.events scopes (jwt session, no kv)`
3. `feat: drive folder bootstrap + settings page + encryption passphrase`
4. `feat: connector wizard for claude/openai/gemini/telegram with key-acquisition guidance`
5. `feat: tracker picker + meal-planner config wizard (diet, health, allergies, cuisines, ingredients, frequency)`

After these five we have a deployed-and-signed-in shell with config; subsequent commits add generation, review, acceptance, calendar reminders, prep check-in, and chat.

---

## Sources

- [OpenClaw — Personal AI Assistant](https://openclaw.ai/)
- [openclaw/openclaw on GitHub](https://github.com/openclaw/openclaw)
- [What Is OpenClaw? The Open-Source AI Agent That Actually Does Things — MindStudio](https://www.mindstudio.ai/blog/what-is-openclaw-ai-agent)
- [Schedule tasks on the web — Claude Code Docs](https://code.claude.com/docs/en/web-scheduled-tasks)
- [Claude Code Scheduled Tasks: Complete Setup Guide (2026)](https://claudefa.st/blog/guide/development/scheduled-tasks)
- [Claude Code Adds Cloud Routines for Scheduled AI Tasks](https://winbuzzer.com/2026/04/16/anthropic-claude-code-routines-scheduled-ai-automation-xcxwbn/)
- [Push notifications | Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/push)
