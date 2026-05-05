#!/usr/bin/env python3
"""Verify ALL chunks referenced in the entry JS exist on disk."""
import re, json, os, sys

DIST = '/opt/manga/frontend/dist'
entry = sys.argv[1] if len(sys.argv) > 1 else None
if not entry:
    for f in os.listdir(os.path.join(DIST, 'assets')):
        if f.startswith('index-') and f.endswith('.js') and not f.endswith('.br'):
            entry = os.path.join(DIST, 'assets', f)
            break

code = open(entry).read()

# Extract deps array
match = re.search(r'm\.f\|\|\(m\.f=(\[.*?\])\)', code)
if not match:
    print("No deps array found")
    sys.exit(1)

deps = json.loads(match.group(1))

# Also find CSS references
css_refs = set(re.findall(r'assets/[A-Za-z0-9_./-]+\.css', code))

all_refs = [d for d in deps] + [c for c in css_refs]
missing = 0
for ref in all_refs:
    path = os.path.join(DIST, ref)
    if os.path.exists(path):
        print(f"  OK  {ref}")
    else:
        print(f"  MISS {ref}")
        missing += 1

print(f"\nTotal: {len(all_refs)}, Missing: {missing}")
