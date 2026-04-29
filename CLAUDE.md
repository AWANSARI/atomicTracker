# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev server on localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit (no test suite — type-check is the safety net)
```

Local dev requires a `.env.local` file (copy from `.env.example`) with `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`.

## Architecture

**Stateless function host.** The Next.js app on Vercel owns no persistent state. Every user's data lives exclusively in their own Google Drive under `/AtomicTracker/`. The app is purely a function layer between the user's session and Google/AI provider APIs.

### Auth (`auth.ts`)
NextAuth v5 with Google provider, JWT session strategy (no DB). The session cookie carries encrypted Google access + refresh tokens. `auth()` is the only way to read the session — **never use `useSession()` from client components**; all auth checks happen server-side. The `jwt()` callback handles transparent token refresh with a 60s buffer.

Required OAuth scopes: `openid email profile drive.file calendar.events`.

### Encryption (`lib/crypto/webcrypto.ts`)
WebCrypto AES-GCM with PBKDF2-SHA256 key derivation (250k iterations). The key is derived from `passphrase + ":" + googleSub` — binding the key to both the user's chosen passphrase and their stable Google identity. The resulting `EncryptedEnvelope` (version, ciphertext, IV, salt — all base64) is what gets stored in Drive at `config/connectors.enc.json`. **The server never sees plaintext connector keys** — decryption happens client-side (via passphrase cached in IndexedDB) or the browser sends the plaintext key in the request body for one-shot server-side use.

Works in both browser and Node 20+ via `globalThis.crypto`.

### Google Drive (`lib/google/drive.ts`)
Minimal REST client hitting the Drive v3 API directly — **no `googleapis` package** (too large for Vercel cold starts). Marked `"server-only"`. Core primitives: `ensureFolder`, `findFile`, `upsertJson`, `upsertText`, `uploadBinary`. The folder structure is bootstrapped idempotently via `ensureAtomicTrackerLayout`; folder IDs are cached in `config/user.json` to avoid repeated list-then-create calls.

Drive scope is `drive.file` — the app can only see/touch files it created. If a user manually deletes the folder, the next call to `ensureAtomicTrackerLayout` recreates it silently.

### AI generation (`lib/ai/generate.ts`)
Marked `"server-only"`. Provider-agnostic entry points `generateJson` and `generateChatReply` dispatch to Anthropic/OpenAI/Gemini via direct `fetch` calls (no SDK). Current models: `claude-haiku-4-5-20251001`, `gpt-4o-mini`, `gemini-2.5-flash`. Responses are parsed with `parseJsonLoose` which strips markdown fences before `JSON.parse`. Provider metadata (chooser UI, key acquisition steps) lives in `lib/ai/providers.ts` — safe to import client-side; no secrets.

### Server actions pattern
All Drive and auth-guarded work uses Next.js Server Actions (`"use server"` at the top of `actions.ts` files). API routes (`app/api/`) exist for webhook-style calls (chat streaming, photo upload, export streaming). Auth is always checked via `auth()` at the top of every action/route.

### Drive folder layout
```
/AtomicTracker/
  config/           → user.json (folder IDs + prefs), connectors.enc.json (encrypted keys), tracker configs
  history/meals/    → {ISO-week}.json accepted plans
  history/chats/    → chat transcripts
  history/photos/   → meal photos
  grocery/          → {week}-list.csv (with Walmart/Amazon/DoorDash search URLs)
  archive/          → {year}.xlsx multi-sheet workbooks
  exports/          → user-triggered zip exports
  logs/             → generation run logs
```

## Key constraints

- **No project-side DB, KV, or cron.** Scheduling is done via Google Calendar recurring events the app creates in the user's calendar.
- **Vercel Hobby tier timeout is 10s.** AI generation streams to the client; Drive writes happen asynchronously after the response to stay under the limit.
- **`drive.file` scope only.** We cannot list or read files we didn't create.
- **No `googleapis` package.** Use the raw REST helpers in `lib/google/drive.ts` and `lib/google/calendar.ts`.
- The `next-pwa` service worker is generated at build time into `public/` — don't hand-edit files there.
