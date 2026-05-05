#!/usr/bin/env python3
"""Fix nginx config: add no-cache for index.html, remove broken sed output."""
import re

path = '/etc/nginx/sites-enabled/manga'
t = open(path).read()

# Remove any broken insertion from previous sed
t = re.sub(r'\s*# index\.html - always revalidate\n\s*location = /index\.html \{[^}]*\}\n*', '\n', t)

# Insert clean block before "# SPA fallback"
insert = """
    # index.html - always revalidate so deploys take effect immediately
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
    }

    # SPA fallback"""

t = t.replace('    # SPA fallback', insert.lstrip('\n'))

open(path, 'w').write(t)
print('OK')
