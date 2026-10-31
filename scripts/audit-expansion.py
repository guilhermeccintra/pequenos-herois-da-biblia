#!/usr/bin/env python3
"""Report production progress without exposing incomplete stories to the app."""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'production-expansion'
roles = ('cover', 'part1', 'part2', 'part3')
texts = {}
issues = []
paragraphs = defaultdict(list)
for p in (SOURCE / 'texts').glob('*.json'):
    try:
        s = json.loads(p.read_text())
        if str(s['id']).zfill(2) != p.stem:
            issues.append(f'{p.name}: nome/ID diferentes')
        texts[s['id']] = s
        parts = s.get('parts', [])
        words = sum(len(' '.join(part.get('paragraphs', [])).split()) for part in parts)
        if len(parts) != 3 or any(len(part.get('paragraphs', [])) != 3 for part in parts):
            issues.append(f'{p.name}: estrutura não é 3×3')
        if not 420 <= words <= 650:
            issues.append(f'{p.name}: narrativa de {words} palavras')
        if not 55 <= len(s.get('lesson', '').split()) <= 110:
            issues.append(f'{p.name}: extensão da reflexão')
        if not 30 <= len(s.get('prayer', '').split()) <= 65:
            issues.append(f'{p.name}: extensão da oração')
        art = {a['role']: a for a in s.get('art', [])}
        if set(art) != set(roles) or any(not a.get('alt') or not a.get('prompt') for a in art.values()):
            issues.append(f'{p.name}: briefing de arte incompleto')
        if not s.get('sources'):
            issues.append(f'{p.name}: sem fonte')
        for part in parts:
            for para in part['paragraphs']:
                paragraphs[para].append(s['id'])
    except Exception as exc:
        issues.append(f'{p.name}: {exc}')
art_files = [p for p in (SOURCE / 'art').glob('*.png')
             if re.fullmatch(r'(?:[4-9]\d|[1-3]\d\d)_(?:cover|part[123])\.png', p.name)
             and 41 <= int(p.name.split('_')[0]) <= 365]
for p in art_files:
    try:
        with Image.open(p) as im:
            if im.width < 1100 or not 1.45 <= im.width / im.height <= 1.55:
                issues.append(f'{p.name}: dimensão {im.size}')
            im.verify()
    except Exception as exc:
        issues.append(f'{p.name}: {exc}')
originals = json.loads((ROOT / 'content/stories.json').read_text())[:40]
for story in originals:
    for part in story['parts']:
        for paragraph in part['paragraphs']:
            paragraphs[paragraph].append(story['id'])
for para, ids in paragraphs.items():
    if len(ids) > 1:
        issues.append(f'Parágrafo repetido em {ids}: {para[:75]}')
for field in ('title', 'lesson', 'question', 'prayer'):
    values = defaultdict(list)
    for s in originals + list(texts.values()):
        values[s[field].strip().casefold()].append(s['id'])
    for val, ids in values.items():
        if len(ids) > 1:
            issues.append(f'{field} repetido em {ids}: {val[:70]}')
complete = [i for i in texts if all((SOURCE / 'art' / f'{i:02d}_{r}.png').is_file() for r in roles)]
report = {'texts': len(texts), 'images': len(art_files), 'complete_new_stories': len(complete),
          'target_new_stories': 325, 'target_new_images': 1300, 'issues': issues,
          'complete_ids': sorted(complete)}
if '--brief' in sys.argv:
    report.pop('complete_ids')
print(json.dumps(report, ensure_ascii=False, indent=2))
