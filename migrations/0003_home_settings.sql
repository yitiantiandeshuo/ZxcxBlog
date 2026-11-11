ALTER TABLE site_settings ADD COLUMN home_heading TEXT NOT NULL DEFAULT '近期发布';
ALTER TABLE site_settings ADD COLUMN home_show_excerpt INTEGER NOT NULL DEFAULT 1 CHECK (home_show_excerpt IN (0, 1));
