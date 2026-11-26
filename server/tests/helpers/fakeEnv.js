// Unit tests do NOT use the real database, Supabase or Gmail.
// Some files we test check for these settings when they load, so we give them
// harmless fake values. Nothing ever connects to them in a unit test.
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/unit_tests_only';
process.env.SUPABASE_URL = 'http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-key';
process.env.EMAIL_SILENT = 'true';
