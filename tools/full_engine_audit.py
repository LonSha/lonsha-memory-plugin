import json, re
from pathlib import Path

root=Path('/home/user/lonsha-memory-plugin')
manifest=json.loads((root/'manifest.json').read_text())
extra=set(manifest.get('extra_js',[]))
files={p.name:p for p in root.glob('*.js')}
alltext='\n'.join(p.read_text(errors='ignore') for p in root.glob('*.js'))
testtext='\n'.join(t.read_text(errors='ignore') for t in (root/'tests').rglob('*') if t.is_file() and t.suffix in {'.js','.mjs'})

rows=[]
for name,p in sorted(files.items()):
    text=p.read_text(errors='ignore')
    if name in ('index.js','optional-engine-registry.js'): continue
    exported=bool(re.search(r'module\.exports|window\.LonSha|root\.[A-Za-z]',text))
    production_refs=len(re.findall(r'\b'+re.escape(name)+r'\b',alltext))-1
    test_refs=testtext.count(name)
    rows.append((name, name in extra, exported, production_refs, test_refs, len(text)))

print('file,manifest,exported,prod_refs,test_refs,bytes')
for r in rows:
    if (not r[1]) or r[3] <= 1:
        print(','.join(map(str,r)))
print('TOTAL',len(rows),'manifest',len(extra),'missing manifest',sum(not r[1] for r in rows))