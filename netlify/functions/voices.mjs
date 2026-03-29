// DEPRECATED: This file is no longer used. Voice selection is now handled
// client-side with the ALL_VOICES array and filter system in index.html.
// Safe to delete.

export default async () => {
  return new Response(JSON.stringify({ error: 'This endpoint is deprecated. Voice selection is now handled client-side.' }), {
    status: 410, headers: { 'Content-Type': 'application/json' }
  });
};
export const config = { path: '/api/voices/:category' };
