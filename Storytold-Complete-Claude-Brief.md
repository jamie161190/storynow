# Hear Their Name — Complete Project Brief

> Upload this document at the start of any Claude or ChatGPT session working on Hear Their Name. It covers the full product, tech stack, codebase, email flows, ad pipeline, and creative philosophy.

---

## 1. What Hear Their Name Is

**Hear Their Name** (heartheirname.com) is a personalised audio story product for children aged 2–14. Parents enter details about their child — name, age, best friend, pet, interests, family members — and AI writes a completely unique ~2,200-word story starring that child as the hero. The story is narrated by a professional-quality AI voice, producing a ~15-minute MP3.

**Price:** £19.99 per story (auto-converts to local currency for international visitors — see Section 11).
**Free preview:** ~60 seconds of narrated story before purchase.
**Tagline:** "A story that knows their name"
**Origin:** Jamie built it because his son Chase asked why he wasn't in any of his stories.
**Previous name:** Storytold / storytold.ai (rebranded April 2026 — old domain 301 redirects to heartheirname.com).
**Company:** JHCLH Ltd (Jamie Harish)
**Contact:** jamie@heartheirname.com

---

## 2. Story Categories

- **Bedtime** — Warm, calming, soothing. Journey home structure (NOT adventure). No danger, no villains. The story winds down until the child drifts off.
- **Adventure** — Action-packed with twists, humour, villain. 4 acts, 5–6 scenes, 2+ twists, 50%+ dialogue. Ticking clock, running gags, impossible choice at 60% mark.
- **Learning** — Education disguised as adventure. The subject IS the superpower. Interactive audio pauses ("Can you work it out? ... Take a moment. ... That's right!"). Confidence levels: starting/practising/nearly.

---

## 3. Customer Flow

1. Land on heartheirname.com → headline, sample audio with real Chase stories
2. "Start their story" → 7-step funnel:
   - Story type (bedtime/adventure/learning)
   - Gift or parent
   - Main character (name, age, gender, occasion, email)
   - People (best friend, family, pet, teacher, villain toggle)
   - Theme (dragons, space, underwater, robots, etc.)
   - Setting
   - Voice (22 narrator voices, filterable by gender/accent/age)
3. Free preview generated (~60 words, narrated)
4. Review screen → hear preview, option to regenerate
5. Stripe checkout → local currency price
6. Full story generated → 2,200 words, full narration
7. Delivered → playable in-browser, emailed, downloadable MP3
8. Gift flow → separate email to recipient
9. Sharing → public listen link with OG tags

**The preview IS the conversion mechanism.** Once parents hear their child's name in a story, the purchase becomes emotional.

---

## 4. Brand

- **Domain:** heartheirname.com
- **Email:** jamie@heartheirname.com (sent via Resend, forwarded to jamie@builtsmarter.co.uk via ImprovMX)
- **Colors:** Deep purple (#6B2F93), warm orange (#F1753B)
- **Fonts:** Nunito (headings), Quicksand (body)
- **Tone:** Warm, personal, magical but not childish. Speaks to parents. Never mentions AI.
- **Voice:** First person, conversational, emotional
- **Guarantee:** "Not magical enough? I'll rewrite it for free."

---

## 5. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Single-page vanilla HTML/CSS/JS on Netlify |
| Backend | 40+ Netlify serverless functions (ESM .mjs) |
| AI Text | Anthropic Claude (Sonnet for previews, Opus for full stories) |
| AI Voice | ElevenLabs v3 model, 22 voices |
| Payments | Stripe (hosted checkout, Adaptive Pricing enabled) |
| Database | Supabase (Postgres) |
| Storage | Supabase Storage (MP3s, assets, job results) |
| Email | Resend (transactional + abandoned cart) |
| Email Forwarding | ImprovMX (jamie@heartheirname.com → jamie@builtsmarter.co.uk) |
| Tracking | GA4 (G-84KXD5XPZG), Meta Pixel (1656775315345896), TikTok Pixel (D74JVVJC77U5P0Q29FKG), server-side CAPI + TikTok Events API |
| Deployment | GitHub → Netlify (auto-deploy on push to main) |
| Repo | github.com/jamie161190/storynow |
| Domain | heartheirname.com (GoDaddy DNS) |

---

## 6. Environment Variables (Netlify)

```
ANTHROPIC_API_KEY       — Claude text generation
ELEVENLABS_API_KEY      — TTS narration
STRIPE_SECRET_KEY       — Payment processing (sk_live_...)
STRIPE_WEBHOOK_SECRET   — Webhook signature verification (whsec_...)
RESEND_API_KEY          — Transactional email (re_...)
SUPABASE_URL            — Database + storage URL
SUPABASE_SECRET_KEY     — Database service role key
ADMIN_SECRET            — Studio + admin panel password
META_PIXEL_ID           — Meta Pixel ID (optional, has hardcoded fallback)
META_CAPI_TOKEN         — Meta Conversions API server-side token
TIKTOK_PIXEL_ID         — TikTok Pixel ID (optional, has hardcoded fallback)
TIKTOK_EVENTS_TOKEN     — TikTok Events API token
```

---

## 7. Codebase Structure

### Customer-Facing (DO NOT MODIFY without explicit instruction)
```
public/index.html              — Main site, funnel, checkout, story delivery, auth
public/privacy.html            — Privacy policy
public/terms.html              — Terms of service
public/dashboard.html          — Customer story library (login required)
public/referral.html           — Referral programme landing page
public/music/                  — adventure-ambient.mp3, bedtime-ambient.mp3
public/sample-story.mp3        — Sample Chase story for homepage
public/logo-new.png            — Hear Their Name logo (used in emails)
public/sitemap.xml             — SEO sitemap
public/robots.txt              — SEO robots file
```

### Admin / Internal
```
public/studio.html             — Password-protected Creator Studio (3 tabs)
public/admin.html              — Admin dashboard (analytics, customers, stories)
public/creator-dashboard.html  — Content shoot playbook for creators
```

### Backend Functions (netlify/functions/)
```
— Customer Flow —
create-checkout.mjs            — Creates Stripe checkout session in detected currency
verify-payment.mjs             — Confirms Stripe payment_status === 'paid'
generate-preview.mjs           — Gateway: preview story generation
story-worker-background.mjs    — Worker: preview Claude text → ElevenLabs TTS
check-preview.mjs              — Polls preview job status
generate-full.mjs              — Gateway: full story generation (payment-gated)
full-worker-background.mjs     — Worker: full Claude text → ElevenLabs TTS → Supabase
check-full.mjs                 — Polls full story job status
save-story.mjs                 — Saves completed story to Supabase
get-stories.mjs                — Retrieves customer story library
shared-story.mjs               — Public story sharing endpoint
get-pending-story.mjs          — Retrieves pending story data post-Stripe redirect
save-attempt.mjs               — Logs generation attempts for admin
retry-worker.mjs               — Retries failed story jobs

— Auth —
send-login-code.mjs            — Magic link / OTP email to customer
verify-login-code.mjs          — Validates OTP, issues session token

— Payments & Email —
stripe-webhook.mjs             — Handles checkout.session.completed (conversion tracking,
                                  referral) and checkout.session.expired (abandoned cart email)
send-email.mjs                 — Transactional emails via Resend: purchase, gift, share,
                                  contact, review, discount
create-discount.mjs            — Creates Stripe coupon for repeat purchases

— Pricing —
get-pricing.mjs                — Detects user country via Netlify x-country header,
                                  returns localised price (see Section 11)

— Tracking —
track-pageview.mjs             — Logs page views to Supabase page_views table
referral-track.mjs             — Tracks referral click events
referral-stats.mjs             — Returns referral stats for dashboard
audit.mjs                      — Full end-to-end system health check

— Admin —
admin-api.mjs                  — Protected admin endpoints: customers, stories, attempts,
                                  errors, metrics, live activity, referrals, create-story
admin-creators.mjs             — Creator management
creator-auth.mjs               — Creator authentication

— Studio —
studio-story.mjs               — Gateway: validates auth, creates jobId, triggers worker
studio-story-background.mjs    — Worker: Claude text gen → ElevenLabs TTS → Supabase
studio-story-status.mjs        — Polls studio job status
studio-generate.mjs            — Gateway: snippets, ad copy, music, AI director
studio-snippet-background.mjs  — Worker: quick story + TTS (30s–5min stories)
studio-director.mjs            — AI creative director: vision analysis, ad concepts
studio-library.mjs             — Asset management: list/save/delete/clear-all
comedy-worker-background.mjs   — Worker: narrate-style comedy clips
comedy-status.mjs              — Polls comedy job status

— Misc —
voices.mjs / list-voices.mjs   — ElevenLabs voice list
voice-preview.mjs              — Short voice preview clips
health-check.mjs               — System status
story-count.mjs                — Public story counter
content-take.mjs               — Content moderation
update-gift-sent.mjs           — Marks gift as sent
```

### Prompts
```
netlify/functions/lib/story-prompts.mjs — Master prompt system
```

### Edge Functions
```
netlify/edge-functions/redirect-old-domain.js — 301 storytold.ai → heartheirname.com
netlify/edge-functions/og-shared.js           — OG meta tags for shared story links
```

### Tools
```
tools/make-ad.py   — Video ad builder (raw footage → finished ad)
```

---

## 8. Creator Studio (studio.html)

Password-protected at heartheirname.com/studio. Login via `ADMIN_SECRET` env var.

### Tab 1: Story Generator

**"Your Story" (Snippet) sub-mode:**
- Paste rough story text → select duration (30s, 1min, 3min, 5min)
- Claude polishes text keeping exact beats → ElevenLabs narrates
- Background worker pattern: fire-and-forget → poll every 1s
- Word target: `durationMins * 150`

**"Full Story" sub-mode:**
- Complete form (name, age, friend, pet, family, themes, setting, voice)
- Length: Preview (~60s) / Standard (~15min) / Epic (~15min, different tone)
- Background worker: fire-and-forget → poll every 3s (up to 10min)
- Full Claude SYSTEM_PROMPT + story type prompt

**Audio player:** Canvas waveform, play/pause, skip ±15s, seek bar.

### Tab 2: Narrate
Comedy narration over video clips. Select style (Epic Movie, Documentary, Breaking News, Fairy Tale, Sports Commentary, Horror Trailer, Heist Movie, Romance). Claude generates script → ElevenLabs narrates. Option to add background music. Download MP3 or export as video.

### Tab 3: Library
Save/retrieve generated stories, snippets, ad copy, clips, photos. Stored in Supabase at `studio-library/`. Index tracks up to 500 assets. Filter by type (snippets, stories, ad copy, clips).

---

## 9. Story Prompt System (lib/story-prompts.mjs)

### SYSTEM_PROMPT (~800 lines) — Master Rules

1. **Every detail is sacred** — weave child details 8+ times, best friend has 3+ real moments, pet does one memorable action
2. **The child's name is music** — use 8+ times naturally, never twice in same sentence
3. **Age is everything:**
   - Ages 2–4: 30%+ sound effects, NO danger/villains, CBeebies style, ~1200 words
   - Ages 5–7: Clear structure, simple morals, ~1870 words
   - Ages 8–10: Real tension, humour, clever problem-solving, ~2200 words
   - Ages 11–14: YA tone, identity themes, realistic dialogue, ~2200 words
4. **Written for the ear** — pauses with `...`, audio tags `[whispers] [gasps] [laughs softly]`, varied sentence rhythm. 1 pause per 100–150 words. Max 8–12 audio tags per story.
5. **Start immediately** — first sentence hooks, child's name in first 2 sentences
6. **40%+ dialogue** — varied attribution, distinct character voices
7. **Final line** — specific callback to story + "This story was made just for [name]"
8. **No generic phrases** — every sentence specific to THIS child
9. **Pacing:** 4 acts, 3+ scenes per 300 words, plant early → pay off later

### Word Count Formula
- Base: 2200 words (standard)
- Age ≤3: 55% → ~1200 words
- Age ≤4: 70% → ~1540 words
- Age ≤6: 85% → ~1870 words
- Age 7+: Full 2200 words
- Studio override: `_targetWords = durationMins * 150`

### Security
- `sanitiseInput()` strips prompt injection patterns
- `sanitiseStoryData()` applies to all text fields, 500 char limit per field
- Brute-force protection: 5 failed auth attempts = 1 hour lockout (Supabase rate_limits table)

---

## 10. Audio Processing Pipeline

```
Claude generates story text
    ↓
prepareTTSText() — converts ... pauses to natural breaks
    ↓
splitIntoChunks() — splits at 4000 char boundaries by sentence
    ↓
ElevenLabs TTS per chunk
    Model: eleven_v3
    Voice settings: stability 0.50, similarity_boost 0.75, style 0
    ↓
stripID3() — removes ID3v2 tags from MP3 headers
stripXingFrame() — removes LAME VBR info frame
    ↓
Concatenate all chunks into single MP3
    ↓
Upload to Supabase: stories/{storyId}/audio.mp3 (customer)
              or: studio/{jobId}.mp3 (studio)
Save metadata to: studio-jobs/{jobId}.json
```

---

## 11. Multi-Currency Pricing

The `/api/get-pricing` function auto-detects the user's country from Netlify's `x-country` header and returns a localised price.

**How it works:**
- Country → currency mapped for every country in the world
- Exchange rates are approximate (hardcoded, periodically updated)
- Always `.99` pricing for decimal currencies (€23.99, $25.99, A$40.99)
- Zero-decimal currencies (JPY, KRW, HUF etc.) rounded to nearest 100 (¥3,900)
- GBP stays as £19.99 (established price)
- Unsupported currencies fall back to EUR (Europe) or USD (rest of world)

**Key prices:**
- UK → £19.99 | Ireland → €23.99 | USA → $25.99 | Canada → CA$34.99
- Australia → A$40.99 | UAE → AED 93.99 | Singapore → S$25.99
- Japan → ¥3,900 | India → ₹2,138.99

**Frontend:** `.price-display` CSS class on all price elements — updated via JS on page load.
**Checkout:** Currency and `unitAmount` passed to `create-checkout.mjs`, which creates the Stripe session in the detected currency. Stripe Adaptive Pricing also enabled as fallback.

---

## 12. Email Flows

All emails sent via Resend from `Hear Their Name <jamie@heartheirname.com>`.

### Purchase Confirmation (send-email.mjs, type: 'purchase')
Triggered by frontend after story generation completes. Requires valid paid Stripe session.
- Subject: `[Child]'s story is ready! 🎧`
- Contains: listen link, WhatsApp share link, login email reminder
- Optional: discount code for next purchase (25% off)

### Abandoned Cart Recovery (stripe-webhook.mjs)
Triggered by `checkout.session.expired` Stripe webhook (~24hrs after abandonment).
- Only fires if customer entered email but didn't pay
- Skips if customer already has a story (existing customer)
- Rate limited: max 1 per email per 24 hours (Supabase rate_limits table)
- Subject: `[Child]'s story is still waiting for you` (or generic if no child name)

### Gift Email (send-email.mjs, type: 'gift')
Sent to gift recipient. Requires valid paid Stripe session or auth token.
- Subject: `[GiftFrom] made something special for [Child] 🎁`
- Contains: listen link, personal message if provided

### Share Email (send-email.mjs, type: 'share')
Customer shares their story with family. Requires valid story ID in database.
- Subject: `[From] shared [Child]'s story with you 🎧`
- Contains: listen link

### Contact Form (send-email.mjs, type: 'contact')
Sent to jamie@heartheirname.com. Rate limited (3 per IP per hour).

### Magic Link Auth (send-login-code.mjs)
OTP login for returning customers to access story library.

---

## 13. Stripe Setup

- **Webhook endpoint:** https://heartheirname.com/api/stripe-webhook
- **Events listened to:** `checkout.session.completed`, `checkout.session.expired`
- **Adaptive Pricing:** Enabled (Stripe shows local currency on checkout page)
- **Checkout creates:** Line item "Hear Their Name: Personalised Audio Story" in detected currency
- **Coupon:** `storytold_next_story_25` (25% off repeat purchase, internal name)

**checkout.session.completed fires:**
1. Meta Conversions API (server-side Purchase event, deduplicates with client pixel via eventId)
2. TikTok Events API (CompletePayment event)
3. Referral conversion tracking (if ref_code in metadata)

---

## 14. Admin Panel (admin.html)

Password-protected at heartheirname.com/admin via `ADMIN_SECRET`.

**Tabs:**
- **Customers** — All unique customer emails, story count, story details
- **Stories** — All generated stories with audio links
- **Attempts** — Recent generation attempts (debugging)
- **Errors** — Error log with severity levels
- **Analytics** — Sales, revenue, page views, previews, checkouts. Daily chart. 30/60/90 day views.
- **Live** — Real-time visitor activity, recent events
- **Referrals** — Referral programme stats

**Tracking:** Page views logged to Supabase `page_views` table via `/api/track-pageview`. Metrics aggregated server-side by `admin-api.mjs`.

---

## 15. Supabase Schema (key tables)

```
stories           — id, email, child_name, category, audio_url, created_at, ...
story_attempts    — id, email, child_name, attempts, created_at, ...
page_views        — id, page, referrer, utm_source, utm_medium, device, visitor_id, screen_name, created_at
rate_limits       — id, key, created_at (used for auth brute-force + email rate limiting)
auth_tokens       — id, email, token, created_at (magic link sessions)
referrals         — id, ref_code, referrer_name, referrer_email, conversions, revenue, referred_emails
```

**Supabase Storage buckets:**
```
stories/              — Customer story audio + assets
  pending/{sessionId}.json  — Pending story data (survives mobile browser redirect)
studio/               — Studio-generated audio files
studio-jobs/          — Studio job result metadata JSON
studio-library/       — Library assets (mp3, png, txt, jpg)
  index.json          — Library index (up to 500 entries)
```

---

## 16. SEO & Tracking Setup

- **Canonical:** https://heartheirname.com/
- **Sitemap:** https://heartheirname.com/sitemap.xml
- **Robots.txt:** Disallows /api/, allows everything else
- **GA4 Measurement ID:** G-84KXD5XPZG
- **Meta Pixel ID:** 1656775315345896
- **Meta domain verified:** heartheirname.com (facebook-domain-verification tag in index.html)
- **TikTok Pixel ID:** D74JVVJC77U5P0Q29FKG
- **Google Search Console:** Add heartheirname.com as property (pending)
- **Old domain:** storytold.ai → 301 redirect via Netlify edge function

---

## 17. Deployment

- **Repo:** github.com/jamie161190/storynow (main branch)
- **Deploy:** Auto-deploys to Netlify on push to main
- **Build command:** `npm install`
- **Publish dir:** `public`
- **Functions dir:** `netlify/functions`
- **Edge functions dir:** `netlify/edge-functions`
- **Node bundler:** esbuild
- **Stripe, Supabase modules:** listed as external in netlify.toml

---

## 18. What NOT to Touch

Customer-facing code handles live payments and story delivery. Never modify without explicit instruction:

- `public/index.html`
- `netlify/functions/generate-preview.mjs`
- `netlify/functions/story-worker-background.mjs`
- `netlify/functions/full-worker-background.mjs`
- `netlify/functions/generate-full.mjs`
- `netlify/functions/stripe-webhook.mjs`
- `netlify/functions/create-checkout.mjs`
- `netlify/functions/verify-payment.mjs`
- Any function without `studio-` prefix (unless specifically asked)

The studio (`studio.html`) and `studio-*` functions are the safe sandbox.

---

## 19. Video Ad Pipeline (tools/make-ad.py)

Takes raw video footage → finished social media ad with narration, background music, subtitles, text overlays, and end cards.

### 9-Step Process

1. **Cut video clip** — ffmpeg extract between timestamps
2. **Mute original audio** — strip source audio track
3. **Cut narrator audio** — extract matching segment from story MP3
4. **Combine video + narrator** — merge muted video with narration audio
5. **Mix background music** — adventure-ambient.mp3 at 15% volume, fade in 2s, fade out over 5s. **CRITICAL: use `normalize=0` with amix or you get hissing artifacts**
6. **Burn subtitles** — moviepy + PIL (ffmpeg drawtext/subtitles filters not available). Position at y=1470 (safe zone).
7. **Create text overlay PNGs** — PIL transparent PNGs with bold text + dark semi-transparent banners. Position at y=350 (safe zone).
8. **Composite overlays** — ffmpeg `overlay` filter with `enable='between(t,start,end)'`. **Use ffmpeg for this, NOT moviepy** — moviepy strips HDR colour space and washes out colours.
9. **End cards + concat** — static PNGs → 2.5s MP4s with silent audio → concatenate via ffmpeg concat demuxer. Fade audio out 3s before end cards.

### Social Media Safe Zones (CRITICAL)
- **Top safe:** y=350 (below FB/TikTok username and status bar)
- **Bottom safe:** y=1470 (above caption text and like/share buttons)

### Key Technical Gotchas
- `amix` must use `normalize=0` — without it, audio normalisation creates hissing
- moviepy strips HDR/bt2020 colour data — only use for subtitle burn-in
- ffmpeg path: `/opt/homebrew/bin/ffmpeg` (not on PATH)
- Whisper broken on this machine — use Google Speech Recognition (`speech_recognition` library)
- ffmpeg lacks `drawtext` (no libfreetype) and `subtitles` (no libass) — use moviepy for subtitles

### Usage
```bash
# Edit CONFIG section at top of file, then:
python3 tools/make-ad.py
```

---

## 20. Ad Creative Philosophy

**The comedy video IS the product demo.** Don't treat entertaining content as separate from Hear Their Name — it already shows what Hear Their Name does (turning ordinary moments into warm, narrated stories).

**Never explain the product in an ad.** Show it working, then pivot emotionally:
1. Hook with entertaining content (comedy narration over real video)
2. Hard cut
3. Emotional truth (time-jump: "he was 2, he's 9 now")
4. CTA

**Ad Structure (Chase Tickle Monster Ad — the template):**
- **Caption:** "Made the kids the heroes of their own story. Made Dad the villain."
- **0–2s:** Hook overlay: "They don't know what's coming..." (white bold, dark banner, safe zone)
- **0–35s:** Video plays untouched — narration IS the demo. Don't interrupt it.
- **20–22s:** Mid-point flash: "You can make yourself the villain too." (yellow bold) — the product bridge
- **35–37.5s:** End card 1: "This is what happened when we put the kids in their own story." / "Dad was the villain."
- **37.5–40s:** End card 2: "Their name. Their best friend. Their world." / "In a story made just for them."

**End card design:**
- Background: Dark purple (#2D0F41)
- Primary text: White, Arial Bold 56pt
- Accent text: Orange (255, 140, 0), Arial Bold 62pt
- Duration: 2.5 seconds per card

**The cardinal sin:** Explaining what Hear Their Name is. The moment you say "AI-powered personalised stories" you've lost them. Let the video do the selling.

---

## 21. Chase Ad Asset Reference

- **Raw footage:** `~/Downloads/Full Video.MOV` (3:42)
- **Best clip:** 2:45–3:20 (35 seconds) — Chase, Darcy (5), Ethan (3) on floor, dad appears as tickle monster under blanket, Darcy's laugh at the end is gold
- **Narrator audio:** `~/Downloads/storytold-story.mp3` (cut to same timestamps)
- **Background music:** `public/music/adventure-ambient.mp3` (15% volume)
- **Final export:** `~/Downloads/storytold-chase-ad-v4.mp4` (40s)

**Subtitles:**
```
00:00–00:05  "He was there again, as usual... and somewhere in this house"
00:05–00:10  "something was lurking. The tickle monster."
00:10–00:15  "All three children knew it. They could feel it. The monster was close."
00:15–00:22  "Disguised. Hidden. Watching... and waiting."
00:22–00:28  "Was it Grandad? Was it Chase's dad? Was it Darcy and Ethan's dad?"
00:28–00:35  "Nobody knew. Every creak of the floorboard... every suspiciously innocent adult face."
```

---

## 22. Python Dependencies (video pipeline)

```bash
pip3 install moviepy SpeechRecognition Pillow
```
- Python 3.9 at `/Library/Developer/CommandLineTools/usr/bin/python3`
- ffmpeg at `/opt/homebrew/bin/ffmpeg` (v8.1, no libass/libfreetype)
