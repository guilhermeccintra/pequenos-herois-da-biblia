#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { safeAssetPath } from '../server/rules.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function options(args) {
  const result = { dryRun: false, content: resolve(projectRoot, 'content/stories.json'), assets: resolve(projectRoot, 'assets-private') };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--dry-run') result.dryRun = true;
    else if (['--content', '--assets'].includes(args[index]) && args[index + 1]) result[args[index].slice(2)] = resolve(args[++index]);
    else throw new Error('Use: node scripts/import-content.mjs [--dry-run] [--content arquivo.json] [--assets pasta]');
  }
  return result;
}

export async function prepareImport({ content, assets }) {
  const stories = JSON.parse(await readFile(content, 'utf8'));
  if (!Array.isArray(stories) || stories.length !== 40 || new Set(stories.map((story) => story.id)).size !== 40) {
    throw new Error('O conteúdo deve conter exatamente 40 histórias com IDs únicos de 1 a 40.');
  }
  const base = await realpath(assets);
  const images = [];
  for (const story of stories) {
    if (!Number.isInteger(story.id) || story.id < 1 || story.id > 40 ||
      !Array.isArray(story.parts) || story.parts.length !== 3 ||
      !['antigo', 'novo'].includes(story.testament)) throw new Error(`Estrutura inválida na história ${story.id}.`);
    for (const field of ['title', 'subtitle', 'reference', 'description', 'lesson', 'question', 'prayer']) {
      if (typeof story[field] !== 'string' || !story[field].trim()) throw new Error(`Campo ${field} ausente na história ${story.id}.`);
    }
    const number = String(story.id).padStart(2, '0');
    if (story.cover !== `/images/covers/${number}.webp`) throw new Error(`Caminho da capa inválido na história ${story.id}.`);
    if (story.audio_path != null) safeAssetPath(story.audio_path);
    const paths = [`${number}/cover.webp`];
    for (const [index, part] of story.parts.entries()) {
      if (part.image !== `${number}/part${index + 1}.webp`) throw new Error(`Caminho de imagem inválido na história ${story.id}.`);
      if (!part.heading || !part.alt || !Array.isArray(part.paragraphs) || !part.paragraphs.length ||
        part.paragraphs.some((text) => typeof text !== 'string' || !text.trim())) throw new Error(`Parte incompleta na história ${story.id}.`);
      paths.push(part.image);
    }
    for (const path of paths) {
      safeAssetPath(path);
      const absolute = await realpath(resolve(base, path));
      const local = relative(base, absolute);
      if (local === '..' || local.startsWith(`..${sep}`)) throw new Error('Uma imagem aponta para fora da pasta de mídia.');
      const bytes = await readFile(absolute);
      if (bytes.length < 12 || bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.subarray(8, 12).toString() !== 'WEBP') {
        throw new Error(`A imagem ${path} não é um arquivo WebP válido.`);
      }
      if (bytes.length > 50 * 1024 * 1024) throw new Error(`A imagem ${path} excede 50 MiB.`);
      images.push({ path, absolute, size: bytes.length });
    }
  }
  return { stories, images };
}

async function main() {
  const opts = options(process.argv.slice(2));
  // Validate everything before making the first remote mutation.
  const { stories, images } = await prepareImport(opts);
  const report = { dryRun: opts.dryRun, stories: stories.length, images: images.length, totalBytes: images.reduce((total, image) => total + image.size, 0) };
  if (opts.dryRun) { console.log(JSON.stringify(report, null, 2)); return; }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor. Use --dry-run para validar sem enviar.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: bucket, error: bucketError } = await client.storage.getBucket('story-assets');
  if (bucketError || !bucket || bucket.public) throw new Error('O bucket story-assets deve existir e ser privado. Execute a migração SQL antes da importação.');
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < images.length) {
      const image = images[cursor++];
      const { error } = await client.storage.from('story-assets').upload(image.path, await readFile(image.absolute), {
        contentType: 'image/webp', upsert: true, cacheControl: '300',
      });
      if (error) throw new Error(`Falha ao enviar ${image.path}. Corrija a conexão/permissões e execute novamente.`);
    }
  }));
  for (const story of stories) {
    const { error } = await client.rpc('import_story', { p_id: story.id, p_body: story });
    if (error) throw new Error(`Falha ao gravar a história ${story.id}. Confirme a migração e execute novamente; o processo é reexecutável.`);
  }
  console.log(JSON.stringify({ ...report, uploaded: true, preservedExistingAudio: true }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
