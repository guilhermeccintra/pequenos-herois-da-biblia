import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNarrationText } from '../scripts/generate-narration.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const [stories, catalog, sample, manifest] = await Promise.all([
  json('content/stories.json'), json('public/catalog.json'), json('public/sample.json'), json('content/source-manifest.json')]);
const textFields = ['title', 'subtitle', 'reference', 'description', 'lesson', 'question', 'prayer'];
const narrative = story => ({ ...Object.fromEntries(textFields.map(key => [key, story[key]])),
  parts: story.parts.map(({ heading, paragraphs }) => ({ heading, paragraphs })) });
const countWords = text => text.trim().split(/\s+/u).length;
const digest = data => createHash('sha256').update(data).digest('hex');
async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)]));
  return nested.flat();
}
function webpSize(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  for (let offset = 12; offset + 8 < buffer.length;) {
    const kind = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    if (kind === 'VP8 ') return [buffer.readUInt16LE(offset + 14) & 0x3fff, buffer.readUInt16LE(offset + 16) & 0x3fff];
    if (kind === 'VP8X') return [1 + buffer.readUIntLE(offset + 12, 3), 1 + buffer.readUIntLE(offset + 15, 3)];
    offset += 8 + length + (length % 2);
  }
  throw new Error('WebP sem dimensões reconhecidas.');
}

test('40 histórias completas obedecem ao contrato e conservam palavras, capítulos e reflexão das fontes', () => {
  assert.equal(stories.length, 40);
  assert.equal(manifest.length, 40);
  assert.deepEqual(stories.map(story => story.id), Array.from({ length: 40 }, (_, i) => i + 1));
  for (const story of stories) {
    const expected = manifest.find(item => item.id === story.id);
    assert.equal(digest(JSON.stringify(narrative(story))), expected.narrative_sha256, `História ${story.id}: narrativa alterada`);
    assert.equal(countWords(story.parts.flatMap(part => part.paragraphs).join(' ')), expected.narrative_words);
    assert.deepEqual(story.parts.map(part => countWords(part.paragraphs.join(' '))), expected.part_words);
    assert.equal(story.parts.length, 3);
    assert.equal(story.testament, story.id <= 20 ? 'antigo' : 'novo');
    assert.equal(story.duration, '4–7 min');
    assert.equal(story.audio_path, null, 'Não entregar áudio inexistente');
    assert.equal(story.cover, `/images/covers/${String(story.id).padStart(2, '0')}.webp`);
    for (const key of textFields) assert.ok(story[key].length > 5);
    for (const [index, part] of story.parts.entries()) {
      assert.equal(part.image, `${String(story.id).padStart(2, '0')}/part${index + 1}.webp`);
      assert.ok(part.paragraphs.length >= 2);
      assert.ok(part.alt.length > 10);
    }
  }
});

test('catálogo público usa somente metadados; somente a história 1 é uma amostra completa', async () => {
  const allowed = ['id', 'title', 'subtitle', 'reference', 'description', 'testament', 'cover', 'duration'].sort();
  assert.equal(catalog.length, 40);
  for (const item of catalog) {
    assert.deepEqual(Object.keys(item).sort(), allowed);
    const full = stories.find(story => story.id === item.id);
    for (const key of allowed) assert.deepEqual(item[key], full[key]);
  }
  assert.equal(sample.id, 1);
  assert.deepEqual(narrative(sample), narrative(stories[0]));
  assert.deepEqual(sample.parts.map(part => part.image), [1, 2, 3].map(n => `/images/sample/part${n}.webp`));
  const publicFiles = await walk(resolve(root, 'public'));
  for (const path of publicFiles.filter(path => /\.(json|js|html|txt|md)$/u.test(path))) {
    const body = await readFile(path, 'utf8');
    for (const story of stories.slice(1)) {
      for (const part of story.parts) {
        for (const paragraph of part.paragraphs) assert.ok(!body.includes(paragraph), `Narrativa paga em ${path}`);
      }
      for (const key of ['lesson', 'question', 'prayer']) assert.ok(!body.includes(story[key]), `Reflexão paga em ${path}`);
    }
  }
});

test('160 imagens privadas e 46 públicas têm paths, dimensões e orçamento corretos', async () => {
  const privateImages = (await walk(resolve(root, 'assets-private'))).filter(path => path.endsWith('.webp'));
  const publicImages = (await walk(resolve(root, 'public/images'))).filter(path => path.endsWith('.webp'));
  assert.equal(privateImages.length, 160);
  assert.equal(publicImages.length, 46);
  for (const story of stories) {
    const code = String(story.id).padStart(2, '0');
    const cover = await readFile(resolve(root, `public${story.cover}`));
    assert.equal(webpSize(cover)[0], 640);
    assert.ok(cover.length < 120000);
    assert.deepEqual(cover, await readFile(resolve(root, `assets-private/${code}/cover.webp`)));
    for (const part of story.parts) {
      const bytes = await readFile(resolve(root, 'assets-private', part.image));
      assert.equal(webpSize(bytes)[0], 1100);
      assert.ok(bytes.length < 300000);
    }
  }
  for (let n = 1; n <= 3; n++) assert.deepEqual(await readFile(resolve(root, `public/images/sample/part${n}.webp`)), await readFile(resolve(root, `assets-private/01/part${n}.webp`)));
  const hero = await readFile(resolve(root, 'public/images/hero.webp'));
  assert.deepEqual(webpSize(hero), [1200, 800]);
  assert.ok(hero.length <= 180000);
  for (const name of ['davi', 'noe']) assert.equal(webpSize(await readFile(resolve(root, `public/images/${name}.webp`)))[0], 900);
});

test('roteiros de narração preservam conteúdo, títulos, capítulos, lição, pergunta e oração em menos de 10 mil caracteres', () => {
  for (const story of stories) {
    const text = buildNarrationText(story);
    assert.ok(text.length < 10000);
    for (const key of ['title', 'subtitle', 'reference', 'lesson', 'question', 'prayer']) assert.ok(text.includes(story[key]));
    for (const part of story.parts) {
      assert.ok(text.includes(part.heading));
      for (const paragraph of part.paragraphs) assert.ok(text.includes(paragraph));
    }
  }
});
