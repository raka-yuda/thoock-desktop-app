CREATE TABLE migration_imports (id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL);
CREATE TABLE migration_id_map (kind TEXT NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL, PRIMARY KEY(kind, source_id));
CREATE TABLE migration_checkpoints (part TEXT PRIMARY KEY, completed INTEGER NOT NULL);
CREATE INDEX jobs_created ON jobs(created_at);
CREATE INDEX logs_created ON provider_logs(created_at);
UPDATE workspace_info SET schema_version = 3;
PRAGMA user_version = 3;
