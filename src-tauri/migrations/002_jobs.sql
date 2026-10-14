CREATE TABLE job_inputs (job_id TEXT PRIMARY KEY REFERENCES jobs(id), input TEXT NOT NULL);
CREATE TABLE job_leases (job_id TEXT PRIMARY KEY REFERENCES jobs(id), worker_id TEXT NOT NULL, heartbeat TEXT NOT NULL);
UPDATE workspace_info SET schema_version = 2;
PRAGMA user_version = 2;
