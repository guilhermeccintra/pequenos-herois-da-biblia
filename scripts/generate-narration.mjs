#!/usr/bin/env node
/** Optional paid ElevenLabs generation. A simulation is the default. Node 22+. */
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { STORY_COUNT, parseStorySelection } from '../shared/collection.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.62, similarity_boost: 0.75, style: 0.12, use_speaker_boost: true };
const sha256 = value => createHash('sha256').update(value).digest('hex');
class InstructionError extends Error {}

export function buildNarrationText(story) {
  return [story.title, story.subtitle, `Referência bíblica: ${story.reference}.`,
    ...story.parts.flatMap((part, index) => [`Parte ${index + 1}. ${part.heading}`, ...part.paragraphs]),
    'Para guardar no coração.', story.lesson, 'Vamos conversar?', story.question,
    'Uma oração.', story.prayer].join('\n\n');
}

export function isMp3(bytes) {
  if (!bytes || bytes.length < 1024) return false;
  if (bytes.subarray(0, 3).toString() === 'ID3') return true;
  // MPEG audio frame header. Full acoustic review is required before publication.
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 &&
    (bytes[1] & 0x18) !== 0x08 && (bytes[1] & 0x06) !== 0 &&
    (bytes[2] & 0xf0) !== 0xf0 && (bytes[2] & 0x0c) !== 0x0c;
}

export function parseArgs(argv) {
  const options = { story: 'all', out: resolve(ROOT, 'content/audio-generated'), confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--confirm-cost') options.confirm = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--story' && argv[i + 1]) options.story = argv[++i];
    else if (arg === '--out' && argv[i + 1]) options.out = resolve(argv[++i]);
    else throw new InstructionError(`Opção inválida: ${arg.startsWith('--') ? arg : '(valor)'}. Use --story 1|all, --out PASTA e --confirm-cost.`);
  }
  if (options.story !== 'all' && !parseStorySelection(options.story)) {
    throw new InstructionError(`--story deve ser um número de 1 a ${STORY_COUNT} ou all.`);
  }
  return options;
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
async function readOptional(path) {
  try { return await readFile(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function saveManifest(path, manifest) {
  await writeFile(`${path}.tmp`, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}

export async function main(argv = process.argv.slice(2), env = process.env, fetcher = fetch) {
  const options = parseArgs(argv);
  const all = await readJson(resolve(ROOT, 'content/stories.json'));
  const stories = all.filter(story => options.story === 'all' || story.id === Number(options.story));
  if (!stories.length) throw new InstructionError('A história selecionada não está disponível no acervo local.');
  const texts = stories.map(story => ({ story, text: buildNarrationText(story) }));
  for (const { story, text } of texts) {
    if (text.length >= 10000) throw new InstructionError(`História ${story.id} excede o limite de menos de 10.000 caracteres; nada foi enviado.`);
  }
  if (!options.confirm || options.dryRun) {
    console.log(`Simulação: ${texts.length} história(s), ${texts.reduce((sum, item) => sum + item.text.length, 0)} caracteres. Nenhuma chamada ou cobrança.`);
    console.log('Para gerar, defina ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID e use --confirm-cost. A geração usa créditos do provedor.');
    return;
  }
  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
    throw new InstructionError('Defina ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID no ambiente. Nenhuma chamada realizada.');
  }
  await mkdir(options.out, { recursive: true });
  const lockPath = resolve(options.out, '.generation.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new InstructionError('Existe uma trava de geração. Consulte docs/NARRACAO.md antes de removê-la.');
    throw error;
  }
  try {
    const manifestPath = resolve(options.out, 'manifest.json');
    const manifest = await readJson(manifestPath, { version: 1, source: 'elevenlabs', stories: {} });
    if (manifest.version !== 1 || !manifest.stories) throw new InstructionError('Manifesto incompatível. Preserve-o e revise antes de continuar.');
    for (const { story, text } of texts) {
      const code = String(story.id).padStart(2, '0');
      const filePath = resolve(options.out, `${code}.mp3`);
      const inputHash = sha256(JSON.stringify({ text, model: MODEL, voice: env.ELEVENLABS_VOICE_ID, settings: SETTINGS }));
      const record = manifest.stories[code];
      const existing = await readOptional(filePath);
      if (record) {
        if (record.status === 'completed' && record.input_sha256 === inputHash && existing && sha256(existing) === record.audio_sha256) {
          console.log(`História ${code}: áudio já concluído e íntegro; ignorada.`);
          continue;
        }
        throw new InstructionError(`História ${code}: há registro anterior incompleto, alterado ou arquivo ausente. Nenhuma regeneração automática; consulte docs/NARRACAO.md.`);
      }
      if (existing) throw new InstructionError(`História ${code}: MP3 já existe sem manifesto correspondente; não será sobrescrito.`);
      // Persist before the billable request. An ambiguous outcome is never retried automatically.
      manifest.stories[code] = { status: 'started', input_sha256: inputHash, characters: text.length,
        model: MODEL, started_at: new Date().toISOString() };
      await saveManifest(manifestPath, manifest);
      try {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_128`;
        const response = await fetcher(url, { method: 'POST',
          headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
          signal: AbortSignal.timeout(180000) });
        if (!response.ok) throw new InstructionError(`ElevenLabs retornou HTTP ${response.status}; geração interrompida, sem repetição automática.`);
        const audio = Buffer.from(await response.arrayBuffer());
        if (!isMp3(audio)) throw new InstructionError('O provedor não retornou um MP3 reconhecível; geração interrompida.');
        await writeFile(`${filePath}.part`, audio, { flag: 'wx', mode: 0o600 });
        await rename(`${filePath}.part`, filePath);
        manifest.stories[code] = { ...manifest.stories[code], status: 'completed',
          audio_sha256: sha256(audio), bytes: audio.length, finished_at: new Date().toISOString() };
        await saveManifest(manifestPath, manifest);
        console.log(`História ${code}: MP3 gerado. Escute e revise antes de importar.`);
      } catch (error) {
        manifest.stories[code] = { ...manifest.stories[code], status: 'uncertain' };
        await saveManifest(manifestPath, manifest);
        if (error instanceof InstructionError) throw error;
        throw new InstructionError(`História ${code}: resultado incerto por falha de rede ou gravação. Consulte o histórico do provedor antes de qualquer nova tentativa.`);
      }
    }
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof InstructionError ? error.message : 'Não foi possível preparar a narração. Verifique arquivos e permissões. Nenhum segredo foi registrado.');
    process.exitCode = 1;
  });
}
