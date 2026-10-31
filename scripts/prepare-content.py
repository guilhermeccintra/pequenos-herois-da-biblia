#!/usr/bin/env python3
"""Convert an explicitly sized collection of approved stories and their named PNGs.

Requires Python 3.10+ and Pillow. No narrative editing or image generation.
"""
import argparse
import hashlib
import json
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
TEXT_FIELDS = ('title', 'subtitle', 'reference', 'description', 'lesson', 'question', 'prayer')


def narrative(story):
    return {**{key: story[key] for key in TEXT_FIELDS},
            'parts': [{'heading': part['heading'], 'paragraphs': part['paragraphs']} for part in story['parts']]}


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def webp(source, destination, width, quality):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as original:
        im = ImageOps.exif_transpose(original).convert('RGB')
        im = im.resize((width, round(im.height * width / im.width)), Image.Resampling.LANCZOS)
        encoded = BytesIO()
        im.save(encoded, 'WEBP', quality=quality, method=6)
        data = encoded.getvalue()
        if len(data) < 1024 or data[:4] != b'RIFF' or data[8:12] != b'WEBP':
            raise ValueError(f'Conversão WebP inválida: {source.name}')
        temporary = destination.with_suffix('.webp.tmp')
        temporary.write_bytes(data)
        temporary.replace(destination)
    if destination.stat().st_size != len(data):
        raise ValueError(f'Gravação WebP incompleta: {destination}')
    return len(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT.parent / 'production', help='Pasta com texts/ e art/.')
    parser.add_argument('--count', type=int, default=365, choices=(40, 365), help='365 para o acervo ampliado; 40 apenas para reconstruir a edição original.')
    args = parser.parse_args()
    # Validate every expected input before producing any output; never glob draft images.
    sources = []
    for identifier in range(1, args.count + 1):
        code = f'{identifier:02d}'
        path = args.source / 'texts' / f'{code}.json'
        story = json.loads(path.read_text(encoding='utf-8'))
        if story['id'] != identifier or len(story['parts']) != 3:
            raise ValueError(f'História {code}: identificação/partes inválidas.')
        roles = {art['role']: art for art in story['art']}
        for role in ('cover', 'part1', 'part2', 'part3'):
            if not roles.get(role, {}).get('alt'):
                raise ValueError(f'História {code}: descrição de imagem ausente.')
            with Image.open(args.source / 'art' / f'{code}_{role}.png') as im:
                im.verify()
        sources.append(story)
    stories, catalog, provenance = [], [], []
    for source in sources:
        identifier, code = source['id'], f"{source['id']:02d}"
        art = {item['role']: item for item in source['art']}
        story = {key: source[key] for key in ('id', 'title', 'subtitle', 'reference', 'description')}
        testament = source.get('testament') or ('antigo' if identifier <= 20 else 'novo' if identifier <= 40 else None)
        if testament not in ('antigo', 'novo'):
            raise ValueError(f'História {code}: informe explicitamente o testamento.')
        story.update(testament=testament,
                     cover=f'/images/covers/{code}.webp', duration='4–7 min')
        story['parts'] = [dict(heading=part['heading'], paragraphs=part['paragraphs'],
                               image=f'{code}/part{number}.webp', alt=art[f'part{number}']['alt'])
                          for number, part in enumerate(source['parts'], 1)]
        story.update({key: source[key] for key in ('lesson', 'question', 'prayer')})
        story['audio_path'] = None
        stories.append(story)
        # Explicit allowlist: paid text can never drift into the public catalog.
        catalog.append({key: story[key] for key in ('id', 'title', 'subtitle', 'reference', 'description', 'testament', 'cover', 'duration')})
        canonical = json.dumps(narrative(source), ensure_ascii=False, separators=(',', ':'))
        provenance.append({'id': identifier, 'narrative_sha256': hashlib.sha256(canonical.encode()).hexdigest(),
                           'narrative_words': len(' '.join(p for part in source['parts'] for p in part['paragraphs']).split()),
                           'part_words': [len(' '.join(part['paragraphs']).split()) for part in source['parts']],
                           'cover_alt': art['cover']['alt'], 'sources': source.get('sources', [])})
        cover = args.source / 'art' / f'{code}_cover.png'
        webp(cover, ROOT / 'public/images/covers' / f'{code}.webp', 640, 75)
        # A private cover accompanies each story for the content import.
        (ROOT / 'assets-private' / code).mkdir(parents=True, exist_ok=True)
        (ROOT / 'assets-private' / code / 'cover.webp').write_bytes((ROOT / 'public/images/covers' / f'{code}.webp').read_bytes())
        for part in range(1, 4):
            dest = ROOT / 'assets-private' / code / f'part{part}.webp'
            webp(args.source / 'art' / f'{code}_part{part}.png', dest, 1100, 80)
            if identifier == 1:
                public_sample = ROOT / 'public/images/sample' / f'part{part}.webp'
                public_sample.parent.mkdir(parents=True, exist_ok=True)
                public_sample.write_bytes(dest.read_bytes())
    for identifier, name, width in ((30, 'hero', 1200), (18, 'davi', 900), (3, 'noe', 900)):
        source = args.source / 'art' / f'{identifier:02d}_cover.png'
        dest = ROOT / 'public/images' / f'{name}.webp'
        quality = 80
        size = webp(source, dest, width, quality)
        while name == 'hero' and size > 180_000 and quality > 40:
            quality -= 5
            size = webp(source, dest, width, quality)
        if name == 'hero' and size > 180_000:
            raise ValueError('Hero acima do orçamento de 180 KB.')
    sample = json.loads(json.dumps(stories[0]))
    for number, part in enumerate(sample['parts'], 1):
        part['image'] = f'/images/sample/part{number}.webp'
    write_json(ROOT / 'content/stories.json', stories)
    write_json(ROOT / 'content/source-manifest.json', provenance)
    write_json(ROOT / 'public/catalog.json', catalog)
    write_json(ROOT / 'public/sample.json', sample)
    print(f'{args.count} histórias preservadas; {args.count * 4} imagens privadas e {args.count + 6} imagens públicas otimizadas.')


if __name__ == '__main__':
    main()
