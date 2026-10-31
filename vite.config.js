import { defineConfig, loadEnv } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { isStoryId, storyCode } from "./shared/collection.mjs";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    build: { target: "es2022", sourcemap: false },
    server: { allowedHosts: ["terminal.local"] },
    plugins:
      env.VITE_LOCAL_DEMO === "true"
        ? [
            {
              name: "local-content-preview",
              apply: "serve",
              configureServer(server) {
                server.middlewares.use(async (req, res, next) => {
                  const url = new URL(req.url, "http://localhost");
                  if (!url.pathname.startsWith("/__local/")) return next();
                  try {
                    res.setHeader("Cache-Control", "no-store");
                    if (url.pathname === "/__local/story") {
                      const id = Number(url.searchParams.get("id"));
                      if (!isStoryId(id)) {
                        res.statusCode = 404;
                        return res.end();
                      }
                      const stories = JSON.parse(
                        await fs.readFile("content/stories.json", "utf8"),
                      );
                      const story = stories.find((s) => s.id === id);
                      if (!story) { res.statusCode = 404; return res.end(); }
                      const result = {
                        ...story,
                        parts: story.parts.map((p) => ({
                          ...p,
                          image: `/__local/image/${p.image}`,
                        })),
                        audio_url: null,
                      };
                      res.setHeader("Content-Type", "application/json");
                      return res.end(JSON.stringify(result));
                    }
                    const match = url.pathname.match(
                      /^\/__local\/image\/(\d{2,3})\/(cover|part[123])\.webp$/,
                    );
                    if (
                      match &&
                      isStoryId(Number(match[1])) &&
                      match[1] === storyCode(Number(match[1]))
                    ) {
                      res.setHeader("Content-Type", "image/webp");
                      return res.end(
                        await fs.readFile(
                          path.join(
                            "assets-private",
                            match[1],
                            `${match[2]}.webp`,
                          ),
                        ),
                      );
                    }
                    res.statusCode = 404;
                    res.end();
                  } catch {
                    res.statusCode = 500;
                    res.end("Conteúdo de prévia indisponível.");
                  }
                });
              },
            },
          ]
        : [],
  };
});
