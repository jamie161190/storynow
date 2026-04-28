// 5 email templates for the paid v2 flow.
// Plain HTML strings (not React Email). All render with inlined styles for max client compatibility.
// All return { subject, html, text } objects.

const PAPER = '#F4ECDB';
const INK = '#1F1B2E';
const PLUM = '#4B2E83';
const TERRA = '#D87A3E';
const MUTED = '#5C5240';
const LINE = 'rgba(31,27,46,0.12)';

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
}

function frame({ title, body }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-font-smoothing:antialiased">
<div style="max-width:600px;margin:0 auto;background:${PAPER};padding:40px 24px;font-family:'Cormorant Garamond',Georgia,serif;color:${INK};font-size:16px;line-height:1.6">
  ${body}
  <hr style="border:0;border-top:1px solid ${LINE};margin:32px 0 18px">
  <div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:11px;color:rgba(31,27,46,0.55);text-align:center;line-height:1.65">
    HearTheirName · made by Jamie + family<br>
    Reply to this email if anything's wrong, you'll get me (Jamie) personally.<br>
    <a href="https://heartheirname.com/account" style="color:rgba(31,27,46,0.55);text-decoration:underline">My account</a> · <a href="https://heartheirname.com/privacy" style="color:rgba(31,27,46,0.55);text-decoration:underline">Privacy</a>
  </div>
</div>
</body></html>`;
}

function btn(href, label, style = 'ink') {
  const bg = style === 'terra' ? TERRA : INK;
  const fg = '#F4ECDB';
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0"><tr><td>
    <a href="${esc(href)}" style="display:inline-block;padding:15px 28px;background:${bg};color:${fg};border-radius:10px;text-decoration:none;font-family:'Inter',Arial,sans-serif;font-size:15px;font-weight:600">${esc(label)}</a>
  </td></tr></table>`;
}

// 1. Verify ─────────────────────────────────────────────────────────
export function emailVerify({ firstName, childList, verifyUrl }) {
  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hi,';
  const body = `
    <p style="margin:0 0 14px">${greeting}</p>
    <p style="margin:0 0 14px">Thanks for trusting me with ${esc(childList)}'s first story. Just one quick thing before I get started: tap the button below to confirm this email is yours, otherwise the preview will end up lost in spam.</p>
    <p style="margin:0 0 22px">Once you click, I'll start writing tonight. You'll get the 2-minute preview within 24 hours, sometimes much sooner if I'm at my desk.</p>
    ${btn(verifyUrl, 'Confirm my email', 'ink')}
    <p style="margin:24px 0 0;font-style:italic;color:${PLUM}">Speak soon,<br>Jamie</p>
    <p style="margin:24px 0 0;font-size:13px;color:${MUTED};font-family:'Inter',Arial,sans-serif">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all;color:${PLUM}">${esc(verifyUrl)}</span></p>
  `;
  return {
    subject: `Confirm your email so I can send ${childList}'s preview`,
    html: frame({ title: 'Confirm your email', body }),
    text: `${greeting}\n\nThanks for trusting me with ${childList}'s first story. Tap the link below to confirm this email is yours.\n\n${verifyUrl}\n\nOnce you click, I'll start writing tonight.\n\nSpeak soon,\nJamie\n\n— HearTheirName · jamie@heartheirname.com`
  };
}

// 2. Preview ready ───────────────────────────────────────────────────
export function emailPreviewReady({ firstName, childList, previewTitle, previewUrl }) {
  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hi,';
  const titleText = previewTitle || `${childList}'s story`;
  const body = `
    <p style="margin:0 0 14px">${greeting}</p>
    <p style="margin:0 0 14px">I sat with what you sent us. ${esc(childList)} sounds like a wonder. The bit about the toy wrote itself.</p>
    <p style="margin:0 0 22px">Here's the first two minutes. Press play with ${esc(childList)}. See what their face does.</p>
    ${btn(previewUrl, `Listen to ${childList}'s preview`, 'terra')}
    <p style="margin:22px 0 14px">If that gave you the feeling we hoped, the full 15-minute version is one click away from the player. We'll have it back to you by tomorrow evening.</p>
    <p style="margin:0 0 14px">If something's off — name pronounced wrong, a detail not quite right — just hit reply and tell me. I'll redo it.</p>
    <p style="margin:24px 0 0;font-style:italic;color:${PLUM}">Hope it lands,<br>Jamie</p>
  `;
  return {
    subject: `${childList}'s 2-minute preview is ready`,
    html: frame({ title: 'Your preview is ready', body }),
    text: `${greeting}\n\n${childList}'s 2-minute preview is ready to listen to.\n\nListen here: ${previewUrl}\n\nIf the preview lands, the full 15-minute version is £24.99, available from the player. Reply if anything's off — I'll re-record it.\n\nJamie\n— HearTheirName · jamie@heartheirname.com`
  };
}

// 3. Receipt (paid) ──────────────────────────────────────────────────
export function emailReceipt({ firstName, childList, orderRef, amountGbp, statusUrl }) {
  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hi,';
  const body = `
    <p style="margin:0 0 14px">${greeting}</p>
    <p style="margin:0 0 14px">Brilliant. I'm starting work on ${esc(childList)}'s full 15-minute story tonight, and I'll have it with you by <strong>tomorrow, 7pm UK time</strong>.</p>
    <div style="background:#F0E8D7;border-radius:10px;padding:18px 22px;margin:24px 0;font-size:14px;font-family:'Inter',Arial,sans-serif">
      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(31,27,46,0.55);margin-bottom:10px;letter-spacing:0.06em;text-transform:uppercase">ORDER ${esc(orderRef)}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span>${esc(childList)}'s full story</span><span style="font-weight:600">£${amountGbp.toFixed(2)}</span>
      </div>
      <hr style="border:0;border-top:1px solid ${LINE};margin:10px 0">
      <div style="display:flex;justify-content:space-between;font-weight:600">
        <span>Total</span><span>£${amountGbp.toFixed(2)}</span>
      </div>
      <div style="font-size:12px;color:rgba(31,27,46,0.55);margin-top:8px">Paid via Stripe</div>
    </div>
    <p style="margin:0 0 12px"><strong>What happens next:</strong></p>
    <ol style="padding-left:20px;margin:0 0 18px;font-family:'Inter',Arial,sans-serif;font-size:14px;line-height:1.65">
      <li style="margin-bottom:6px">I record the full story tonight (about 3 hours of work).</li>
      <li style="margin-bottom:6px">You get an email tomorrow with a private link to listen + download.</li>
      <li style="margin-bottom:6px">It lives in your account forever, listen as many times as you like.</li>
    </ol>
    ${btn(statusUrl, 'View order status', 'ink')}
    <p style="margin:24px 0 0;font-style:italic;color:${PLUM}">Talk tomorrow,<br>Jamie</p>
  `;
  return {
    subject: `Order confirmed, ${childList}'s full story is on the way`,
    html: frame({ title: 'Order confirmed', body }),
    text: `${greeting}\n\nBrilliant. Starting on ${childList}'s full story tonight — you'll have it by tomorrow 7pm UK.\n\nOrder ${orderRef} · £${amountGbp.toFixed(2)} · Paid via Stripe\n\nView status: ${statusUrl}\n\nTalk tomorrow,\nJamie`
  };
}

// 4. Story ready (full) ──────────────────────────────────────────────
export function emailStoryReady({ firstName, childList, storyTitle, storyUrl, mp3Url, jamieNote }) {
  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hi,';
  const body = `
    <p style="margin:0 0 14px">${greeting}</p>
    <p style="margin:0 0 14px">It's done. ${esc(childList)}'s full story${storyTitle ? `, <em style="color:${PLUM}">${esc(storyTitle)}</em>` : ''}, just under 16 minutes.</p>
    ${jamieNote ? `<p style="margin:0 0 14px">A small note from me: ${esc(jamieNote)}</p>` : ''}
    <p style="margin:0 0 22px">You can stream it from the link below, or download the MP3 to play offline. It's yours forever.</p>
    ${btn(storyUrl, `Listen to ${childList}'s story`, 'terra')}
    ${mp3Url ? `<p style="margin:14px 0 0;font-size:13px;color:${MUTED};font-family:'Inter',Arial,sans-serif">Or download MP3: <a href="${esc(mp3Url)}" style="color:${PLUM}">${esc(mp3Url)}</a></p>` : ''}
    <p style="margin:18px 0 0;padding:14px 18px;background:#F0E8D7;border-radius:10px;font-size:14px;font-family:'Inter',Arial,sans-serif"><strong>If something's not right:</strong> hit reply within 14 days and I'll re-record any line, fix any pronunciation, or refund the lot. No drama.</p>
    <p style="margin:24px 0 0;font-style:italic;color:${PLUM}">Sleep tight,<br>Jamie</p>
    <p style="font-family:'Caveat',cursive;font-size:22px;color:${PLUM};margin-top:6px">P.S. If they love it, would you tell one other parent? It's how I keep this going.</p>
  `;
  return {
    subject: `${childList}'s story is ready`,
    html: frame({ title: 'Your story is ready', body }),
    text: `${greeting}\n\nIt's done. ${childList}'s full story is ready.\n\nListen: ${storyUrl}\n${mp3Url ? `Download MP3: ${mp3Url}\n` : ''}\nIf something's not right within 14 days, just reply.\n\nJamie\n\nP.S. If they love it, would you tell one other parent?`
  };
}

// 5. Gift claim ──────────────────────────────────────────────────────
export function emailGiftClaim({ recipientName, fromName, childName, giftMessage, claimUrl }) {
  const greeting = recipientName ? `Hi ${esc(recipientName)},` : 'Hi,';
  const body = `
    <p style="margin:0 0 14px">${greeting}</p>
    <p style="margin:0 0 14px"><strong>${esc(fromName)}</strong> has commissioned a one-of-a-kind audio story for ${esc(childName)}, and asked us to send it your way.</p>
    <p style="margin:0 0 14px">It's a 15-minute audio story, hand-written and recorded around the details ${esc(fromName)} shared with us about ${esc(childName)} — their name woven through, their favourite toy, the people they love.</p>
    <p style="margin:0 0 22px">Click the button to set up your account and listen. The story's already paid for — you just need to claim it.</p>
    ${btn(claimUrl, `Claim ${childName}'s story`, 'terra')}
    ${giftMessage ? `<p style="margin:18px 0 0;padding:14px 18px;background:#F0E8D7;border-radius:10px;font-size:14px;font-family:'Inter',Arial,sans-serif;font-style:italic;border-left:3px solid ${PLUM}">"${esc(giftMessage)}"<br><span style="font-style:normal;color:${MUTED};font-size:13px">— ${esc(fromName)}</span></p>` : ''}
    <p style="margin:24px 0 0;font-style:italic;color:${PLUM}">Hope ${esc(childName)} loves it,<br>Jamie</p>
  `;
  return {
    subject: `${fromName} just made ${childName} something special`,
    html: frame({ title: 'A gift is waiting', body }),
    text: `${greeting}\n\n${fromName} has commissioned an audio story for ${childName}.\n\nClaim it here: ${claimUrl}\n\n${giftMessage ? `"${giftMessage}" — ${fromName}\n\n` : ''}Jamie`
  };
}
