#!/usr/bin/env python3
"""Extract the __vite__mapDeps array from the built index chunk."""
import re, sys, json

path = sys.argv[1] if len(sys.argv) > 1 else '/opt/manga/frontend/dist/assets/index-CTA3J_5v.js'
code = open(path).read()

# Find the deps array: typically something like m.f||(m.f=["file1.js","file2.js",...])
match = re.search(r'm\.f\|\|\(m\.f=(\[.*?\])\)', code)
if match:
    arr = json.loads(match.group(1))
    for i, dep in enumerate(arr):
        print(f"  [{i}] {dep}")
else:
    # Try alternative pattern
    match = re.search(r'__vite__mapDeps.*?(\[\"assets/.*?\])', code, re.DOTALL)
    if match:
        print(match.group(1)[:3000])
    else:
        print("Could not find deps array")
        # Show context around __vite__mapDeps
        idx = code.find('__vite__mapDeps')
        if idx >= 0:
            print(code[max(0,idx-50):idx+500])
