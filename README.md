# AtomicTracker

Mobile-first PWA for **weekly meal planning**, with Google Drive + Calendar + AI integrations.
Self-hosted, multi-user, **zero project-owned state** — everything lives in the user's own Drive.

> **Status:** Phase 1, commit 1 of 5 — scaffold only. Not yet wired to Google or any AI provider.
> See [`PLAN.md`](./PLAN.md) for the full roadmap.

## What it does (when complete)

1. Sign in with Google.
2. Grant Drive (`drive.file`) + Calendar (`calendar.events`) permissions — least-privilege.
3. Plug in your AI provider key (Claude / OpenAI / Gemini) via a guided wizard.
4. Configure cuisines, ingredients, repeat frequency, diet, health conditions, allergies.
5. Friday 6pm reminder → tap → AI generates next week's plan with calories, macros, and a YouTube recipe link per meal.
6. Iterate in chat, swap meals, lock favorites, accept.
7. Grocery list lands as CSV in your Drive (with Walmart/Amazon/DoorDash search URLs per item).
8. Sunday 6pm reminder → mark what you prepped → breakfast/lunch/dinner events go on your Calendar.

Optional power-user upgrades (Phase 2):
- **OpenClaw** (free, open source) — self-hosted agent that runs the Friday/Sunday triggers locally and bridges WhatsApp/Discord/Slack/Signal.
- **Claude Code Routines** (paid Claude plan) — cloud-side scheduling.

## Why no project state?

The brief was: free hosting, free to manage, multi-user from day one. The cleanest way to multi-user without hosting fees is to make the user's own Drive the source of truth. AtomicTracker on Vercel is a stateless function host. Nothing about you lives on our servers — not your data, not your refresh tokens (encrypted in your session cookie only), not your AI keys (encrypted in your Drive only).

## Tech stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- `next-pwa` for installable PWA
- NextAuth (Auth.js) v5 — Google provider, JWT session strategy (no DB)
- WebCrypto AES-GCM for at-rest encryption of connector keys
- Anthropic / OpenAI / Google AI SDKs (BYOK)
- Google Drive Files API + Calendar API + YouTube Data API v3

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run build       # production build
```

## Deploy to Vercel (free)

The deployed app is live at **https://atomictracker.vercel.app**.

### First-time deploy

1. Go to [vercel.com/new](https://vercel.com/new), import `AWANSARI/atomicTracker`.
2. Click **Deploy** — defaults are fine, Vercel auto-detects Next.js.

### Environment variables (required as of commit 2)

In Vercel → Project → **Settings → Environment Variables**, add the four below for **Production, Preview, and Development**:

| Variable | Value |
|---|---|
| `AUTH_SECRET` | run `openssl rand -base64 32` and paste the output |
| `AUTH_GOOGLE_ID` | Google OAuth client ID — see below |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret — see below |
| `AUTH_URL` *(optional)* | `https://atomictracker.vercel.app` — only needed if Vercel doesn't auto-detect |

After adding env vars, **redeploy** so they take effect (Deployments → "..." → Redeploy on the latest commit).

## Google OAuth setup (~5 minutes)

We need a Google OAuth client so users can sign in with their Google account and grant Drive + Calendar permissions.

### 1. Create a Google Cloud project

1. Open [console.cloud.google.com](https://console.cloud.google.com/) → top-bar project picker → **New Project**.
2. Name it `AtomicTracker`. Create.

### 2. Enable the APIs we'll call

Open [APIs & Services → Library](https://console.cloud.google.com/apis/library) and enable:
- **Google Drive API**
- **Google Calendar API**
- **YouTube Data API v3** (used in commit 5 for recipe links)

### 3. Configure the OAuth consent screen

1. [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
2. User type: **External**. Create.
3. Fill **App information**:
   - App name: `AtomicTracker`
   - User support email: your email
   - Developer contact: your email
4. **Scopes** step — click *Add or remove scopes* and select:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
   - `.../auth/drive.file`
   - `.../auth/calendar.events`
5. **Test users** — add your own email (and any others who'll test) until the app is verified.
6. Save.

### 4. Create the OAuth client

1. [APIs & Services → Credentials → Create Credentials → OAuth client ID](https://console.cloud.google.com/apis/credentials).
2. Application type: **Web application**.
3. Name: `AtomicTracker Web`.
4. **Authorized redirect URIs** — add **both**:
   - `https://atomictracker.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` *(for local dev)*
5. Create.
6. Copy the **Client ID** → paste as `AUTH_GOOGLE_ID` in Vercel.
7. Copy the **Client secret** → paste as `AUTH_GOOGLE_SECRET` in Vercel.

### 5. Redeploy

Trigger a redeploy on Vercel (Deployments → "..." → Redeploy). Visit https://atomictracker.vercel.app — the Sign-in button should now actually sign you in.

### Local development with the same OAuth client

Create `.env.local` (gitignored) at the repo root:

```bash
cp .env.example .env.local
# fill in AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
```

Then `npm run dev` and open [localhost:3000](http://localhost:3000).

## Project structure

```
app/
  layout.tsx                       ← root layout, PWA metadata
  page.tsx                         ← landing — sign-in form action
  globals.css                      ← Tailwind base
  api/auth/[...nextauth]/route.ts  ← NextAuth handler
  auth-error/page.tsx              ← OAuth error fallback
  dashboard/
    layout.tsx                     ← server-side auth guard
    page.tsx                       ← logged-in landing
auth.ts                            ← NextAuth v5 config (Google + JWT + refresh)
types/next-auth.d.ts               ← module augmentation for token/session
public/                            ← icons, manifest, generated service worker
PLAN.md                            ← full design plan and decisions log
.env.example                       ← required environment variables
```

Future commits add:

```
lib/google/drive.ts               ← Drive client + folder bootstrap (commit 3)
lib/google/calendar.ts            ← Calendar client + recurring reminders (commit 5)
lib/crypto/index.ts               ← WebCrypto AES-GCM encrypt/decrypt (commit 3)
lib/ai/{anthropic,openai,gemini}.ts ← provider chooser (commit 4)
app/onboarding/                   ← connector wizard (commit 4)
app/tracker/meal-planner/         ← config wizard + plan review (commits 4–5)
components/                       ← shared UI primitives
```

## License

[MIT](./LICENSE) — use it, fork it, host your own.

## Acknowledgements

- [OpenClaw](https://openclaw.ai/) — the open-source agent gateway that powers Phase 2 multi-platform messaging.
- [Anthropic](https://www.anthropic.com/), [OpenAI](https://openai.com/), [Google AI](https://ai.google.dev/) — pick your champion.
