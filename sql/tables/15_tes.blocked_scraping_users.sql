CREATE TABLE IF NOT EXISTS tes.blocked_scraping_users (
     account_id TEXT PRIMARY KEY ,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
 );



 ALTER TABLE tes.blocked_scraping_users ENABLE ROW LEVEL SECURITY;
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow select for all" ON tes.blocked_scraping_users;
-- Create read-only policy for authenticated and anonymous users
CREATE POLICY "Allow select for all" 
ON tes.blocked_scraping_users
FOR SELECT 
TO public
USING (true);