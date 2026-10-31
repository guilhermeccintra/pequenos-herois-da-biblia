#!/usr/bin/env python3
"""Validate and integrate authored stories 41–365 without rewriting the original forty.

All four approved PNGs per new story must exist. No text or image is synthesized here.
Requires Pillow. Run after editorial and visual review of production-expansion/.
"""
import argparse
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
TEXT_FIELDS = ('title', 'subtitle', 'reference', 'description', 'lesson', 'question', 'prayer')
META_FIELDS = ('id', 'title', 'subtitle', 'reference', 'description', 'testament', 'cover', 'duration')
ROLES = ('cover', 'part1', 'part2', 'part3')


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def narrative(story):
    return {**{k: story[k] for k in TEXT_FIELDS}, 'parts': [
        {'heading': p['heading'], 'paragraphs': p['paragraphs']} for p in story['parts']]}


def fingerprint(story):
    text = json.dumps(narrative(story), ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(text.encode()).hexdigest()


def optimized(source, width, quality, budget):
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        if image.width < width:
            raise ValueError(f'Resolução original insuficiente: {source}')
        image = ImageOps.fit(image, (width, round(width * 2 / 3)), method=Image.Resampling.LANCZOS)
        while quality >= 65:
            buffer = BytesIO()
            image.save(buffer, 'WEBP', quality=quality, method=6)
            data = buffer.getvalue()
            if len(data) < budget:
                return data
            quality -= 3
        raise ValueError(f'Orçamento excedido sem reduzir excessivamente a qualidade: {source}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'production-expansion')
    parser.add_argument('--check', action='store_true', help='Validar entradas sem converter ou gravar.')
    args = parser.parse_args()
    existing = json.loads((ROOT / 'content/stories.json').read_text())
    manifest = json.loads((ROOT / 'content/source-manifest.json').read_text())
    originals = existing[:40]
    original_manifest = manifest[:40]
    if [s['id'] for s in originals] != list(range(1, 41)):
        raise ValueError('As quarenta histórias originais não estão intactas e em ordem.')
    for s, m in zip(originals, original_manifest):
        if fingerprint(s) != m['narrative_sha256']:
            raise ValueError(f'História original alterada: {s["id"]}')
    sources = []
    seen_art = {}
    missing = []
    approvals = set()
    for review_path in (args.source / 'reviews').glob('*-approved.json'):
        reviews = json.loads(review_path.read_text())
        for review in reviews:
            if review.get('reviewed') is True:
                approvals.add((review.get('id'), review.get('role'), review.get('sha256')))
    for identifier in range(41, 366):
        code = str(identifier).zfill(2)
        source_path = args.source / 'texts' / f'{code}.json'
        if not source_path.exists():
            missing.append(str(source_path.relative_to(args.source)))
            continue
        source = json.loads(source_path.read_text())
        if source.get('id') != identifier or len(source.get('parts', [])) != 3:
            raise ValueError(f'ID/partes inválidos: {code}')
        if source.get('testament') not in ('antigo', 'novo'):
            raise ValueError(f'Testamento ausente: {code}')
        if not source.get('sources') or any(not isinstance(url, str) or not url.startswith('https://') for url in source['sources']):
            raise ValueError(f'Fontes bíblicas ausentes ou inválidas: {code}')
        for field in TEXT_FIELDS:
            if not isinstance(source.get(field), str) or len(source[field].strip()) < 6:
                raise ValueError(f'Campo incompleto: {code}.{field}')
        roles = {a['role']: a for a in source['art']}
        for role in ROLES:
            if not roles.get(role, {}).get('alt') or not roles[role].get('prompt'):
                raise ValueError(f'Alt/prompt ausente: {code}/{role}')
            art_path = args.source / 'art' / f'{code}_{role}.png'
            if not art_path.exists():
                missing.append(str(art_path.relative_to(args.source)))
            else:
                digest = hashlib.sha256(art_path.read_bytes()).hexdigest()
                if digest in seen_art:
                    raise ValueError(f'Arte fonte duplicada: {art_path} e {seen_art[digest]}')
                seen_art[digest] = str(art_path)
                if (identifier, role, digest) not in approvals:
                    missing.append(f'revisão visual: {code}/{role}')
                with Image.open(art_path) as image:
                    if image.format != 'PNG':
                        raise ValueError(f'Formato de origem diferente de PNG: {art_path}')
                    if image.width < 1100 or not 1.45 <= image.width / image.height <= 1.55:
                        raise ValueError(f'Arte fora de resolução/proporção: {art_path}')
                    image.verify()
        for part in source['parts']:
            if not part.get('heading') or len(part.get('paragraphs', [])) != 3 or any(not isinstance(p, str) or not p.strip() for p in part['paragraphs']):
                raise ValueError(f'Parte incompleta: {code}')
        words = sum(len(p.split()) for part in source['parts'] for p in part['paragraphs'])
        if not 420 <= words <= 650:
            raise ValueError(f'Extensão narrativa fora do padrão: {code} = {words}')
        if not 55 <= len(source['lesson'].split()) <= 110 or not 30 <= len(source['prayer'].split()) <= 65:
            raise ValueError(f'Reflexão/oração fora do padrão: {code}')
        sources.append(source)
    if missing:
        raise SystemExit(f'Expansão incompleta: {len(missing)} entradas ausentes. Primeiras: ' + ', '.join(missing[:12]))
    if len(sources) != 325:
        raise ValueError('São necessárias exatamente 325 histórias novas.')
    if len({s['title'].casefold() for s in originals + sources}) != 365:
        raise ValueError('Há títulos duplicados.')
    if args.check:
        print('325 narrativas e 1300 PNGs validados. Originais preservados. Nenhum arquivo alterado.')
        return
    def convert_asset(job):
        code, role = job
        private = ROOT / 'assets-private' / code
        private.mkdir(parents=True, exist_ok=True)
        data = optimized(args.source / 'art' / f'{code}_{role}.png',
                         640 if role == 'cover' else 1100,
                         75 if role == 'cover' else 80,
                         120000 if role == 'cover' else 300000)
        (private / f'{role}.webp').write_bytes(data)
        if role == 'cover':
            (ROOT / 'public/images/covers' / f'{code}.webp').write_bytes(data)
        return len(data)
    jobs = [(str(s['id']).zfill(2), role) for s in sources for role in ROLES]
    with ThreadPoolExecutor(max_workers=4) as executor:
        for number, size in enumerate(executor.map(convert_asset, jobs), 1):
            if number % 40 == 0:
                print(f'{number}/1300 imagens otimizadas.', flush=True)
    stories, provenance = list(originals), list(original_manifest)
    for source in sources:
        identifier = source['id']
        code = str(identifier).zfill(2)
        art = {a['role']: a for a in source['art']}
        story = {k: source[k] for k in ('id', 'title', 'subtitle', 'reference', 'description', 'testament')}
        story.update(cover=f'/images/covers/{code}.webp', duration='4–7 min')
        story['parts'] = [dict(heading=p['heading'], paragraphs=p['paragraphs'], image=f'{code}/part{i}.webp', alt=art[f'part{i}']['alt']) for i, p in enumerate(source['parts'], 1)]
        story.update({k: source[k] for k in ('lesson', 'question', 'prayer')})
        story['audio_path'] = None
        stories.append(story)
        provenance.append({'id': identifier, 'narrative_sha256': fingerprint(story),
            'narrative_words': sum(len(p.split()) for part in story['parts'] for p in part['paragraphs']),
            'part_words': [len(' '.join(p['paragraphs']).split()) for p in story['parts']],
            'cover_alt': art['cover']['alt'], 'sources': source.get('sources', []),
            'generation': 'Ilustrações novas geradas com image_gen, com referências visuais da coleção original.'})
    write_json(ROOT / 'content/stories.json', stories)
    write_json(ROOT / 'content/source-manifest.json', provenance)
    write_json(ROOT / 'public/catalog.json', [{k: s[k] for k in META_FIELDS} for s in stories])
    write_json(ROOT / 'content/illustration-prompts.json', [{'id': s['id'], 'art': s['art']} for s in sources])
    print('365 histórias, 1460 WebPs privados e 365 capas públicas. As quarenta originais e a amostra permanecem intactas.')


if __name__ == '__main__':
    main()
