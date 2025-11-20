/**
 * Apply v0 (velocity 0) deletions to notes in serial order.
 * For each v0 note encountered, removes all previously-processed notes
 * that match its pitch and start_time, then removes the v0 note itself.
 *
 * This is the central place where v0 notes are filtered out before sending
 * to the Live API (which cannot handle velocity 0).
 *
 * @param {Array} notes - Notes including v0 notes
 * @returns {Array} Notes with v0 deletions applied (v0 notes filtered out)
 */
export function applyV0Deletions(notes) {
  return notes.reduce((result, note) => {
    if (note.velocity === 0) {
      // v0 note - filter out matching notes from results so far, but DON'T add the v0 note
      return result.filter(
        (existingNote) =>
          existingNote.pitch !== note.pitch ||
          Math.abs(existingNote.start_time - note.start_time) >= 0.001,
      );
    }
    // Regular note - add to results
    return [...result, note];
  }, []);
}
