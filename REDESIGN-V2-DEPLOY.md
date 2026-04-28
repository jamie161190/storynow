# Redesign v2 — Deploy checklist

This branch (`redesign-paid-v1`) is the full paid redesign per the handoff.
Old `/story/[id]` URLs continue to render the original `story.html` for
existing 40+ free customers — they are not migrated.

## Before merging to main

### 1. Environment variables (set in Netlify)

```bash
AUTH_SECRET=<generate 32+ random chars>     # for HMAC session cookies
STRIPE_WEBHOOK_SECRET_PAID=<from Stripe>    # webhook signing secret for /api/stripe-webhook-paid
PUBLIC_APP_URL=https://heartheirname.com    # used for absolute links in emails
ADMIN_EMAIL=jamie@heartheirname.com         # where re-record / refund alerts land
```

Existing env vars assumed present:
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`
- `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`

Optional:
- `POSTHOG_KEY` + edit `<meta name="posthog-key">` in pages
- `SENTRY_DSN` + edit `<meta name="sentry-dsn">` in pages
- `OPENAI_API_KEY` for `tools/generate-brand-images.mjs`

### 2. Stripe webhook

In Stripe dashboard, add a new webhook endpoint:
- URL: `https://heartheirname.com/api/stripe-webhook-paid`
- Events: `checkout.session.completed`, `charge.refunded`
- Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET_PAID` in Netlify

### 3. Database migration

Already applied to production Supabase. (`paid_redesign_v2_columns` migration.)

### 4. Brand images

Currently placeholders (striped boxes) where editorial photos should go.
Run `OPENAI_API_KEY=sk-... node tools/generate-brand-images.mjs` to generate
6 stand-in images, or commission real photos. Then replace the
`.inside-img` / `.gift-img` / `.founder-img` placeholders in `index.html`
with `<img src="/images/brand/...">`.

## What ships

### New customer-facing routes
- `/` — new landing page
- `/start` — 8-step funnel + email + confirm-inbox + ordered
- `/verify?token=...&id=...` — magic-link verify, sets cookie, queues preview generation
- `/preview/[id]?t=...` — preview-listen page with £24.99 unlock CTA
- `/listen/[id]?t=...` — paid full-story player
- `/login` — magic-link sign-in
- `/account` — MyStories grid
- `/account/story/[id]/re-record?t=...` — re-record request form (free, no quota)
- `/account/story/[id]/refund?t=...` — refund request form (14-day window, auto-issues Stripe refund)

### Preserved (untouched)
- `/story/[id]` → `story.html` — old player for the 40+ existing free customers
- `/admin*`, `/api/admin-*`, etc — admin queue is unchanged

### New API functions
- `POST /api/preview-request` — funnel submission
- `GET  /api/verify` — magic-link verify
- `POST /api/resend-verify`
- `GET  /api/preview-meta` — status polling for preview-listen page
- `POST /api/checkout-paid` — Stripe £24.99 session (auto-applies £5 returning-customer discount)
- `POST /api/stripe-webhook-paid` — Stripe webhook
- `POST /api/account/login` — request magic link
- `GET  /api/account/verify` — consume magic link, set cookie
- `GET  /api/account/me` — list signed-in user's stories
- `POST /api/account/logout`
- `POST /api/rerecord-request`
- `POST /api/refund-request`
- `GET  /api/weekly-count` — for scarcity badge on homepage

### New background workers
- `preview-worker-background` — runs the v2 preview pipeline (existing brief-analyst → Claude ~290 words → ElevenLabs eleven_v3 → Supabase Storage → preview-ready email)
- `full-worker-v2-background` — runs the v2 full-story pipeline (~1700-2200 words depending on oldest child age)

Both reuse the existing `lib/brief-analyst.mjs`, `lib/middle-layer-prompt.mjs`,
`lib/story-prompts.mjs`. The new funnel's `storyData` shape is mapped to the
v1 shape via `lib/v2-to-v1.mjs` before going through the pipeline. Production
generation flow is unchanged.

## Cutover

Merge `redesign-paid-v1` → `main`. New homepage goes live atomically.
First test order: `/start` → fill funnel → check inbox for verify email
→ click → wait for preview-ready email → listen → click "Order full story"
→ Stripe test card `4242 4242 4242 4242` → wait for story-ready email
→ listen on `/listen/[id]`.
