CREATE TABLE review_events (id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), data TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX review_events_asset ON review_events(asset_id, created_at);
UPDATE workspace_info SET schema_version = 4;
PRAGMA user_version = 4;
