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

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new), import `AWANSARI/atomicTracker`.
3. Click **Deploy**. Default settings work.
4. Once deployed, set environment variables in Vercel project settings (added in commit 2):
   - `NEXTAUTH_SECRET` — `openssl rand -base64 32`
   - `NEXTAUTH_URL` — `https://atomictracker.vercel.app` (or your Vercel-assigned URL)
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

## Project structure

```
app/                     ← Next.js App Router pages and routes
  layout.tsx             ← root layout, PWA metadata
  page.tsx               ← landing page
  globals.css            ← Tailwind base
public/                  ← static assets
  manifest.json          ← PWA manifest
  icon-*.svg             ← app icons
PLAN.md                  ← full design plan and decisions log
```

Future commits add:

```
app/(auth)/              ← sign-in flow
app/api/                 ← OAuth callbacks, dispatch endpoints
app/dashboard/           ← tracker home, plan review, chat
lib/drive/               ← Google Drive client
lib/calendar/            ← Google Calendar client
lib/ai/                  ← provider chooser (Claude / OpenAI / Gemini)
lib/crypto/              ← WebCrypto encrypt/decrypt
components/              ← shared UI primitives
```

## License

[MIT](./LICENSE) — use it, fork it, host your own.

## Acknowledgements

- [OpenClaw](https://openclaw.ai/) — the open-source agent gateway that powers Phase 2 multi-platform messaging.
- [Anthropic](https://www.anthropic.com/), [OpenAI](https://openai.com/), [Google AI](https://ai.google.dev/) — pick your champion.
