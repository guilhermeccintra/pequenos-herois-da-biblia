import { cleanProgress } from "./core.js";
import { createProgressQueue } from "./progress-sync.js";
import { loadStory } from "./story-loader.js";
export const demo =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === "true";
export const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);
let clientPromise;
export async function getClient() {
  if (!configured) return null;
  return (clientPromise ??= import("@supabase/supabase-js").then(
    ({ createClient }) =>
      createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        {
          auth: {
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
          },
        },
      ),
  ));
}
export async function api(path, { method = "GET", body } = {}) {
  const client = await getClient();
  const { data } = client
    ? await client.auth.getSession()
    : { data: { session: null } };
  const response = await fetch(`/api/${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(data.session
        ? { Authorization: `Bearer ${data.session.access_token}` }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response
    .json()
    .catch(() => ({ error: "O serviço não respondeu. Tente novamente." }));
  if (!response.ok) {
    const err = new Error(
      result.error || "Não foi possível concluir. Tente novamente.",
    );
    err.status = response.status;
    throw err;
  }
  return result;
}
async function readJsonResource(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível carregar a história.");
  return response.json();
}
export function getStory(id, { member = false } = {}) {
  return loadStory(id, {
    member,
    demo,
    fetchSample: () => readJsonResource("/sample.json"),
    fetchDemo: (id) => readJsonResource(`/__local/story?id=${id}`),
    fetchMember: async (id) => (await api(`story?id=${id}`)).story,
  });
}
export function loadProgress(userId = "guest") {
  try {
    return cleanProgress(
      JSON.parse(localStorage.getItem(`ph:progress:${userId}`) || "{}"),
    );
  } catch {
    return {};
  }
}
export function saveLocal(progress, userId = "guest") {
  try {
    localStorage.setItem(
      `ph:progress:${userId}`,
      JSON.stringify(cleanProgress(progress)),
    );
  } catch {
    /* Private browsing can disable local storage. */
  }
}
const queueProgress = createProgressQueue(async (userId, row) => {
  const client = await getClient();
  if (!client) return;
  const {
    data: { session },
  } = await client.auth.getSession();
  if (session?.user.id !== userId)
    throw new Error(
      "A leitura ficou salva neste dispositivo. Entre na mesma conta para sincronizar.",
    );
  const { error } = await client
    .from("reading_progress")
    .upsert({ ...row, user_id: userId }, { onConflict: "user_id,story_id" });
  if (error)
    throw new Error(
      "A leitura ficou salva neste dispositivo. A sincronização está indisponível.",
    );
});
export function waitForProgress(userId) {
  return queueProgress.flush(userId);
}
export async function saveProgress(progress, storyId, userId) {
  const row = cleanProgress({ [storyId]: progress[storyId] })[storyId];
  saveLocal(progress, userId);
  if (!userId || demo || !row) return;
  return queueProgress(userId, row);
}
