export function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
export function filterStories(
  stories,
  { query = "", testament = "todos", favorites = false, progress = {} } = {},
) {
  const q = normalize(query);
  return stories.filter(
    (s) =>
      (testament === "todos" || s.testament === testament) &&
      (!favorites || progress[s.id]?.favorite === true) &&
      (!q ||
        normalize(`${s.title} ${s.reference} ${s.description}`).includes(q)),
  );
}
export function cleanProgress(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, val] of Object.entries(raw)) {
    const id = Number(key);
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      id > 40 ||
      !val ||
      typeof val !== "object"
    )
      continue;
    out[id] = {
      story_id: id,
      part: Number.isFinite(Number(val.part))
        ? Math.max(0, Math.min(3, Math.trunc(Number(val.part))))
        : 0,
      completed: val.completed === true,
      favorite: val.favorite === true,
    };
  }
  return out;
}
export function mergeProgress(local, remote = []) {
  return cleanProgress({
    ...local,
    ...Object.fromEntries(remote.map((p) => [p.story_id, p])),
  });
}
export function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
