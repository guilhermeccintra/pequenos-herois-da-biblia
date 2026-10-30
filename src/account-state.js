import { mergeProgress } from "./core.js";

// Each response belongs to the user and refresh that requested it. Never let a
// delayed response mutate a different account, even if the browser session changed.
export function createAccountRefresher(
  state,
  { request, readLocal, writeLocal, notify, demo = false },
) {
  let generation = 0;
  return async function refreshAccount() {
    const current = ++generation;
    const userId = state.session?.user.id;
    const isCurrent = () =>
      generation === current && state.session?.user.id === userId;
    state.subscription = null;
    state.hasAccess = demo;
    state.progress = readLocal(userId);
    if (!userId || demo) return;
    const before = structuredClone(state.progress);
    try {
      const result = await request(userId);
      if (!isCurrent() || result.user?.id !== userId) return;
      const next = mergeProgress(before, result.progress);
      // Preserve interactions performed while the account request was in flight.
      for (const [id, value] of Object.entries(state.progress)) {
        if (JSON.stringify(value) !== JSON.stringify(before[id]))
          next[id] = value;
      }
      state.subscription = result.subscription;
      state.hasAccess = result.hasAccess === true;
      state.progress = next;
      writeLocal(next, userId);
    } catch (error) {
      if (!isCurrent()) return;
      state.subscription = null;
      state.hasAccess = false;
      notify(error.message);
    }
  };
}
