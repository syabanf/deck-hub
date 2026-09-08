-- 000013_app_settings.up.sql
-- Settings an admin can change without a deploy.
--
-- Key/value rather than a column per setting: these are UI preferences, they
-- arrive one at a time, and a migration for each would be a migration for
-- every small decision. The value is TEXT and each reader parses what it
-- expects, because a setting whose type lives in the schema cannot change its
-- mind later without another migration.
--
-- Deliberately not a general store: the keys are a closed set the code knows
-- about (see domain.SettingKeys), so a typo in a PUT is a 400 rather than a row
-- nothing ever reads.
CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT        PRIMARY KEY CHECK (key <> ''),
    value      TEXT        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- How many categories the header shows before the rest move into "More".
-- Five, because that is what fits comfortably beside the app's own sections
-- once the titles are real names rather than the short ones the navigation
-- used to hardcode.
INSERT INTO app_settings (key, value) VALUES ('nav_max_categories', '5')
ON CONFLICT (key) DO NOTHING;
