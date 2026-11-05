import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { reader } from '../src/reader.js';
import { captureReaderAudio, restoreReaderAudio } from '../src/reader-audio.js';

const sample = JSON.parse(await readFile(new URL('../public/sample.json', import.meta.url), 'utf8'));
const stories = JSON.parse(await readFile(new URL('../content/stories.json', import.meta.url), 'utf8'));
const state = (part) => ({ part, progress: {}, night: false });

test('cada parte da criação usa o MP3 enviado e o mesmo vínculo na amostra e no conteúdo de assinantes', async () => {
  const hashes = [
    '27167b1a723fb4aff5d2e1afd3b8da9d7f482c4dfa5a776002d711fab5110732',
    'e8b1752bd61f2e0f498da50b3fcec4bb267ad774449f9f03d1d0eef86c80bd57',
    '7435a3b714d52499bc62380abaa5c52015baa39c0c7a4b8bbf3fe4b621ee6f40',
  ];
  for (const [index, part] of sample.parts.entries()) {
    assert.equal(part.heading, stories[0].parts[index].heading);
    assert.equal(part.audio_url, stories[0].parts[index].audio_url);
    const bytes = await readFile(new URL(`../public${part.audio_url}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hashes[index]);
    const html = reader(sample, state(index));
    assert.equal((html.match(/<audio /g) || []).length, 1);
    assert.ok(html.indexOf('<audio ') < html.indexOf(`<h2>${part.heading}</h2>`));
    assert.ok(html.includes(`src="${part.audio_url}"`));
    assert.doesNotMatch(html, /Hora de ouvir|ainda não tem narração|autoplay/);
  }
  assert.ok(stories.slice(1).every(story => story.parts.every(part => !part.audio_url)));
});

test('reflexão não reaproveita áudio da terceira parte e narrações completas continuam disponíveis', () => {
  assert.doesNotMatch(reader(sample, state(3)), /<audio |Hora de ouvir|ainda não tem narração/);
  const legacy = { ...sample, audio_url: 'https://example.test/full.mp3',
    parts: sample.parts.map(({ audio_url, ...part }) => part) };
  assert.match(reader(legacy, state(0)), /src="https:\/\/example.test\/full.mp3"/);
  assert.match(reader({ ...legacy, audio_url: null }, state(0)), /ainda não tem narração/);
});

function audio(key, options = {}) {
  return { dataset: { audioKey: key }, currentTime: 0, paused: true, playbackRate: 1,
    readyState: 1, duration: 70, plays: 0, pauses: 0,
    pause() { this.pauses++; this.paused = true; },
    async play() { this.plays++; this.paused = false; },
    ...options };
}

test('trocar de parte pausa a anterior e começa a nova em zero, sem reprodução automática', () => {
  const old = audio('1:part:0', { currentTime: 42, paused: false, playbackRate: 1.15 });
  const snapshot = captureReaderAudio(old);
  const next = audio('1:part:1');
  const speed = { value: '1' };
  restoreReaderAudio(next, snapshot, speed);
  assert.equal(old.pauses, 1);
  assert.equal(next.currentTime, 0);
  assert.equal(next.plays, 0);
  assert.equal(next.paused, true);
  assert.equal(next.playbackRate, 1.15);
  assert.equal(speed.value, '1.15');
});

test('redesenhar o mesmo áudio conserva posição e velocidade, inclusive após carregar metadados', () => {
  const snapshot = captureReaderAudio(audio('2:story', { currentTime: 31, paused: false, playbackRate: 0.85 }));
  let loaded;
  const next = audio('2:story', { readyState: 0, addEventListener(event, handler, options) {
    assert.equal(event, 'loadedmetadata'); assert.equal(options.once, true); loaded = handler;
  } });
  restoreReaderAudio(next, snapshot);
  assert.equal(next.plays, 0);
  loaded();
  assert.equal(next.currentTime, 31);
  assert.equal(next.playbackRate, 0.85);
  assert.equal(next.plays, 1);
});
