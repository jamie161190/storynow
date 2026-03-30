// Edge Function: serves dynamic OG meta tags for shared story links
// so WhatsApp, Facebook, etc. show "Listen to Chase's story" instead of generic site info

const BOT_UA = /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|bot|crawl|spider|preview/i;

export default async (request, context) => {
  const url = new URL(request.url);
  const listenId = url.searchParams.get('listen');

  // Only intercept if there's a listen param
  if (!listenId) {
    return context.next();
  }

  const ua = request.headers.get('user-agent') || '';

  // Only serve custom HTML to social media bots/crawlers
  // Real browsers get the normal SPA which handles it via JS
  if (!BOT_UA.test(ua)) {
    return context.next();
  }

  // Fetch story details from Supabase
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SECRET_KEY');

    const res = await fetch(
      `${supabaseUrl}/rest/v1/stories?id=eq.${encodeURIComponent(listenId)}&select=child_name,category,gift_message`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!res.ok) {
      return context.next();
    }

    const stories = await res.json();

    if (!stories.length) {
      return context.next();
    }

    const story = stories[0];
    const childName = story.child_name || 'your child';
    const category = story.category || 'story';

    const categoryLabel = {
      bedtime: 'bedtime story',
      journey: 'adventure',
      learning: 'learning story'
    }[category] || 'story';

    const ogTitle = `Listen to ${childName}'s personalised ${categoryLabel}`;
    const ogDescription = story.gift_message
      ? `${story.gift_message.substring(0, 140)}... Made with Storytold.`
      : `A one of a kind audio ${categoryLabel} created just for ${childName}. Their name, their friends, their world. Made with Storytold.`;
    const ogUrl = `https://storytold.ai/?listen=${encodeURIComponent(listenId)}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${ogTitle} | Storytold</title>
<meta name="description" content="${ogDescription}">
<meta property="og:type" content="website">
<meta property="og:url" content="${ogUrl}">
<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDescription}">
<meta property="og:image" content="https://storytold.ai/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="Storytold">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${ogTitle}">
<meta name="twitter:description" content="${ogDescription}">
<meta name="twitter:image" content="https://storytold.ai/og-image.png">
</head>
<body>
<p>Redirecting to ${childName}'s story...</p>
<script>window.location.href = "${ogUrl}";</script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });

  } catch (err) {
    console.error('OG edge function error:', err);
    return context.next();
  }
};

export const config = { path: '/' };
