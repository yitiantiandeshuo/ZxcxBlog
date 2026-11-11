CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  icon_url TEXT NOT NULL DEFAULT ''
);
