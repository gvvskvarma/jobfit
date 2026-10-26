-- Row-level security for every per-user table (SPEC 6).
-- The web API and the agent run `SET LOCAL app.user_id = '<clerk id>'` inside each
-- transaction. With no setting, current_setting(..., true) is NULL and nothing matches,
-- so a forgotten SET fails closed. FORCE applies the policies to the table owner too,
-- because Neon's default role owns the tables.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON "User"
  USING ("id" = current_setting('app.user_id', true))
  WITH CHECK ("id" = current_setting('app.user_id', true));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['EmploymentGap','Skill','Evidence','JobPosting','Application',
                           'ResumeVersion','Draft','AuditLog']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY user_isolation ON %I USING ("userId" = current_setting(''app.user_id'', true)) '
      'WITH CHECK ("userId" = current_setting(''app.user_id'', true))', t);
  END LOOP;
END $$;
