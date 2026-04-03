-- Content Creators table
CREATE TABLE IF NOT EXISTS content_creators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  child_names TEXT[] NOT NULL DEFAULT '{}',
  password_hash TEXT,
  referral_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Content Takes table (which creator took which piece)
CREATE TABLE IF NOT EXISTS content_takes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES content_creators(id) ON DELETE CASCADE,
  creator_name TEXT NOT NULL,
  piece_number INTEGER NOT NULL,
  piece_title TEXT NOT NULL,
  taken_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(creator_id, piece_number)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_content_takes_piece ON content_takes(piece_number);
CREATE INDEX IF NOT EXISTS idx_content_takes_creator ON content_takes(creator_id);
CREATE INDEX IF NOT EXISTS idx_content_creators_referral ON content_creators(referral_code);

-- Enable RLS
ALTER TABLE content_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_takes ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (our Netlify functions use service key)
CREATE POLICY "Service role full access creators" ON content_creators FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access takes" ON content_takes FOR ALL USING (true) WITH CHECK (true);
