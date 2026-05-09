// Shared name-list formatting. One child: "Alice". Two: "Alice and Bob".
// Three+: "Alice, Bob and Carol" (no Oxford comma — UK style).
//
// formatNameList(arr): build from an array of names.
// normalizeNameList(str): fix already-stored child_name strings on read.
// Handles legacy formats: "A & B", "A, B, C", "A and B and C", trailing
// spaces around commas.

export function formatNameList(names) {
  const clean = (Array.isArray(names) ? names : [])
    .map(n => (n == null ? '' : String(n).trim()))
    .filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

export function normalizeNameList(str) {
  if (!str || typeof str !== 'string') return str;
  const parts = str
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return str.trim();
  return formatNameList(parts);
}
