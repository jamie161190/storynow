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
    <a href="https://heartheirname.com/privacy" style="color:rgba(31,27,46,0.55);text-decoration:underline">Privacy</a>
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

// emailVerify removed: the in-browser flow doesn't collect email at signup,
// so there's never anything to verify. Customer goes from form submission
// straight to the preview page in-browser. If they want a link to come back
// to later, the "Want to listen later?" form on the preview page handles
// that path via emailPreviewReady (template 2 below).

// 1. Preview ready ───────────────────────────────────────────────────
// jamieNote (optional): a personal message Jamie types in admin before sending.
// Renders in a soft cream callout above the listen button so the customer reads
// it first. Plain text in the text body too. Use for: "if you love it, reply
// before you buy and I'll fast-track it for tonight" type personal touches.
export function emailPreviewReady({ firstName, childList, previewTitle, previewUrl, jamieNote }) {
  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hi,';
  const noteHtml = jamieNote && jamieNote.trim() ? `
    <div style="margin:0 0 22px;padding:16px 20px;background:#F0E8D7;border-left:3px solid ${PLUM};border-radius:10px;font-size:14.5px;line-height:1.6;font-family:'Inter',Arial,sans-serif;color:#1F1B2E;white-space:pre-wrap">${esc(jamieNote.trim())}<br><span style="font-style:italic;color:${PLUM};font-size:13px;display:inline-block;margin-top:6px">Jamie</span></div>
  ` : '';
  const noteText = jamieNote && jamieNote.trim() ? `\n\n${jamieNote.trim()}\nJamie\n` : '';
  const body = `
    <p style="margin:0 0 14px">${greeting}</p>
    <p style="margin:0 0 14px">${esc(childList)}'s story opening is ready to read. Open it on your own first if you can.</p>
    <p style="margin:0 0 22px">If the names, tone and feel are right, you'll know straight away. If anything's off, you can edit it right there on the page before you pay a penny.</p>
    ${noteHtml}
    ${btn(previewUrl, `Read ${childList}'s opening`, 'terra')}
    <p style="margin:22px 0 14px">From the same page you'll pick the narrator's voice and lock in the full 15-minute story. £24.99, with you within 24 hours.</p>
    <p style="margin:24px 0 0;font-style:italic;color:${PLUM}">Speak soon,<br>Jamie</p>
  `;
  return {
    subject: `${childList}'s story opening is ready`,
    html: frame({ title: 'Your story opening is ready', body }),
    text: `${greeting}\n\n${childList}'s story opening is ready to read. Open it on your own first if you can.\n\nIf the names, tone and feel are right, you'll know straight away. If anything's off, you can edit it right there on the page before you pay a penny.${noteText}\nRead it here: ${previewUrl}\n\nFrom the same page you'll pick the narrator's voice and lock in the full 15-minute story. £24.99, with you within 24 hours.\n\nSpeak soon,\nJamie\nHearTheirName · jamie@heartheirname.com`
  };
}

// 3. Receipt (paid) ──────────────────────────────────────────────────
// Kept simple and warm. No "what happens next" bullet list, no status-page
// button, no over-claiming about how the work is done. statusUrl is left in
// the signature for back-compat but no longer surfaced in the email.
export function emailReceipt({ firstName, childList, orderRef, priceDisplay, amountGbp, statusUrl }) {
  // Back-compat: older callers still pass amountGbp. New callers pass
  // priceDisplay (a fully-formatted string like "€29.99" or "A$45.99").
  const price = priceDisplay || (amountGbp != null ? `£${amountGbp.toFixed(2)}` : '');
  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hi,';
  const body = `
    <p style="margin:0 0 14px">${greeting}</p>
    <p style="margin:0 0 14px">Thank you so much for your order. We're going to start working on ${esc(childList)}'s full story now, and you should receive it within 24 hours.</p>
    <div style="background:#F0E8D7;border-radius:10px;padding:18px 22px;margin:24px 0;font-size:14px;font-family:'Inter',Arial,sans-serif">
      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(31,27,46,0.55);margin-bottom:10px;letter-spacing:0.06em;text-transform:uppercase">ORDER ${esc(orderRef)}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span>${esc(childList)}'s full story</span><span style="font-weight:600">${esc(price)}</span>
      </div>
      <hr style="border:0;border-top:1px solid ${LINE};margin:10px 0">
      <div style="display:flex;justify-content:space-between;font-weight:600">
        <span>Total</span><span>${esc(price)}</span>
      </div>
      <div style="font-size:12px;color:rgba(31,27,46,0.55);margin-top:8px">Paid via Stripe</div>
    </div>
    <p style="margin:18px 0 0">Thanks so much for placing your trust in us.</p>
    <p style="margin:8px 0 0;font-style:italic;color:${PLUM}">Jamie and Chase</p>
  `;
  return {
    subject: `Order confirmed, ${childList}'s full story is on the way`,
    html: frame({ title: 'Order confirmed', body }),
    text: `${greeting}\n\nThank you so much for your order. We're going to start working on ${childList}'s full story now, and you should receive it within 24 hours.\n\nOrder ${orderRef} · ${price} · Paid via Stripe\n\nThanks so much for placing your trust in us.\n\nJamie and Chase\nHearTheirName · jamie@heartheirname.com`
  };
}

// 4. Story ready (full) ──────────────────────────────────────────────
// mp3Url is left in the signature for back-compat with existing callers
// but is no longer surfaced in the email. We don't offer downloads —
// streaming only via the listen page.
export function emailStoryReady({ firstName, childList, storyTitle, storyUrl, mp3Url, jamieNote }) {
  const greeting = firstName ? `Hi ${esc(firstName)},` : 'Hi,';
  const body = `
    <p style="margin:0 0 14px">${greeting}</p>
    <p style="margin:0 0 14px">It's done. ${esc(childList)}'s full story${storyTitle ? `, <em style="color:${PLUM}">${esc(storyTitle)}</em>` : ''} is ready.</p>
    ${jamieNote ? `<p style="margin:0 0 14px">A small note from me: ${esc(jamieNote)}</p>` : ''}
    <p style="margin:0 0 22px">You can stream it from the link below. It's yours forever.</p>
    ${btn(storyUrl, `Listen to ${childList}'s story`, 'terra')}
    <p style="margin:18px 0 0;padding:14px 18px;background:#F0E8D7;border-radius:10px;font-size:14px;font-family:'Inter',Arial,sans-serif"><strong>If anything isn't right:</strong> just reply to this email. I'll keep rewriting until you're happy. No amount of edits is too many.</p>
    <p style="margin:24px 0 0;font-style:italic;color:${PLUM}">Speak soon,<br>Jamie</p>
    <p style="font-family:'Caveat',cursive;font-size:22px;color:${PLUM};margin-top:6px">P.S. If you love it, would you share it with another parent? That's how we keep this going.</p>
  `;
  return {
    subject: `${childList}'s story is ready`,
    html: frame({ title: 'Your story is ready', body }),
    text: `${greeting}\n\nIt's done. ${childList}'s full story is ready.\n\nListen: ${storyUrl}\n\nIf anything isn't right, just reply. I'll keep rewriting until you're happy. No amount of edits is too many.\n\nJamie\n\nP.S. If you love it, would you share it with another parent? That's how we keep this going.`
  };
}

// 5. Gift claim ──────────────────────────────────────────────────────
export function emailGiftClaim({ recipientName, fromName, childName, giftMessage, claimUrl }) {
  const greeting = recipientName ? `Hi ${esc(recipientName)},` : 'Hi,';
  const body = `
    <p style="margin:0 0 14px">${greeting}</p>
    <p style="margin:0 0 14px"><strong>${esc(fromName)}</strong> has commissioned a one-of-a-kind audio story for ${esc(childName)}, and asked us to send it your way.</p>
    <p style="margin:0 0 14px">It's a 15-minute audio story written around the details ${esc(fromName)} shared with us about ${esc(childName)}. Their name woven through, their favourite toy, the people they love.</p>
    <p style="margin:0 0 22px">Tap the button to listen. The story's already paid for, it's yours to keep.</p>
    ${btn(claimUrl, `Listen to ${childName}'s story`, 'terra')}
    ${giftMessage ? `<p style="margin:18px 0 0;padding:14px 18px;background:#F0E8D7;border-radius:10px;font-size:14px;font-family:'Inter',Arial,sans-serif;font-style:italic;border-left:3px solid ${PLUM}">"${esc(giftMessage)}"<br><span style="font-style:normal;color:${MUTED};font-size:13px">${esc(fromName)}</span></p>` : ''}
    <p style="margin:24px 0 0;font-style:italic;color:${PLUM}">Hope ${esc(childName)} loves it,<br>Jamie</p>
  `;
  return {
    subject: `${fromName} just made ${childName} something special`,
    html: frame({ title: 'A gift is waiting', body }),
    text: `${greeting}\n\n${fromName} has commissioned an audio story for ${childName}.\n\nClaim it here: ${claimUrl}\n\n${giftMessage ? `"${giftMessage}" (${fromName})\n\n` : ''}Jamie`
  };
}
