import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("..", import.meta.url)),
  dist = join(root, "dist");
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}
const files = await walk(dist),
  stories = JSON.parse(
    await readFile(join(root, "content/stories.json"), "utf8"),
  );
for (const file of files) {
  assert.ok(
    !file.includes("assets-private") && !file.includes("/content/"),
    "Conteúdo privado copiado para dist",
  );
  if (!/\.(js|json|html|txt)$/.test(file)) continue;
  const text = await readFile(file, "utf8");
  for (const story of stories.slice(1))
    for (const part of story.parts)
      for (const paragraph of part.paragraphs)
        assert.ok(
          !text.includes(paragraph),
          `História paga incluída em ${file}`,
        );
  assert.ok(
    !/SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|ELEVENLABS_API_KEY/.test(
      text,
    ),
    `Referência a chave de servidor em ${file}`,
  );
}
for (const font of ["fraunces-700", "nunito-sans-400", "nunito-sans-700"])
  assert.ok((await stat(join(dist, "fonts", font + ".woff"))).size > 1000);
assert.equal(
  JSON.parse(await readFile(join(dist, "sample.json"), "utf8")).id,
  1,
);
assert.equal(files.filter((p) => p.endsWith(".webp")).length, 46);
console.log(
  "Build verificado: nenhuma narrativa paga/segredo de servidor;46imagens públicas;3fontes locais;amostra1.",
);
