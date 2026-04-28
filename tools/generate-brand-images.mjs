#!/usr/bin/env node
// Generate 6 brand images per the design handoff prompts. Uses OpenAI gpt-image-1.
//
// Usage:
//   OPENAI_API_KEY=sk-... node tools/generate-brand-images.mjs
//
// Writes to public/images/brand/{slot}.jpg
//
// Note: AI-generated images stand in for editorial photography. The founder
// portrait obviously will not be the real Jamie + Chase — replace those when
// you commission a real shoot.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'images', 'brand');
mkdirSync(OUT, { recursive: true });

const PROMPTS = [
  {
    slot: 'founder-portrait',
    size: '1024x1024',
    prompt: `Editorial portrait photograph of a 38-year-old white British man named Jamie, seated in a soft-lit home study at golden hour, gently holding his 4-year-old son on his lap. Both are smiling but not laughing. Jamie wears a faded navy crewneck jumper. His son wears striped pyjamas. Behind them, a wall of books and one framed crayon drawing. Shot on a Pentax 67 with Portra 400 film, slight grain, warm tones, shallow depth of field, natural window light from camera left. Warm cream walls. Composition: rule of thirds, faces in upper third, eye-level. No text overlays. No retouching beyond film grain. Soft, intimate, honest, slightly melancholic.`
  },
  {
    slot: 'editorial-bedtime',
    size: '1792x1024',
    prompt: `Editorial photograph of a parent and a 5-year-old child curled together on a bed in soft lamplight, the child holding a small phone or audio device near their ear, eyes closed, smiling slightly as if listening to something funny. The parent is reading a book in their lap, only partially visible from the side. Bedroom is warm and lived-in: knitted blanket, crumpled duvet in faded ochre, one battered stuffed fox on the pillow. Shot on medium format film, Portra 400, lit by a single warm bedside lamp casting a gentle yellow glow. Slight grain. Soft, hushed, late-evening atmosphere. No phone screens visible, no brand logos. Composition: child's face in upper-right third, soft negative space lower-left for type overlay.`
  },
  {
    slot: 'parent-listen',
    size: '1024x1792',
    prompt: `Photograph of a 35-year-old mother sitting on a kitchen floor with her back against a cabinet, holding her phone with one earbud in, the other earbud dangling, smiling softly to herself as if listening to something unexpectedly moving. Late afternoon light through a window. She wears a cream cardigan. The kitchen is unstaged, lived-in: a tea towel, one mug on the counter behind her. Shot on 35mm film, Portra 400, slight grain, natural light. Honest, candid, a quiet moment. No brand logos visible.`
  },
  {
    slot: 'grandparent-grandchild',
    size: '1024x1280',
    prompt: `Editorial photograph of a grandparent (around 65, warm smile, soft cardigan) and a 6-year-old grandchild sitting close together on a sofa in late afternoon light. Both are listening to a phone propped between them on a side table, leaning slightly toward each other. The room has warm cream walls, soft cushions, an open book beside them. Shot on medium format, Portra 400, natural window light, slight grain, warm tones. Honest, intimate, generational. No brand logos, no screens visible.`
  },
  {
    slot: 'jamies-desk',
    size: '1024x1280',
    prompt: `Detail photograph of a writer's home-studio desk at night, lit by a single desk lamp. On the desk: an open notebook with handwritten margin notes, a chunky pair of studio headphones, a small audio interface with knobs, a half-drunk mug of tea on a coaster, a ceramic plate with a single biscuit, a framed crayon drawing leaning on the back wall. Wood grain visible. Shallow depth of field, warm tungsten light, slight grain, 50mm lens. No screens or brand logos visible. Quiet, late-evening, working atmosphere.`
  },
  {
    slot: 'children-collage',
    size: '1792x1024',
    prompt: `Series of 4 candid editorial portraits of children aged 3-8, diverse in ethnicity and gender, each in a different domestic setting (bedroom, garden, kitchen, sofa). One mid-laugh, one drawing, one with a stuffed animal, one peeking around a doorway. Shot on medium format film, Portra 400, soft natural light, shallow depth of field, slight grain. Warm domestic palette: cream walls, ochre, dusty blue. No brand items visible. Composition: each child centred, face in upper third. Arranged as a horizontal strip of 4 portraits.`
  }
];

async function generate(prompt, size) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size,
      quality: 'high',
      n: 1
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data in response');
  return Buffer.from(b64, 'base64');
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY required');
    process.exit(1);
  }

  for (const p of PROMPTS) {
    try {
      console.log(`Generating ${p.slot} (${p.size})…`);
      const buf = await generate(p.prompt, p.size);
      const out = join(OUT, `${p.slot}.png`);
      writeFileSync(out, buf);
      console.log(`  → ${out}`);
    } catch (e) {
      console.error(`  ✗ ${p.slot}: ${e.message}`);
    }
  }
  console.log('\nDone. Images in public/images/brand/');
  console.log('Next: replace the .inside-img / .gift-img / .founder-img placeholder blocks in public/index.html with <img src="/images/brand/..."> tags.');
}

main();
