// Shared error logging helper. Writes to the error_logs Supabase table.
// Non-blocking: catches its own errors so it never breaks the caller.

export async function logError({ source, message, severity = 'error', childName, customerEmail, jobId, details }) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    const row = {
      source,
      message: String(message).slice(0, 2000),
      severity,
    };
    if (childName) row.child_name = childName;
    if (customerEmail) row.customer_email = customerEmail;
    if (jobId) row.job_id = jobId;
    if (details) row.details = typeof details === 'string' ? { raw: details } : details;

    await fetch(`${supabaseUrl}/rest/v1/error_logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });
  } catch (e) {
    console.error('[logError] Failed to write error log:', e.message);
  }
}
