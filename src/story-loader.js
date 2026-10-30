export async function loadStory(
  id,
  { member = false, demo = false, fetchSample, fetchMember, fetchDemo },
) {
  if (demo) return id === 1 ? fetchSample() : fetchDemo(id);
  if (id !== 1) return fetchMember(id);
  if (member) {
    try {
      return await fetchMember(id);
    } catch (error) {
      if (![401, 403].includes(error.status)) throw error;
    }
  }
  return fetchSample();
}
