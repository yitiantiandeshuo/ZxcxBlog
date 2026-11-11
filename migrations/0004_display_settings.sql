ALTER TABLE site_settings ADD COLUMN home_limit INTEGER NOT NULL DEFAULT 15 CHECK (home_limit BETWEEN 1 AND 50);
ALTER TABLE site_settings ADD COLUMN post_show_toc INTEGER NOT NULL DEFAULT 1 CHECK (post_show_toc IN (0, 1));
ALTER TABLE site_settings ADD COLUMN post_show_published INTEGER NOT NULL DEFAULT 1 CHECK (post_show_published IN (0, 1));
ALTER TABLE site_settings ADD COLUMN post_show_updated INTEGER NOT NULL DEFAULT 1 CHECK (post_show_updated IN (0, 1));
ALTER TABLE site_settings ADD COLUMN post_show_topics INTEGER NOT NULL DEFAULT 1 CHECK (post_show_topics IN (0, 1));
