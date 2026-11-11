ALTER TABLE site_settings ADD COLUMN accent_color TEXT NOT NULL DEFAULT '#2bbc8a';
ALTER TABLE site_settings ADD COLUMN github_url TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN social_url TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN contact_email TEXT NOT NULL DEFAULT '';
ALTER TABLE site_settings ADD COLUMN archive_fold INTEGER NOT NULL DEFAULT 0 CHECK (archive_fold IN (0, 1));
ALTER TABLE site_settings ADD COLUMN post_share INTEGER NOT NULL DEFAULT 0 CHECK (post_share IN (0, 1));
ALTER TABLE site_settings ADD COLUMN mobile_nav INTEGER NOT NULL DEFAULT 0 CHECK (mobile_nav IN (0, 1));
