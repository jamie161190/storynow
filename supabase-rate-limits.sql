-- Rate limits table (used by send-email, stripe-webhook, generate-preview, admin-api)
-- If this table doesn't exist, rate limiting silently fails and emails send without limits
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by key + time window
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_created ON rate_limits(key, created_at);

-- Enable RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role full access (Netlify functions use service key)
CREATE POLICY "Service role full access rate_limits" ON rate_limits FOR ALL USING (true) WITH CHECK (true);

-- Optional: auto-cleanup old entries (older than 7 days)
-- Run manually or via scheduled function:
-- DELETE FROM rate_limits WHERE created_at < now() - interval '7 days';
