// Converts the v2 funnel's storyData shape into the v1 shape that the existing
// middle-layer prompt + brief-analyst expects. The production pipeline does not
// change: only the field names from the new funnel are mapped.

const KIND_TO_CATEGORY = { bedtime: 'bedtime', adventure: 'journey' };

// Convert age band ("4-5") to a midpoint integer (4). Tolerates raw numbers too.
function ageBandToInt(band) {
  if (band == null || band === '') return null;
  if (typeof band === 'number') return Number.isFinite(band) ? Math.floor(band) : null;
  const s = String(band);
  if (s === '8+') return 8;
  const m = s.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function v2ToV1(v2) {
  if (!v2 || typeof v2 !== 'object') return v2;
  // If it already looks v1 (has childName), pass through.
  if (v2.childName && !v2.children) return v2;

  const children = (v2.children || []).map(c => ({
    name: c.name,
    age: ageBandToInt(c.age) || c.age,
    gender: c.pronouns ? (c.pronouns.toLowerCase().includes('she') ? 'girl' : c.pronouns.toLowerCase().includes('he') ? 'boy' : 'they') : 'they',
    pronouns: c.pronouns,
    // Per-child fields (all optional — empty string when the parent didn't
    // fill in). The brief analyst is instructed to prefer per-child values
    // over the shared top-level fallbacks (favTeddy / extraDetails / friendName)
    // and to surface them in each child's portrait so the writer can use
    // them in scenes featuring that child.
    favTeddy: (c.toy || '').trim(),         // per-child comfort item
    bestFriend: (c.bestFriend || '').trim(), // per-child main friend
    quirk: (c.quirk || '').trim()            // per-child personality detail
  }));

  const childCount = children.length;
  const isMultiChild = childCount > 1;
  const firstChild = children[0] || {};

  return {
    // Top-level fields used by the existing prompt
    childName: isMultiChild ? children.map(c => c.name).filter(Boolean).join(' & ') : firstChild.name,
    age: firstChild.age,
    gender: firstChild.gender,
    isMultiChild,
    children,
    // Sibling dynamics: free-text describing relationships, age order,
    // protective dynamics, etc. The brief writer uses this as the
    // authoritative source for who's older, who's protective, who follows
    // whom. Falls back to empty string when not supplied.
    siblingDynamics: v2.sibling_dynamics || v2.siblingDynamics || v2.siblingNote || '',
    // Extras: free-text notes that don't fit any other field. Often
    // arrives via post-purchase corrections or admin-side updates. The
    // brief writer treats this as additional authoritative context.
    extras: v2.extras || '',

    // Category mapping
    category: KIND_TO_CATEGORY[v2.storyKind] || 'bedtime',

    // Casting
    friendName: v2.bestFriend || '',
    sidekickName: '',
    familyMembers: v2.others || '',
    teacherName: '',

    // Pet
    petToggle: v2.hasPet ? 'on' : '',
    petName: v2.petName || '',
    petType: v2.petKind || '',

    // Villain (v2 villain step is shown only for adventure stories)
    villainToggle: v2.hasVillain ? 'on' : '',
    villainName: v2.villainName || '',
    villainSection: v2.hasVillain && v2.villainName ? `Villain: ${v2.villainName}` : '',
    hasVillain: !!(v2.hasVillain && v2.villainName),

    // Comfort item
    favTeddy: v2.toy || '',

    // Themes
    themes: Array.isArray(v2.themes) ? v2.themes : [],
    themeDetail: v2.themesOther || '',
    customTheme: v2.themesOther || '',

    // Setting
    setting: v2.place || '',
    customWhere: v2.placeReal || '',

    // Quirk → goes into extraDetails (the field analysers look at)
    extraDetails: v2.quirk || '',

    // Voice
    voice: v2.voice || '',

    // Gift
    isGift: !!v2.isGift,
    giftFrom: v2.giftFrom || '',
    giftMessage: v2.giftMessage || '',
    giftEmail: v2.giftRecipientEmail || '',
    giftInStoryToggle: !!v2.isGift && !!v2.giftMessage,
    personalMessage: '',

    // Misc that v1 might check
    length: 'long',
    requesterName: v2.giftFrom || ''
  };
}
