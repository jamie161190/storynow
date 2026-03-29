// Transactional email sending via Resend
// Set RESEND_API_KEY in Netlify env vars after creating account at resend.com

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    const { type, to, childName, giftFrom, giftMessage, category, length } = await req.json();

    if (!type || !to) {
      return new Response(JSON.stringify({ error: 'Missing type or recipient email' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const apiKey = Netlify.env.get('RESEND_API_KEY');
    if (!apiKey) {
      console.error('RESEND_API_KEY not set');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    let subject, html;

    if (type === 'purchase') {
      subject = `${childName}'s story is ready! 🎧`;
      html = purchaseEmail(childName, category, length);
    } else if (type === 'gift') {
      subject = `${giftFrom} made something special for ${childName} 🎁`;
      html = giftEmail(childName, giftFrom, giftMessage);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid email type' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Storytold <hello@storytold.ai>',
        to: [to],
        subject,
        html
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Resend error:', data);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Email error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

function purchaseEmail(childName, category, length) {
  const lengthLabel = length === 'epic' ? 'Epic (~30 min)' : length === 'long' ? 'Extended (~15 min)' : 'Classic (~5 min)';
  const categoryLabel = category === 'learning' ? 'Learning Adventure' : category === 'journey' ? 'Journey Story' : 'Bedtime Story';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FEFBF6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#7C5CFC;font-size:28px;margin:0;">Storytold</h1>
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <p style="font-size:24px;text-align:center;margin:0 0 8px;">🎧</p>
      <h2 style="color:#2D2844;font-size:20px;text-align:center;margin:0 0 16px;">${childName}'s story is ready!</h2>
      <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Thank you for creating something truly special. ${childName}'s personalised audio story has been created and is ready to enjoy.
      </p>
      <div style="background:#F8F5FF;border-radius:12px;padding:16px;margin:0 0 20px;">
        <p style="margin:0 0 4px;font-size:13px;color:#999;">Story type</p>
        <p style="margin:0 0 12px;font-size:15px;color:#2D2844;font-weight:600;">${categoryLabel}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#999;">Length</p>
        <p style="margin:0;font-size:15px;color:#2D2844;font-weight:600;">${lengthLabel}</p>
      </div>
      <p style="color:#666;font-size:14px;line-height:1.6;margin:0 0 24px;">
        You can replay and download the story any time from the page where you created it. We hope ${childName} loves every second of it.
      </p>
      <div style="text-align:center;">
        <a href="https://storytold.ai" style="display:inline-block;background:#7C5CFC;color:#fff;text-decoration:none;padding:12px 32px;border-radius:50px;font-size:15px;font-weight:600;">Create another story</a>
      </div>
    </div>
    <p style="text-align:center;color:#bbb;font-size:12px;margin-top:24px;">Storytold. Audio stories that know your child by name.</p>
  </div>
</body>
</html>`;
}

function giftEmail(childName, giftFrom, giftMessage) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FEFBF6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#7C5CFC;font-size:28px;margin:0;">Storytold</h1>
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <p style="font-size:32px;text-align:center;margin:0 0 8px;">🎁</p>
      <h2 style="color:#2D2844;font-size:20px;text-align:center;margin:0 0 16px;">A special gift for ${childName}</h2>
      <p style="color:#666;font-size:15px;line-height:1.6;margin:0 0 20px;">
        ${giftFrom} has created a personalised audio story just for ${childName}. It is a one of a kind story where ${childName} is the star of the adventure.
      </p>
      ${giftMessage ? `
      <div style="background:#FFF0E5;border-radius:12px;padding:16px;margin:0 0 20px;border-left:4px solid #FF8C42;">
        <p style="margin:0 0 4px;font-size:13px;color:#999;">A message from ${giftFrom}:</p>
        <p style="margin:0;font-size:15px;color:#2D2844;font-style:italic;line-height:1.5;">"${giftMessage}"</p>
      </div>` : ''}
      <div style="text-align:center;margin:24px 0;">
        <a href="https://storytold.ai" style="display:inline-block;background:#FF8C42;color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:700;">Listen to ${childName}'s story</a>
      </div>
      <p style="color:#999;font-size:13px;text-align:center;line-height:1.5;margin:0;">
        This story was made with love using Storytold, where every child becomes the hero of their own audio adventure.
      </p>
    </div>
    <p style="text-align:center;color:#bbb;font-size:12px;margin-top:24px;">Storytold. Audio stories that know your child by name.</p>
  </div>
</body>
</html>`;
}

export const config = { path: '/api/send-email' };
