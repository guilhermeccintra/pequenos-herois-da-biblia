// Serialize writes per account/story. A slow earlier click cannot overwrite a
// later favorite or reading position. Different accounts/stories stay independent.
export function createProgressQueue(writeRemote) {
  const pending = new Map();
  const enqueue = async (userId, row) => {
    const snapshot = structuredClone(row),
      key = `${userId}:${snapshot.story_id}`;
    const previous = pending.get(key) || Promise.resolve();
    const job = previous
      .catch(() => {})
      .then(() => writeRemote(userId, snapshot));
    pending.set(key, job);
    try {
      return await job;
    } finally {
      if (pending.get(key) === job) pending.delete(key);
    }
  };
  enqueue.flush = async (userId) =>
    Promise.allSettled(
      [...pending.entries()]
        .filter(([key]) => key.startsWith(`${userId}:`))
        .map(([, job]) => job),
    );
  return enqueue;
}
