import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { main as generate, isMp3, parseArgs as generationArgs } from '../scripts/generate-narration.mjs';
import { main as importAudio, audioObjectPath } from '../scripts/import-audio.mjs';

const syntheticHeader = () => { const bytes = Buffer.alloc(2048); bytes.write('ID3'); return bytes; };
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const credentials = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'TEST_ONLY' };
const voiceCredentials = { ELEVENLABS_API_KEY: 'TEST_ONLY', ELEVENLABS_VOICE_ID: 'test-voice' };

test('geração sem confirmação explícita ou sem chaves nunca chama o provedor', async () => {
  let calls = 0;
  const network = () => { calls++; throw new Error('Rede não deve ser usada'); };
  await generate(['--story', '1'], {}, network);
  await generate(['--story', '1', '--confirm-cost', '--dry-run'], voiceCredentials, network);
  await assert.rejects(generate(['--story', '1', '--confirm-cost'], {}, network), /ELEVENLABS_API_KEY/);
  assert.equal(calls, 0);
  assert.throws(() => generationArgs(['--story', '41']), /1 a 40/);
  assert.equal(isMp3(Buffer.from('<html>error</html>')), false);
  assert.throws(() => audioObjectPath(41, 'a'.repeat(64)), /inválida/);
});

test('retomada da geração não duplica cobrança nem sobrescreve áudio concluído', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'narration-test-'));
  let calls = 0;
  const network = async (url, init) => {
    calls++;
    assert.match(url, /\/v1\/text-to-speech\/test-voice\?output_format=mp3_44100_128$/);
    assert.equal(JSON.parse(init.body).model_id, 'eleven_multilingual_v2');
    return new Response(syntheticHeader(), { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  try {
    const args = ['--story', '1', '--out', directory, '--confirm-cost'];
    await generate(args, voiceCredentials, network);
    const first = await readFile(resolve(directory, '01.mp3'));
    await generate(args, voiceCredentials, network);
    assert.equal(calls, 1);
    assert.deepEqual(await readFile(resolve(directory, '01.mp3')), first);
    await assert.rejects(generate(args, { ...voiceCredentials, ELEVENLABS_VOICE_ID: 'changed' }, network), /registro anterior/);
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('resultado de geração incerto nunca é repetido automaticamente', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'narration-failure-'));
  let calls = 0;
  const network = async () => { calls++; throw new Error('Timed out'); };
  try {
    const args = ['--story', '2', '--out', directory, '--confirm-cost'];
    await assert.rejects(generate(args, voiceCredentials, network), /resultado incerto/);
    const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
    assert.equal(manifest.stories['02'].status, 'uncertain');
    await assert.rejects(generate(args, voiceCredentials, network), /registro anterior/);
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('importação de MP3 humano simula sem rede e recusa bucket público', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'audio-import-check-'));
  try {
    await writeFile(resolve(directory, '01.mp3'), syntheticHeader());
    let calls = 0;
    await importAudio(['--dir', directory], {}, () => { calls++; });
    assert.equal(calls, 0);
    await assert.rejects(importAudio(['--dir', directory, '--confirm-upload'], credentials,
      async () => { calls++; return jsonResponse({ public: true }); }), /precisa ser privado/);
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('importação associa MP3 privado sem alterar narrativa e retoma após arquivo já existente', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'audio-import-flow-'));
  const audio = syntheticHeader();
  let story = { id: 1, title: 'Preservar', parts: [{ paragraphs: ['Texto intacto.'] }], audio_path: null };
  let uploaded = false;
  let patches = 0;
  const network = async (input, init) => {
    const url = new URL(input);
    if (url.pathname === '/storage/v1/bucket/story-assets') return jsonResponse({ public: false });
    if (url.pathname === '/rest/v1/stories' && !init.method) return jsonResponse([{ id: 1, body: story }]);
    if (url.pathname.startsWith('/storage/v1/object/story-assets/') && init.method === 'POST') {
      assert.equal(init.headers['x-upsert'], 'false');
      if (uploaded) return jsonResponse({ error: 'exists' }, 409);
      uploaded = true;
      return jsonResponse({ Key: 'private' });
    }
    if (url.pathname.startsWith('/storage/v1/object/authenticated/')) return new Response(audio);
    if (url.pathname === '/rest/v1/stories' && init.method === 'PATCH') {
      assert.equal(url.searchParams.get('body'), `eq.${JSON.stringify(story)}`);
      story = JSON.parse(init.body).body;
      patches++;
      return jsonResponse([{ id: 1 }]);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  try {
    await writeFile(resolve(directory, '01.mp3'), audio);
    const args = ['--dir', directory, '--confirm-upload', '--source', 'human'];
    await importAudio(args, credentials, network, directory);
    assert.equal(story.title, 'Preservar');
    assert.deepEqual(story.parts, [{ paragraphs: ['Texto intacto.'] }]);
    assert.match(story.audio_path, /^audio\/01\/[a-f0-9]{64}\.mp3$/);
    await importAudio(args, credentials, network, directory);
    assert.equal(patches, 1);
    const manifest = JSON.parse(await readFile(resolve(directory, 'audio-import-manifest.json'), 'utf8'));
    assert.equal(manifest.stories['01'].source, 'human');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
