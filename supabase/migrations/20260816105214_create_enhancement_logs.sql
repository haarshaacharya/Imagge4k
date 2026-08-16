/*
# Create enhancement_logs table for tracking image enhancement usage

1. New Tables
- `enhancement_logs`
  - `id` (uuid, primary key)
  - `session_id` (text, not null) - identifies unique users via localStorage session ID
  - `enhancement_type` (text, not null) - the target resolution: '2k', '4k', or '8k'
  - `original_size` (bigint) - original file size in bytes
  - `created_at` (timestamptz, default now())

2. Indexes
- `idx_enhancement_logs_created_at` on `created_at` for time-based queries
- `idx_enhancement_logs_session_id` on `session_id` for unique user counting

3. Security
- Enable RLS on `enhancement_logs`.
- Allow anon + authenticated INSERT (users log their enhancements without signing in).
- Allow authenticated SELECT only (admin reads stats; admin is a signed-in Supabase auth user).
- No UPDATE or DELETE needed.

4. Notes
- This is a hybrid app: public users don't sign in (anon role inserts logs),
  but the admin signs in via Supabase auth (authenticated role reads logs).
- Unique users are counted by distinct `session_id` values.
*/

CREATE TABLE IF NOT EXISTS enhancement_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  enhancement_type text NOT NULL CHECK (enhancement_type IN ('2k', '4k', '8k')),
  original_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enhancement_logs_created_at ON enhancement_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_enhancement_logs_session_id ON enhancement_logs (session_id);

ALTER TABLE enhancement_logs ENABLE ROW LEVEL SECURITY;

-- Allow anon + authenticated to INSERT (public users log their enhancements)
DROP POLICY IF EXISTS "anon_insert_logs" ON enhancement_logs;
CREATE POLICY "anon_insert_logs" ON enhancement_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Allow authenticated (admin) to SELECT for stats
DROP POLICY IF EXISTS "auth_select_logs" ON enhancement_logs;
CREATE POLICY "auth_select_logs" ON enhancement_logs FOR SELECT
  TO authenticated USING (true);
