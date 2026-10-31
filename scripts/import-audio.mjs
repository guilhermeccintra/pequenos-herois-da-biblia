#!/usr/bin/env node
/** Import reviewed human or AI MP3s into private Supabase Storage. Node 22+. */
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMp3 } from './generate-narration.mjs';

import { STORY_COUNT, isStoryId, parseStorySelection, storyCode } from '../shared/collection.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'story-assets';
const sha256 = value => createHash('sha256').update(value).digest('hex');
class InstructionError extends Error {}

export function audioObjectPath(id, digest) {
  if (!isStoryId(id) || !/^[a-f0-9]{64}$/.test(digest)) throw new InstructionError('Identificação de áudio inválida.');
  return `audio/${String(id).padStart(2, '0')}/${digest}.mp3`;
}

export function parseArgs(argv) {
  const options = { source: 'human', confirm: false, story: 'all' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--confirm-upload') options.confirm = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--dir' && argv[i + 1]) options.dir = resolve(argv[++i]);
    else if (arg === '--source' && argv[i + 1]) options.source = argv[++i];
    else if (arg === '--story' && argv[i + 1]) options.story = argv[++i];
    else throw new InstructionError('Use --dir PASTA, --story 1|all, --source human|elevenlabs e --confirm-upload.');
  }
  if (!options.dir) throw new InstructionError('Informe --dir com a pasta dos MP3s revisados, nomeados 01.mp3 a 365.mp3.');
  if (!['human', 'elevenlabs'].includes(options.source)) throw new InstructionError('--source deve ser human ou elevenlabs.');
  if (options.story !== 'all' && !parseStorySelection(options.story)) throw new InstructionError(`--story deve ser de 1 a ${STORY_COUNT} ou all.`);
  return options;
}

export async function main(argv = process.argv.slice(2), env = process.env, fetcher = fetch, stateDir = resolve(ROOT, 'content')) {
  const options = parseArgs(argv);
  const names = (await readdir(options.dir)).filter(name => {
    if (!/^\d{2,3}\.mp3$/.test(name)) return false;
    const id = Number(name.slice(0, -4));
    return isStoryId(id) && name === `${storyCode(id)}.mp3`;
  }).sort((a, b) => Number(a.slice(0, -4)) - Number(b.slice(0, -4)));
  const files = [];
  for (const name of names) {
    const id = Number(name.slice(0, -4));
    if (options.story !== 'all' && id !== Number(options.story)) continue;
    const bytes = await readFile(resolve(options.dir, name));
    if (!isMp3(bytes)) throw new InstructionError(`História ${id}: arquivo não reconhecido como MP3; revise a exportação.`);
    if (bytes.length > 50 * 1024 * 1024) throw new InstructionError(`História ${id}: MP3 excede 50 MB; exporte em 128 kbps.`);
    const digest = sha256(bytes);
    files.push({ id, name, bytes, digest, path: audioObjectPath(id, digest) });
  }
  if (!files.length) throw new InstructionError('Nenhum MP3 válido com o nome esperado foi encontrado.');
  if (!options.confirm || options.dryRun) {
    console.log(`Simulação: ${files.length} MP3(s) de origem ${options.source === 'human' ? 'humana' : 'ElevenLabs'}. Nenhum upload ou alteração no banco.`);
    console.log('Depois de ouvir e revisar os arquivos, use --confirm-upload com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
    return;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new InstructionError('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do operador.');
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new InstructionError('SUPABASE_URL deve ser a origem HTTPS do projeto Supabase.');
  }
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const request = (path, init = {}) => fetcher(new URL(path, base), { ...init,
    headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(120000) });
  const bucketResponse = await request(`/storage/v1/bucket/${BUCKET}`);
  if (!bucketResponse.ok) throw new InstructionError(`Não foi possível verificar o bucket privado (HTTP ${bucketResponse.status}).`);
  const bucket = await bucketResponse.json();
  if (bucket.public !== false) throw new InstructionError('Importação bloqueada: story-assets precisa ser privado.');
  const manifestPath = resolve(stateDir, 'audio-import-manifest.json');
  const lockPath = resolve(stateDir, '.audio-import.lock');
  await mkdir(dirname(manifestPath), { recursive: true });
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new InstructionError('Outra importação está em andamento ou deixou uma trava. Consulte docs/NARRACAO.md.'); throw error; }
  try {
    let manifest = { version: 1, stories: {} };
    try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (manifest.version !== 1 || !manifest.stories) throw new InstructionError('Manifesto de importação incompatível.');
    for (const file of files) {
      const query = new URLSearchParams({ id: `eq.${file.id}`, select: 'id,body' });
      const currentResponse = await request(`/rest/v1/stories?${query}`);
      if (!currentResponse.ok) throw new InstructionError(`História ${file.id}: leitura do banco falhou (HTTP ${currentResponse.status}).`);
      const rows = await currentResponse.json();
      if (!Array.isArray(rows) || rows.length !== 1 || !rows[0].body || rows[0].body.id !== file.id) {
        throw new InstructionError(`História ${file.id}: importe o conteúdo completo antes do áudio.`);
      }
      const body = rows[0].body;
      const upload = await request(`/storage/v1/object/${BUCKET}/${file.path}`, {
        method: 'POST', headers: { 'Content-Type': 'audio/mpeg', 'x-upsert': 'false', 'Cache-Control': '3600' }, body: file.bytes });
      if (!upload.ok) {
        // Verify an existing content-addressed object instead of overwriting it.
        const existing = await request(`/storage/v1/object/authenticated/${BUCKET}/${file.path}`);
        if (!existing.ok || sha256(Buffer.from(await existing.arrayBuffer())) !== file.digest) {
          throw new InstructionError(`História ${file.id}: upload não confirmado (HTTP ${upload.status}); banco preservado.`);
        }
      }
      if (body.audio_path !== file.path) {
        // Compare the whole previous JSON body to avoid losing simultaneous content edits.
        const updateQuery = new URLSearchParams({ id: `eq.${file.id}`, body: `eq.${JSON.stringify(body)}`, select: 'id' });
        const update = await request(`/rest/v1/stories?${updateQuery}`, { method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ body: { ...body, audio_path: file.path } }) });
        if (!update.ok) throw new InstructionError(`História ${file.id}: upload feito, mas associação falhou (HTTP ${update.status}). Execute novamente para retomar.`);
        const updated = await update.json();
        if (!Array.isArray(updated) || updated.length !== 1) throw new InstructionError(`História ${file.id}: conteúdo foi alterado em paralelo; execute novamente após a revisão.`);
      }
      manifest.stories[String(file.id).padStart(2, '0')] = { source: options.source, audio_sha256: file.digest,
        bytes: file.bytes.length, audio_path: file.path, imported_at: new Date().toISOString() };
      await writeFile(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
      await rename(`${manifestPath}.tmp`, manifestPath);
      console.log(`História ${String(file.id).padStart(2, '0')}: áudio privado associado e manifesto atualizado.`);
    }
  } finally { await lock.close(); await rm(lockPath, { force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof InstructionError ? error.message : 'A importação parou. Verifique conexão, arquivos e permissões; nenhum segredo foi registrado.');
    process.exitCode = 1;
  });
}
