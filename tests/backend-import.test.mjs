import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test('importer dry run validates all 40 narratives and 160 private images without credentials', async () => {
  let result;
  try { result = await execute(process.execPath, ['scripts/import-content.mjs', '--dry-run'], { cwd: root }); }
  catch (error) { assert.fail(`dry run should work without external services: ${error.stderr}`); }
  const report = JSON.parse(result.stdout);
  assert.equal(report.dryRun, true);
  assert.equal(report.stories, 40);
  assert.equal(report.images, 160);
  assert.ok(report.totalBytes > 100_000);
});

test('importer rejects narrative media traversal before any network operation', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'ph-import-'));
  try {
    const stories = JSON.parse(await readFile(join(root, 'content/stories.json'), 'utf8'));
    stories[1].parts[0].image = '../secret.webp';
    const path = join(temporary, 'invalid.json');
    await writeFile(path, JSON.stringify(stories));
    await assert.rejects(execute(process.execPath, ['scripts/import-content.mjs', '--dry-run', '--content', path], { cwd: root }), (error) => {
      assert.match(error.stderr, /imagem|caminho/i);
      assert.doesNotMatch(error.stderr, /SERVICE_ROLE|fetch failed/);
      return true;
    });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('importer rejects an incomplete catalog before attempting uploads', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'ph-import-'));
  try {
    const stories = JSON.parse(await readFile(join(root, 'content/stories.json'), 'utf8')).slice(0, 39);
    const path = join(temporary, 'missing.json');
    await writeFile(path, JSON.stringify(stories));
    await assert.rejects(execute(process.execPath, ['scripts/import-content.mjs', '--content', path], { cwd: root }), (error) => {
      assert.match(error.stderr, /40 histórias/i);
      return true;
    });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
