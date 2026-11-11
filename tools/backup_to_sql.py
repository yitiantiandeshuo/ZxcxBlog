#!/usr/bin/env python3
"""Convert an exported blog backup to INSERT-only SQL for an empty D1 database."""
import json
import re
import sys

SETTING_TEXT_FIELDS = ('title','description','avatar_url','icon_url','home_heading','accent_color','github_url','social_url','contact_email','about_content')
SETTING_INT_FIELDS = ('home_show_excerpt','home_limit','post_show_toc','post_show_published','post_show_updated','post_show_topics','archive_fold','post_share','mobile_nav')

FIELDS = ('id', 'slug', 'title', 'content', 'excerpt', 'category', 'tags', 'status', 'created_at', 'updated_at', 'published_at')

def sql_value(value):
    if value is None:
        return 'NULL'
    if not isinstance(value, str) or '\x00' in value:
        raise ValueError('Expected a text field without NUL bytes')
    return "'" + value.replace("'", "''") + "'"

def convert(data):
    if data.get('format') != 'zxcx-blog-backup' or data.get('version') != 1 or not isinstance(data.get('posts'), list):
        raise ValueError('Unsupported backup format')
    result = []
    ids, slugs = set(), set()
    for post in data['posts']:
        if not isinstance(post, dict) or any(key not in post for key in FIELDS):
            raise ValueError('Missing post field')
        if not isinstance(post['id'], str) or not re.fullmatch(r'[a-f0-9-]{36}', post['id']) or not isinstance(post['slug'], str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', post['slug']):
            raise ValueError('Invalid post ID or slug')
        if post['id'] in ids or post['slug'] in slugs or post['status'] not in ('draft','published'):
            raise ValueError('Duplicate post or invalid status')
        tags = json.loads(post['tags'])
        if not isinstance(tags, list) or any(not isinstance(tag, str) for tag in tags):
            raise ValueError('Invalid tags')
        if any(post[key] is None for key in FIELDS if key != 'published_at'):
            raise ValueError('Missing required value')
        ids.add(post['id']); slugs.add(post['slug'])
        result.append('INSERT INTO posts (' + ','.join(FIELDS) + ') VALUES (' + ','.join(sql_value(post[key]) for key in FIELDS) + ');')
    settings = data.get('settings')
    if settings is not None:
        if not isinstance(settings, dict) or settings.get('id') != 1:
            raise ValueError('Invalid settings')
        names = SETTING_TEXT_FIELDS + SETTING_INT_FIELDS
        if any(name not in settings for name in names):
            raise ValueError('Missing settings field')
        for name in SETTING_INT_FIELDS:
            value = settings[name]
            if type(value) is not int or not (1 <= value <= 50 if name == 'home_limit' else value in (0, 1)):
                raise ValueError('Invalid settings value')
        values = [sql_value(settings[name]) for name in SETTING_TEXT_FIELDS] + [str(settings[name]) for name in SETTING_INT_FIELDS]
        result.append('INSERT INTO site_settings (id,' + ','.join(names) + ') VALUES (1,' + ','.join(values) + ');')
    return '\n'.join(result) + '\n'

if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Usage: python3 tools/backup_to_sql.py /path/to/blog-backup.json > /path/to/restore.sql')
        with open(sys.argv[1], encoding='utf-8') as backup:
            output = convert(json.load(backup))
        sys.stdout.write(output)
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print('Backup conversion failed: ' + str(exc), file=sys.stderr)
        sys.exit(1)
