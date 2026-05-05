#!/usr/bin/env python3
"""Post-build step: rename the entry JS chunk to include a timestamp,
so the browser NEVER serves a stale cached version.
Also copies public/sw.js into dist/."""
import os, re, time, shutil, glob

DIST = '/opt/manga/frontend/dist'
PUBLIC = '/opt/manga/frontend/public'
TS = str(int(time.time()))

# 1) Copy sw.js from public/ to dist/
src_sw = os.path.join(PUBLIC, 'sw.js')
dst_sw = os.path.join(DIST, 'sw.js')
if os.path.exists(src_sw):
    shutil.copy2(src_sw, dst_sw)
    print(f'[ok] Copied sw.js')

# 2) Read index.html, find entry chunk reference
html_path = os.path.join(DIST, 'index.html')
html = open(html_path).read()

match = re.search(r'src="/assets/(index-[A-Za-z0-9_-]+\.js)"', html)
if not match:
    print('[skip] No entry chunk found in index.html')
    exit(0)

old_name = match.group(1)
base, ext = os.path.splitext(old_name)
new_name = f'{base}-t{TS}{ext}'

old_path = os.path.join(DIST, 'assets', old_name)
new_path = os.path.join(DIST, 'assets', new_name)

if not os.path.exists(old_path):
    print(f'[error] {old_path} not found')
    exit(1)

# 3) Rename the file (and .br if it exists)
os.rename(old_path, new_path)
print(f'[ok] Renamed {old_name} -> {new_name}')

br_old = old_path + '.br'
br_new = new_path + '.br'
if os.path.exists(br_old):
    os.rename(br_old, br_new)
    print(f'[ok] Renamed {old_name}.br -> {new_name}.br')

# 4) Update index.html
html = html.replace(old_name, new_name)
open(html_path, 'w').write(html)
print(f'[ok] Updated index.html')
print(f'[done] Entry chunk: /assets/{new_name}')
