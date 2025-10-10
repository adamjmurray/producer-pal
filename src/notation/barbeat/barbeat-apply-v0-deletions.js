/**
 * Apply v0 (velocity 0) deletions to notes in serial order.
 * For each v0 note encountered, removes all previously-processed notes
 * that match its pitch and start_time.
 *
 * IMPORTANT: v0 notes are NOT filtered out from the result. This is required
 * because update-clip merge mode needs v0 notes to delete matching notes from
 * the existing clip. The tool functions (create-clip, update-clip) are
 * responsible for filtering out v0 notes before sending to Live API.
 *
 * @param {Array} notes - Notes including v0 notes
 * @returns {Array} Notes with v0 deletions applied (v0 notes still included)
 */
export function applyV0Deletions(notes) {
  return notes.reduce((result, note) => {
    if (note.velocity === 0) {
      // v0 note - filter out matching notes from results so far, then add v0 note
      const filtered = result.filter(
        (existingNote) =>
          existingNote.pitch !== note.pitch ||
          Math.abs(existingNote.start_time - note.start_time) >= 0.001,
      );
      return [...filtered, note];
    } else {
      // Regular note - add to results
      return [...result, note];
    }
  }, []);
}
