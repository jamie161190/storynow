# Storytold — Complete Claude Brief

> Upload this document at the start of any Claude session to give full context on the product, marketing, content strategy, and technical architecture.

---

## PART 1: PRODUCT SUMMARY

### What Storytold Is
Storytold (storytold.ai) is a personalised audio story product for children aged 2-14. Parents or gift-givers enter details about a child — name, age, best friend, pet, interests, family members — and AI writes a completely unique ~2,200-word story starring that child as the hero. The story is narrated by a professional-quality AI voice the customer chooses, producing a ~15-minute audio story delivered as an MP3.

**Price:** £19.99 per story. One payment. No subscription. Theirs forever.

**Tagline:** "A story that knows their name"

**Guarantee:** "Not magical enough? I'll rewrite it for free."

### The Emotional Core
This is NOT a "put your name in a template" product. Every story is written from scratch. The child's name appears 8+ times. Their best friend has dialogue and a personality. Their pet does something memorable. Their interests drive the plot. Parents can even make themselves the villain. A personal message from the parent is read aloud at the start by the narrator.

**The killer moment:** A parent presses play and hears their child's name spoken in a real story. That's what sells it. The free preview exists specifically to create that moment before payment.

### Founder Story
Jamie built Storytold because his son Chase asked why he wasn't in any of his stories. He wanted to hear his name. His best friend. His world. So Jamie made something where he could. Now every child can. Jamie and Chase are the face of the brand — all early content is built around them.

### Story Categories

**Bedtime** — Warm, calming, gentle. The story winds down slowly until they drift off feeling safe and loved. Perfect for sleep routines. Uses journey-home structure: discovery > gentle adventure > winding down > sleep.

**Adventure** — Action-packed with twists, humour, and a villain if you want one. The kind of story they beg to hear again. Uses 4-act structure with scene changes, cliffhangers, and emotional peaks.

**Learning** — They save the day using real knowledge. Maths, science, spelling, any subject. Education disguised as magic. Uses superhero framework where knowledge IS the superpower, with interactive audio pauses.

### The Customer Funnel (7 Steps)
1. **Category** — Bedtime, Adventure, or Learning
2. **Gift toggle** — For your child or someone else's?
3. **Main character** — Name, age, gender, occasion
4. **People** — Best friend, family members, pet, teacher, villain toggle
5. **Themes** — 18 tiles (Dinosaurs, Space, Football, Unicorns, Pirates, etc.) + custom
6. **Setting & extras** — Where it happens, favourite toy, personal message from parent
7. **Voice** — 22 narrator voices filtered by gender, accent (British/American/Australian/Irish), age

**Post-funnel:** Free preview (~60 seconds) > Stripe checkout (£19.99) > Full story generated (~5 min) > Delivered (in-browser player, email, downloadable MP3)

### Post-Purchase Features
- **My Stories** — Passwordless email login, access all purchased stories
- **Sharing** — Public listen links with dynamic OG tags for WhatsApp/social
- **Gifting** — Send story to another email with personal message
- **Referral program** — Unique ref codes, tracks visits/conversions/revenue
- **Discount codes** — 25% off next story included in purchase email
- **Abandoned cart recovery** — Stripe webhook triggers email if checkout expires

### Tech Stack
- **Frontend:** Vanilla HTML/CSS/JS on Netlify (single-page app architecture)
- **Backend:** 40+ Netlify serverless functions
- **AI:** Claude API (Sonnet for previews, Opus for full stories)
- **Voice:** ElevenLabs TTS (22 voices, v3 model)
- **Payments:** Stripe (hosted checkout, webhooks)
- **Database:** Supabase (Postgres + Storage for MP3s)
- **Email:** Resend (purchase confirmations, gift notifications, login codes, abandoned cart)
- **Tracking:** GA4, Meta Pixel, TikTok Pixel (consent-gated), server-side Meta CAPI + TikTok Events API
- **Domain:** storytold.ai

### Database Tables (Supabase)
- `stories` — Completed purchased stories (email, child_name, category, audio_url, story_text, voice_id, gift fields)
- `story_attempts` — Generation attempts/previews for funnel tracking
- `page_views` — Analytics (screen, device, referrer, UTM, visitor_id)
- `referrals` — Referral links (name, code, visits, conversions, revenue)
- `content_creators` — Creator hub users with referral codes
- `content_takes` — Which creator claimed which content piece
- `auth_tokens` / `login_codes` / `login_attempts` — Passwordless auth system
- `rate_limits` — Brute-force protection
- `error_logs` — Exception tracking

### Brand Identity
- **Colors:** Deep purple (#6B2F93) + warm orange (#F1753B), sky blue (#4FC3F7), teal (#00B4A0)
- **Fonts:** Nunito (headings), Quicksand (body)
- **Tone:** Warm, personal, first-person ("I take every detail..."), conversational, emotional
- **Design:** Rounded corners, soft shadows, gradient buttons, mobile-first, generous whitespace
- **Rules:** Never mention AI. Never use em dashes. Sell the feeling, not the technology.

### Competitive Positioning
Competitors (Childbook.ai, StoryBee, ReadKidz) are DIY platforms where parents build stories themselves. Storytold is done-for-you: fill in the form, hear the story. "Canva exists. Designers still get paid."

**5-Point Moat:**
1. Preview before payment (nobody else does this)
2. Personal message read aloud (nobody else does this)
3. Category-matched narrator voices (nobody else does this)
4. Occasion-led product design (nobody else does this)
5. Emotional gift positioning (nobody else does this)

---

## PART 2: MARKETING SUMMARY

### Core Marketing Principle
**Technology is invisible. Emotion is everything.** Never say "AI-generated" — say "a story made just for them." The free preview IS the conversion mechanism. Once parents hear their child's name, the purchase is emotional, not rational. User-generated reaction videos of parents pressing play are worth more than any ad budget.

### Primary Audience Segments

**1. Bedtime Parents (Highest LTV, Repeat Buyers)**
- Parents of children aged 2-8, primarily mums with strong dad secondary
- Buy evenings/weekends, especially Sunday nights
- Motivation: Tired of reading the same book 400 times; want bedtime to feel special
- Highest repeat potential (bedtime every night = subscription opportunity)
- Channels: Parenting pages, CBeebies followers, baby/toddler groups, school mums pages

**2. Journey Parents (Impulse Buyers, Urgency-Driven)**
- Any parent facing a long trip with children
- Buy night before or morning of journey; airport lounges, service stations
- Motivation: Desperate for screen-free entertainment
- Angle: "3 hours in a car with the kids? We've got you covered."
- Channels: Travel groups, family holiday pages, half-term school holidays

**3. Gift Givers (Highest Emotional Charge, Premium Positioning)**
- Grandparents, godparents, aunties, uncles, divorced parents, friends of new parents
- Buy around occasions: birthdays, Christmas, christenings, new baby, "just because"
- Least price-sensitive, most emotionally driven
- Angle: "A gift they will never forget." "Their name. Their story. From you."
- Channels: Gift guides, grandparent communities, "gifts for children who have everything" searches

**4. Teachers & Schools (B2B, Future Phase)**
- Primary school teachers, SEN coordinators, literacy leads
- Buy September, January, assessment periods
- Angle: "Every child is the hero of their own learning story."
- Channels: Teacher Facebook groups, TES marketplace, education conferences

### Emotional Marketing Angles

**The Bedtime Angle (Universal, Simplest Hook)**
- "Bedtime will never be the same."
- "A story where they are the hero. Every single night."
- Split screen concept: tired parent reading dog-eared book vs. child's face lighting up hearing their name

**The Gift Angle (Most Commercially Powerful)**
- "The gift they will talk about forever."
- "Not another toy. A story made just for them."
- Concept: Grandparent filling in details > child discovering story on Christmas morning > tears from everyone

**The Journey Angle (Impulse Energy, Urgency)**
- "4 hours in the car. 0 arguments. 1 story."
- "Screen-free. Tear-free. Their story, their journey."
- Concept: Car chaos > same car ten minutes later, kids silent with headphones, gripped

**The Memorial Voice Angle (Handle With Extreme Care — Future Feature)**
- NEVER use: dead, died, passed, gone, deceased, loss, grief
- ALWAYS use: "keep their voice alive," "some voices should never be forgotten"
- The ad never explains; the viewer fills in meaning
- One real family sharing their story = content worth millions in ad spend

### Pricing Psychology
- Sits in "meaningful gift" bracket (more than a greeting card, less than audiobook + children's book)
- Preview eliminates price objection — emotionally committed before seeing price
- Bundle opportunities: occasion bundles, category bundles, monthly subscription (£9.99/mo)

### Website Copy & Trust Signals

**Hero:** "A story that knows their name."

**Subhead:** "Their name, their best friend, their world. Woven into a story made just for them. Narrated by a voice you choose. Ready in minutes."

**Founder:** "My son Chase asked me why he wasn't in any of his stories."

**Social Proof:** WhatsApp testimonial from Lisa: "Livvie's woken up asking me for another story, I blame you"

**CTAs:** "Create their story" / "Hear it free first. £19.99 for the full story" / "Only pay if you love it"

**Trust:** "One payment. No subscription. Theirs forever." / "Secure payment via Stripe." / "Their details are only used to write the story. Nothing is shared or sold. Ever."

**FAQ Highlights:**
- Free preview before payment
- ~15 minutes narrated audio
- One-tap sharing to family via WhatsApp/email
- 24-hour refund if not downloaded/shared
- Ages 2-14, automatically adapts
- Listen forever, download to any device

### The Preview as Marketing Engine
The preview is the ENTIRE marketing strategy:
1. Most powerful sales tool in funnel (converts before seeing price)
2. Most shareable moment in journey (people film themselves pressing play)
3. Why reviews don't matter at launch (customer IS their own review)

**One genuine reaction video on TikTok could drive thousands of sales with zero spend.**

### Server-Side Conversion Tracking
- Stripe webhook triggers Meta CAPI (Purchase event with hashed email, value, content_name)
- Stripe webhook triggers TikTok Events API (CompletePayment event)
- Referral tracking updates on purchase
- Abandoned cart recovery email on checkout expiry

---

## PART 3: CONTENT SUMMARY

### The Core Ad Principle
**You are not making ads. You are capturing moments.** The product is not the story — the product is the reaction when a child hears their name. Every ad must make the viewer feel like they are watching something real.

**Foundation:** Chase is the brand. All early ads should be 80% Chase-led. His reactions, his relationship with his dad, are the origin of the product.

**The Structure of All Ads:**
1. Hook curiosity: "They don't know yet..."
2. Show listening: No explanation, just press play
3. Capture reaction: THIS is the product
4. Soft CTA: "Let them hear it"

### 15 Proven Ad Formats

**AD1: DADDY IS THE VILLAIN** (HIGHEST priority)
- Hook: "I made myself the villain in my son's adventure story"
- Dad intro > Child listening > Reveal moment > Reaction

**AD2: HE DOESN'T KNOW YET (CAR)** (HIGHEST)
- Hook: "He doesn't know the story is about him yet"
- Dad driving > child in back > story through speakers > name hits > reaction

**AD3: SIBLING REACTION** (HIGH)
- Hook: "Put both my kids in the same story. Wait for the second one."
- Both listening > First reaction > Second reaction > Shared moment

**AD4: FOUNDER ORIGIN STORY** (HIGH)
- Hook: "My son asked me why he was never in any of his stories"
- Selfie narrative > Cut to Chase listening > Reaction

**AD5: ALL FOUR COUSINS TOGETHER** (HIGHEST)
- Hook: "Put all four cousins in the same story and didn't tell any of them"
- Setup > Story plays > Chain reaction cascade

**AD6: ONE COUSIN CLOSE-UP** (HIGH)
- Hook: "Watch her face when she hears her name"
- Close-up before > Name moment > Pure reaction

**AD7: GRANDAD LISTENS** (HIGHEST)
- Hook: "Put my dad in my son's story. Didn't expect his reaction."
- Grandad + child > Listening > Grandad's reaction (the twist)

**AD8: CHASE BUYS HIS COUSIN ONE** (HIGH)
- Hook: "My son wanted to buy his cousin a story"
- Chase filling in details > Product walkthrough > Cousin receives > Reaction

**AD9: FUNNEL WALK-THROUGH** (HIGH)
- Hook: "Watch how fast this works"
- Screen recording of creation flow > Preview plays > Reaction

**AD10: PREVIEW CLOSE-UP** (HIGH)
- Hook: "Watch his face when he hears it"
- Extreme close-up > Audio plays > Micro-expressions > Full reaction

**AD11: NO-KIDS COUPLE GIFT** (HIGH)
- Hook: "We don't have kids but we just gave the best gift we've ever given"
- Couple finding Storytold > Building story > Child receives > Reaction

**AD12: 15 MIN BACKGROUND CLIP** (HIGH)
- Hook: "They didn't know I was filming"
- Long-form background footage of children listening. Best moments extracted.

**AD13: SHE SAID SHE WAS TOO OLD** (HIGH)
- Hook: "She said she was too old for it"
- Teenager dismissive > Presses play > Genuine reaction. Text: "Ages 3 to 12."

**AD14: AGES 3 TO 12** (MEDIUM)
- Hook: "Ages 3 to 12. One story. Both of them in it."
- Two kids different ages > Both listening > Both reacting

**AD15: FIRST TIME HE'S HEARD HIS NAME** (MEDIUM)
- Hook: "He's 3. First time he's ever heard his name in a story."
- Toddler listening > Recognition moment > Pure joy

### Proven Hooks (Ranked by Stopping Power)

**Tier 1 (Scroll-Stoppers):**
- "He doesn't know the story is about him yet"
- "I made myself the villain in my son's story"
- "Watch his face when he hears it"
- "She said she was too old for it"
- "My son asked me why he was never in any of his stories"

**Tier 2 (Strong):**
- "Put all four cousins in the same story"
- "Wait for the second one..."
- "Put my dad in my son's story. Didn't expect his reaction."
- "We don't have kids but we just gave the best gift we've ever given"
- "They didn't know I was filming"

**Tier 3 (Solid):**
- "Bedtime just changed"
- "Ages 3 to 12. Both of them in it."
- "He's 3. First time he's ever heard his name in a story."
- "Sent this instead of a toy"
- "Watch how fast this works"

### Production Rules (Non-Negotiable)

**DO:**
- Capture REAL reactions. Never scripted. Never coached.
- Keep it natural. Real environments, real lighting, real sound.
- Let the audio do the work. The story playing IS the content.
- One continuous shot during reaction moments. Do NOT cut.
- Close-ups on faces during key moments.
- Film in 9:16 vertical (1080x1920), H.264, 30fps.
- Raw audio only. No background music on reaction content.

**DO NOT:**
- Script reactions or tell children what to do
- Explain the product in the ad. Show, never tell.
- Add background music over reaction moments
- Over-edit. Raw > polished.
- Cut during the reaction. Let it breathe.
- Tell the child what is about to happen. The surprise IS the content.
- Use the word AI anywhere

### What Makes Marketing Gold (Content Rating)

**5/5 (Best Possible Content):**
- THE "PRESS PLAY" MOMENT: Parent hearing child's name for first time. Hand over mouth. Eyes filling up.
- CHILD HEARING THEIR NAME: Face lighting up, eyes wide, mouth dropping, turning to parent in amazement.
- GENUINE TEARS: Real tears, real shock, real joy.
- THE PERSONAL MESSAGE: Someone reacting to "Chase, this is from Daddy..." moment.
- GIFT REVEAL: Grandparent watching child discover their story. Two emotional reactions in one frame.
- THE GROUP LISTEN: Family huddled around speaker. Multiple reactions. Social proof in a single frame.

**3-4/5 (Strong):**
- Children engaged with headphones on, eyes wide, smiling, absorbed
- Bedtime scenes: child in bed, parent nearby, warm lighting
- Car journey scenes: kids in backseat, headphones on, peaceful
- Before/after contrast: chaos vs. peaceful listening child
- Product demos: filling in the form on phone (visible Storytold interface)
- Family lifestyle: cuddling on sofa, morning routine
- Behind-the-scenes: choosing a voice, typing name, writing personal message

### Creator Content System

**41 content briefs** organised by type:
- **Founder Story Pieces (1-12):** Solo founder moments, Chase reactions, origin story
- **Gift & Family Moments (14-20):** Grandparent reveals, godparent moments, sibling surprises
- **Lifestyle & Screen Recording (21-29):** Gym context, voice notes, funnel recordings, contrast shots
- **Premium Moments (30-41):** Multi-person reactions, long-distance scenarios, duets

Each brief includes: hook/title, what to do, what NOT to do, why it works, camera position, text overlays, sound notes, editing specs (CapCut, 9:16, H.264, 30fps).

**Modular Sub-Clips:**
- **F-series:** Founder selfies (F1-F5: why built it, villain joke, mystery hook, closer, strongest opening)
- **P-series:** Product screen recordings (P1-P5: typing name, preview generating, pressing play, WhatsApp, listen link)
- **FC-series:** Couple gift flow (FC1-FC3: the decision, the send, the reaction)
- **BG-series:** Background 15-min clips (BG-A to BG-D: single reactions, compilation, atmosphere, shared moment)
- **C-series:** Older kids/cousins (C1-C2: too old objection, name drop reveal)

### Content Studio (AI Creative Director)

An internal tool at `/studio.html` (password-protected) that:
1. **Analyses footage** — Upload video frames/photos > Claude Vision auto-tags mood, usability, marketing potential, suggests hooks and overlays
2. **Generates ad concepts** — 3 complete production-ready ad timelines per batch, platform-specific (TikTok/Meta/YouTube/Reels)
3. **Creates marketing copy** — Ad copy, video scripts, captions, briefs tailored to platform and audience
4. **Generates story snippets** — Short emotional audio clips for ads (text + TTS)
5. **Comedy Clips** — Upload any video/photo of a kid, pick a comedy style, and generate hilariously over-the-top narrated audio (see below)
6. **Library** — Saves all generated assets with tagging for reuse

### Comedy Clips Feature

A content creation tool inside the Content Studio that takes random/mundane clips of kids and generates dramatic narrated audio using Storytold's existing voice and music engine. The comedy comes from the contrast between ordinary footage and over-the-top narration.

**How it works:**
1. Upload a video clip or photo of a kid doing anything
2. Enter the child's name and optional context
3. Pick a comedy style (8 options — see below)
4. Choose background music (Adventure or Bedtime ambient, or none)
5. Choose a narrator voice (any of the 22 existing Storytold voices)
6. Hit Generate — Claude Vision analyses the frame, writes a comedy script in the chosen style, ElevenLabs narrates it
7. Listen to the result, read the script, approve or try another style

**8 Comedy Styles:**
- **Epic Movie** — Hollywood action movie narration of a kid eating cereal
- **Nature Documentary** — David Attenborough-style study of a child in their natural habitat
- **Breaking News** — Urgent news anchor coverage of a kid drawing on a wall
- **Fairy Tale** — Once upon a time, a brave warrior discovered... the cat
- **Sports Commentary** — Play-by-play analysis of a toddler attempting stairs
- **Horror Trailer** — Terrifying movie trailer about a child who... found a spider
- **Heist Movie** — Ocean's Eleven-style narration of a kid stealing biscuits
- **Romance** — Sweeping romantic epic of a child's love affair with their blanket

**Duration Matching:** For video uploads, narration length automatically matches the video duration (2.5 words per second calculation). Photos get natural-length narration.

**Audio Formatting:** Uses the same Storytold audio formatting rules as paid stories: `...` pauses every 30-40 words, audio tags (`[whispers]`, `[gasps]`, `[laughs softly]`, `[excitedly]`, `[sighs]`), varied sentence rhythm. The comedy script is generated by Claude and narrated by ElevenLabs TTS v3.

**Technical Architecture:**
- Background function (`comedy-worker-background.mjs`) with 15-minute Netlify timeout
- 3-step pipeline: Claude Vision analysis > Comedy script generation > ElevenLabs TTS
- Status polling via `comedy-status.mjs` (checks Supabase Storage at `stories/comedy-jobs/{jobId}.json`)
- Progress updates shown live: scene description, script preview, status badges

### Audio Mixing

After generating comedy narration, users can:
- **Download Narration Only** — Raw voice MP3
- **Mix with Music & Download** — Uses Web Audio `OfflineAudioContext` to render narration at full volume + background music at 0.15 volume into a single WAV file with 1-second fade in and 2-second fade out after narration ends

### Video Export Engine

After approving a comedy narration (video uploads only), users can export a complete, ready-to-post video with:

**Aspect Ratio Selection:**
- 9:16 (TikTok/Reels) — default
- 16:9 (YouTube)
- 1:1 (Instagram Square)
- 4:5 (Facebook)

The video uses blurred background fill when the source clip doesn't match the target aspect ratio (like how TikTok shows landscape videos in portrait).

**Subtitles:** On by default. The narration text is auto-cleaned (strips `[whispers]`, `[gasps]`, `...` pauses, all audio tags) and split into timed chunks proportional to word count. Displayed as white text on a semi-transparent dark rounded box at the bottom of the frame.

**Start Card (Optional):** 3-second branded intro card with purple gradient background, Storytold watermark, custom title line and subtitle. Example: "When Chase discovered spaghetti..."

**End Card (Optional):** 3-second branded outro card with purple-to-orange gradient, custom CTA and tagline. Defaults to "storytold.ai" / "A story that knows their name".

**Export Pipeline:**
1. Canvas-based frame-by-frame rendering at 30fps
2. Audio mixed offline (narration + music with fades) via `OfflineAudioContext`
3. Video captured via `MediaRecorder` with `captureStream(0)` for frame-accurate control
4. Prefers MP4 format (phone-compatible), falls back to WebM
5. Downloads automatically as `storytold-comedy-{name}-{style}-{aspect}.mp4`

**Technical Details:**
- Uses `CanvasRenderingContext2D` for all drawing (video frames, subtitle text, branded cards)
- `drawVideoFrame()` handles aspect ratio fitting with blurred background fill (CSS filter blur on stretched frame, then fitted frame on top)
- `buildSubtitleChunks()` splits cleaned text into 8-12 word chunks, timed proportionally to audio duration
- `audioBufferToWav()` encodes AudioBuffer to 16-bit PCM WAV for MediaRecorder audio input
- Progress bar with percentage shown during render

**Available Mockup Sequences (Product Demos for Ads):**
1. "create-story" — Full creation journey (~18s)
2. "gift-whatsapp" — Gift via WhatsApp (~8s)
3. "email-delivery" — Email gift delivery (~8s)
4. "family-sharing" — Sharing features (~8s)
5. "story-library-browse" — Collection & library (~8s)

**How to Mix Footage with Mockups:**
1. HOOK: Real footage (parent reaction) with text overlay
2. CURIOSITY: Quick mockup (child-details screen with name being typed)
3. EMOTIONAL PEAK: Real footage of reaction moment
4. PRODUCT: Mockup sequence showing creation flow
5. SOCIAL PROOF: Real footage of family enjoying story
6. CTA: End card "Create their story at storytold.ai"

### Channel Strategy

**TikTok & Reels (9:16, 15-25s):**
Raw, authentic, fast cuts. "POV: you just heard your daughter's name." Text hooks on screen. Less produced = better.

**Facebook & Instagram (4:5 or 1:1, 20-45s):**
Emotional storytelling arc. Slightly more produced. Carousel of moments. Works for gifting angles.

**YouTube (16:9, 30-60s):**
More produced, full story. Longer mockup sequences. Product-focused works.

**Google Search:**
Target: "personalised children's book," "personalised bedtime story," "unique children's gift," "personalised audiobook for kids." Gift-related searches around holidays.

**Email (Post-Purchase):**
1. Delivery email with listen link
2. Day 3: "How did bedtime go?" (collect testimonial)
3. Day 7: "Ready for their next adventure?" (upsell)
4. Day 30: "A new month, a new story"
5. Seasonal triggers: birthday reminders, Christmas, back to school

### Launch Strategy (4 Phases)

**Phase 1 — Soft Launch (Weeks 1-2):** Friends and family for feedback. Get 5-10 real testimonials. Film 3-5 reaction videos.

**Phase 2 — Organic Push (Weeks 3-4):** Post reactions on TikTok/Reels. Share testimonials on Facebook. Submit to parenting blogs and gift guides.

**Phase 3 — Paid (Month 2+):** Meta ads targeting bedtime parents first. Retarget visitors who reached voice selection. Lookalike audiences from first 50 customers. Google search ads.

**Phase 4 — Scale:** Gift targeting ahead of holidays. Journey targeting ahead of half terms. Teacher/school outreach. PR push around memorial voice feature.

---

## PART 4: STORY QUALITY RULES

### Personalisation Standards
- Child's name appears 8+ times, never forced, at moments of wonder, dialogue, quiet beats, climax
- Best friend has 3+ meaningful moments: dialogue, action that matters, connection moment
- Pet does something memorable and retellable (not just "wagged his tail")
- Interest DRIVES the plot, doesn't just decorate it
- Proud-of moment (if provided) appears as confidence source at turning point
- Personal message from parent read aloud warmly at start, natural lead-in to story

### Age Tailoring

**Ages 2-4:** Very short sentences. Simple words. Heavy repetition ("And they walked, and they walked..."). Sound effects. Onomatopoeia. ABSOLUTELY no danger, villains, scary moments. Everything safe and gentle. 30%+ should be repetitive patterns. Think CBeebies bedtime story.

**Ages 5-7:** Clear beginning, middle, end. Child is brave but world is kind. Simple moral woven naturally. Dialogue brings characters alive. Relatable challenges.

**Ages 8-10:** Real narrative tension. Child is clever and capable. Humour works brilliantly. Friend has own personality/opinions. Richer vocabulary without showing off.

**Ages 11-14:** Young adult tone. Complex emotions alongside adventure. Identity, belonging, growing up. Friendship has depth. Respect intelligence. Dialogue sounds like real teens: short fragments, unfinished sentences, affectionate sarcasm.

### Audio-First Writing Rules
- Written for the EAR, not the eye. Narrator reads aloud via TTS.
- Use `...` for breath pauses at suspense, wonder, scene transitions, emotional reveals
- Aim for one pause every 100-150 words minimum
- Use `... ...` for longer scene-change pauses
- Audio tags (sparingly, 8-12 per full story): `[whispers]`, `[laughs softly]`, `[gasps]`, `[sighs]`, `[excitedly]`
- Vary sentence length: short punchy beats, then flowing, then one-word. Boom.
- 40-50% dialogue minimum. Characters talking holds attention better than narration.
- Every character has distinct voice. Friend different from child different from adults.
- At least one line the child will want to repeat.

### Story Structure

**Bedtime (Journey Home):**
Opening (20%): gentle discovery > Gentle adventure (20-50%): wondrous journey through safe places > Winding down (50-80%): energy drops, sentences shorter, dialogue quieter > Sleep (final 20%): home, lullaby prose, rhythmic, repetition welcome. End with child feeling safe, warm, loved.

**Adventure (4 Acts):**
Act 1 (20%): Immediate hook, dropped into situation > Act 2 (20-50%): Deepens, secondary characters, 3+ distinct scenes, something new every 300 words > Act 3 (50-80%): The twist, real challenge, friend/pet standout moment, moment of doubt > Act 4 (final 20%): Resolution through skill not luck, callback payoff, door left open for next adventure.

**Learning (Superhero Framework):**
Knowledge IS the superpower. 8-10 interactive pause moments where narrator asks child to answer. Pattern: present question > "Can you work it out?" > bridging pause > reveal answer with celebration. Vary delivery (villain presents challenge, embedded in action, friend discovers, trap with wrong obvious answer). Difficulty builds: easy wins first 30%, harder middle 40%, hardest final 30% combining earlier concepts.

### The Final Line Rule
Every story ends with the child's name and the phrase "This story was made just for [name]." This is the brand signature. It is the moment the parent gets emotional. Never skip it.

### Quality Checklist
- [ ] Child's name appears naturally 8+ times
- [ ] Best friend has 3+ meaningful moments
- [ ] Pet does something memorable
- [ ] Interest drives the plot
- [ ] Proud-of moment appears as confidence source
- [ ] Language matches age group
- [ ] Category guidelines followed
- [ ] Personal message flows naturally into opening
- [ ] No generic phrases that could apply to any child
- [ ] Pauses every 100-150 words
- [ ] 40%+ dialogue
- [ ] Final line includes name + "This story was made just for [name]"

---

## PART 5: KEY NUMBERS & STATUS

### Current State (as of April 2026)
- **Stories sold:** 11
- **Story attempts/previews:** 9
- **Page views tracked:** 1,981
- **Referral links:** 8
- **Registered creators:** 7 (Eva, Jamie, Molly, Paul, Sonya + 2 others)
- **Content pieces claimed:** 2 (Molly Craven: #30 and #38)
- **Narrator voices:** 22 (12 female, 10 male)
- **Comedy styles:** 8 (Epic Movie, Documentary, Breaking News, Fairy Tale, Sports Commentary, Horror Trailer, Heist Movie, Romance)
- **Music tracks:** 2 (adventure-ambient.mp3, bedtime-ambient.mp3)
- **Video export formats:** MP4 (preferred), WebM (fallback)
- **Video aspect ratios:** 9:16, 16:9, 1:1, 4:5

### Deployment
- **Netlify site:** storytold (Dev plan), deploy status: Ready
- **Live URL:** https://storytold.ai
- **Supabase project:** storytold (sxypxaahnknqnlqmorjc), EU West, Active & Healthy, Postgres 17.6
- **Supabase tables:** 11 (stories, story_attempts, page_views, referrals, content_creators, content_takes, auth_tokens, login_codes, login_attempts, rate_limits, error_logs)

### Key Files
| Component | Path |
|-----------|------|
| Landing page | `/public/index.html` |
| Dashboard | `/public/dashboard.html` |
| Creator dashboard | `/public/creator-dashboard.html` |
| Content studio | `/public/studio.html` |
| Referral page | `/public/referral.html` |
| Admin dashboard | `/public/admin.html` |
| Story prompts | `/netlify/functions/lib/story-prompts.mjs` |
| Preview generation | `/netlify/functions/generate-preview.mjs` |
| Full story worker | `/netlify/functions/full-worker-background.mjs` |
| Stripe checkout | `/netlify/functions/create-checkout.mjs` |
| Stripe webhook | `/netlify/functions/stripe-webhook.mjs` |
| Studio AI director | `/netlify/functions/studio-director.mjs` |
| Studio generator | `/netlify/functions/studio-generate.mjs` |
| Comedy worker (background) | `/netlify/functions/comedy-worker-background.mjs` |
| Comedy status polling | `/netlify/functions/comedy-status.mjs` |
| Email sending | `/netlify/functions/send-email.mjs` |
| Content briefs | `/Storytold-Creator-Content-Briefs.md` |
| Complete Claude brief | `/Storytold-Complete-Claude-Brief.md` |
