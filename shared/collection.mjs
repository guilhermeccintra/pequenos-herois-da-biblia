/** Public collection contract; contains no paid narrative or server configuration. */
export const STORY_COUNT = 365;
export const ORIGINAL_STORY_COUNT = 40;
export const IMAGES_PER_STORY = 4;
export const LIBRARY_PAGE_SIZE = 24;
export function isStoryId(value) {
  return Number.isInteger(value) && value >= 1 && value <= STORY_COUNT;
}
export function storyCode(id) {
  if (!isStoryId(id)) throw new RangeError('Identificação de história inválida.');
  return String(id).padStart(2, '0');
}
export function parseStorySelection(value) {
  return typeof value === 'string' && /^[1-9]\d{0,2}$/.test(value) && isStoryId(Number(value));
}
