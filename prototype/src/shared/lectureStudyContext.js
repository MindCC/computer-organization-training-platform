import { COURSEWARE } from '../courseware.js';

// Resolve only platform catalogue entries, never client-supplied titles or URLs.
export function lectureOf(context = {}) {
  if (!Number.isInteger(context?.lectureIndex) || context.lectureIndex < 0) return null;
  const chapter = COURSEWARE.chapters.find(item => item.id === context.chapterId);
  const lecture = chapter?.embeds?.[context.lectureIndex];
  return lecture ? { chapter, lecture } : null;
}
