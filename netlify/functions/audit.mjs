// Full end-to-end audit of the payment + story generation flow
// Tests every step a real customer goes through

export default async (req) => {
  const start = Date.now();
  const audit = {
    timestamp: new Date().toISOString(),
    tests: [],
    errors: [],
    warnings: []
  };

  function pass(name, detail) { audit.tests.push({ name, status: 'PASS', detail, ms: Date.now() - start }); }
  function fail(name, detail) { audit.tests.push({ name, status: 'FAIL', detail, ms: Date.now() - start }); audit.errors.push(name + ': ' + detail); }
  function warn(name, detail) { audit.tests.push({ name, status: 'WARN', detail, ms: Date.now() - start }); audit.warnings.push(name + ': ' + detail); }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  // ═══════════════════════════════════════════════════════════
  // TEST 1: Create a Stripe checkout session (like unlockFull does)
  // ═══════════════════════════════════════════════════════════
  let stripeSessionId = null;
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price_data: { currency: 'gbp', product_data: { name: 'AUDIT TEST - DO NOT PAY' }, unit_amount: 100 }, quantity: 1 }],
      mode: 'payment',
      success_url: 'https://storytold.ai?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://storytold.ai',
      metadata: { childName: 'AuditTest', category: 'bedtime', audit: 'true' }
    });
    stripeSessionId = session.id;
    pass('1. Stripe checkout creation', 'Session created: ' + session.id.slice(0, 30) + '...');
  } catch (e) {
    fail('1. Stripe checkout creation', e.message);
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 2: Save pending story data to Supabase (like create-checkout does)
  // ═══════════════════════════════════════════════════════════
  const testSessionId = stripeSessionId || 'audit_test_' + Date.now();
  const testPendingData = JSON.stringify({
    storyData: { childName: 'AuditChild', category: 'bedtime', age: '5', gender: 'neutral', friendName: 'TestFriend', themes: ['space'] },
    previewStoryText: 'Once upon a time, AuditChild looked up at the stars and wondered what was out there.',
    selectedVoiceId: 'EXAVITQu4vr4xnSDxMaL'
  });

  try {
    const saveRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/pending/${testSessionId}.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: testPendingData
    });
    if (saveRes.ok) {
      pass('2. Save pending story to Supabase', 'Saved to pending/' + testSessionId.slice(0, 20) + '...');
    } else {
      const errText = await saveRes.text();
      fail('2. Save pending story to Supabase', 'HTTP ' + saveRes.status + ': ' + errText.slice(0, 200));
    }
  } catch (e) {
    fail('2. Save pending story to Supabase', e.message);
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 3: Recover pending story data (like get-pending-story does)
  // ═══════════════════════════════════════════════════════════
  try {
    const getRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/pending/${testSessionId}.json`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey
      }
    });
    if (getRes.ok) {
      const data = await getRes.json();
      if (data.storyData && data.storyData.childName === 'AuditChild') {
        pass('3. Recover pending story from Supabase', 'Data recovered, child: ' + data.storyData.childName);
      } else {
        fail('3. Recover pending story from Supabase', 'Data recovered but content is wrong: ' + JSON.stringify(data).slice(0, 100));
      }
    } else {
      fail('3. Recover pending story from Supabase', 'HTTP ' + getRes.status);
    }
  } catch (e) {
    fail('3. Recover pending story from Supabase', e.message);
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 4: Verify payment endpoint works (like handleStripeReturn does)
  // ═══════════════════════════════════════════════════════════
  if (stripeSessionId) {
    try {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
      // It won't be paid (we didn't pay), but the retrieval should work
      if (session && session.id) {
        pass('4. Verify payment (session retrieval)', 'Session retrieved, payment_status: ' + session.payment_status + ' (expected: unpaid for audit)');
      } else {
        fail('4. Verify payment (session retrieval)', 'Session not found');
      }
    } catch (e) {
      fail('4. Verify payment (session retrieval)', e.message);
    }
  } else {
    warn('4. Verify payment', 'Skipped (no Stripe session created)');
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 5: Background function trigger (like handleStripeReturn does)
  // ═══════════════════════════════════════════════════════════
  const testJobId = 'audit_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  try {
    // We call the INTERNAL Netlify function URL
    const siteUrl = process.env.URL || 'https://storytold.ai';
    const bgRes = await fetch(`${siteUrl}/.netlify/functions/full-worker-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storyData: { childName: 'AuditChild', category: 'bedtime', age: '5', gender: 'neutral', friendName: 'TestFriend', themes: ['space'], hasPet: false },
        previewStory: 'Once upon a time, AuditChild looked up at the stars and wondered what was out there. The night sky sparkled with a thousand tiny lights.',
        voiceId: 'EXAVITQu4vr4xnSDxMaL',
        childName: 'AuditChild',
        sessionId: 'audit_' + Date.now(),
        jobId: testJobId
      })
    });
    if (bgRes.status === 202) {
      pass('5. Background function trigger', 'Returned 202 (accepted). Job ID: ' + testJobId);
    } else {
      fail('5. Background function trigger', 'Expected 202, got ' + bgRes.status + ': ' + await bgRes.text().catch(() => ''));
    }
  } catch (e) {
    fail('5. Background function trigger', e.message);
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 6: Poll for job result (like pollForFull does)
  // Wait up to 90 seconds for the audit story to generate
  // ═══════════════════════════════════════════════════════════
  let storyGenerated = false;
  let audioUrl = null;
  try {
    const maxWait = 90; // seconds
    const pollInterval = 3; // seconds
    let attempts = 0;

    while (attempts < maxWait / pollInterval) {
      await new Promise(r => setTimeout(r, pollInterval * 1000));
      attempts++;

      const checkRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/full-jobs/${testJobId}.json`, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey
        }
      });

      if (checkRes.ok) {
        const result = await checkRes.json();
        if (result.success) {
          audioUrl = result.audioUrl;
          storyGenerated = true;
          pass('6. Story generation + polling', 'Story generated in ~' + (attempts * pollInterval) + 's. Audio URL: ' + (audioUrl || 'none').slice(0, 60) + '...');
          break;
        } else if (result.error) {
          fail('6. Story generation + polling', 'Function returned error: ' + result.error);
          break;
        }
      }
      // Not ready yet, keep polling
    }

    if (!storyGenerated && audit.tests.every(t => t.name !== '6. Story generation + polling')) {
      fail('6. Story generation + polling', 'Timed out after ' + maxWait + 's. Job result never appeared in Supabase storage. The background function may have crashed.');
    }
  } catch (e) {
    fail('6. Story generation + polling', e.message);
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 7: Verify audio URL is accessible (if story generated)
  // ═══════════════════════════════════════════════════════════
  if (audioUrl) {
    try {
      const audioRes = await fetch(audioUrl, { method: 'HEAD' });
      if (audioRes.ok) {
        const size = audioRes.headers.get('content-length');
        const type = audioRes.headers.get('content-type');
        pass('7. Audio file accessible', 'Type: ' + type + ', Size: ' + Math.round(size / 1024) + 'KB');
      } else {
        fail('7. Audio file accessible', 'HTTP ' + audioRes.status);
      }
    } catch (e) {
      fail('7. Audio file accessible', e.message);
    }
  } else {
    warn('7. Audio file accessible', 'Skipped (no audio URL from step 6)');
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 8: Save story to database (like handleStripeReturn does)
  // ═══════════════════════════════════════════════════════════
  try {
    const saveRes = await fetch(`${supabaseUrl}/rest/v1/stories`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        email: 'audit@storytold.ai',
        child_name: 'AuditChild',
        category: 'bedtime',
        voice_id: 'EXAVITQu4vr4xnSDxMaL',
        audio_url: audioUrl || 'https://audit-test.example.com/test.mp3',
        stripe_session_id: 'audit_' + Date.now(),
        is_gift: false,
        story_data: { childName: 'AuditChild', category: 'bedtime' }
      })
    });
    if (saveRes.ok) {
      const saved = await saveRes.json();
      const id = Array.isArray(saved) ? saved[0]?.id : saved?.id;
      pass('8. Save story to database', 'Story saved, ID: ' + id);

      // Clean up: delete the audit story
      if (id) {
        await fetch(`${supabaseUrl}/rest/v1/stories?id=eq.${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
        });
      }
    } else {
      const errText = await saveRes.text();
      fail('8. Save story to database', 'HTTP ' + saveRes.status + ': ' + errText.slice(0, 200));
    }
  } catch (e) {
    fail('8. Save story to database', e.message);
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 9: Check-full endpoint (the polling endpoint the client uses)
  // ═══════════════════════════════════════════════════════════
  try {
    const checkRes = await fetch(`${supabaseUrl}/storage/v1/object/stories/full-jobs/${testJobId}.json`, {
      headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
    });
    if (checkRes.ok) {
      pass('9. Check-full polling endpoint', 'Job result found and readable');
    } else {
      if (storyGenerated) {
        fail('9. Check-full polling endpoint', 'Job was generated but result not readable: HTTP ' + checkRes.status);
      } else {
        warn('9. Check-full polling endpoint', 'No result (expected since step 6 may have failed)');
      }
    }
  } catch (e) {
    fail('9. Check-full polling endpoint', e.message);
  }

  // ═══════════════════════════════════════════════════════════
  // CLEANUP: Remove test files from Supabase storage
  // ═══════════════════════════════════════════════════════════
  try {
    await fetch(`${supabaseUrl}/storage/v1/object/stories/pending/${testSessionId}.json`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
    });
    await fetch(`${supabaseUrl}/storage/v1/object/stories/full-jobs/${testJobId}.json`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey }
    });
  } catch (e) { /* cleanup, don't care */ }

  // If Stripe session was created, expire it
  if (stripeSessionId) {
    try {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      await stripe.checkout.sessions.expire(stripeSessionId);
    } catch (e) { /* non-critical */ }
  }

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  const passed = audit.tests.filter(t => t.status === 'PASS').length;
  const failed = audit.tests.filter(t => t.status === 'FAIL').length;
  const warned = audit.tests.filter(t => t.status === 'WARN').length;
  audit.summary = {
    total: audit.tests.length,
    passed,
    failed,
    warnings: warned,
    totalTimeMs: Date.now() - start,
    verdict: failed === 0 ? 'ALL TESTS PASSED - flow is working end to end' : failed + ' TESTS FAILED - see errors above'
  };

  return new Response(JSON.stringify(audit, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { path: '/api/audit' };
