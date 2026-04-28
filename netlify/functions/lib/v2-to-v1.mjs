// Converts the v2 funnel's storyData shape into the v1 shape that the existing
// middle-layer prompt + brief-analyst expects. The production pipeline does not
// change — only the field names from the new funnel are mapped.

const KIND_TO_CATEGORY = { bedtime: 'bedtime', adventure: 'journey' };

// Convert age band ("4-5") to a midpoint integer (4)
function ageBandToInt(band) {
  if (!band) return null;
  if (band === '8+') return 8;
  const m = band.match(/^(\d+)/);
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
    favTeddy: ''
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
    siblingDynamics: '',

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

    // Villain (none in v2 yet — adventures don't have villain switch)
    villainToggle: '',
    villainName: '',
    villainSection: '',
    hasVillain: false,

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
