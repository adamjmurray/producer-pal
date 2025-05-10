// device/write-clip.js
const { parseToneLang } = require("./tone-lang");
const { cssToLiveColor } = require("./utils");
const { readClip } = require("./read-clip");

/**
 * Creates or updates a MIDI clip at the specified track and clip slot
 * @param {Object} args - The clip parameters
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {number} args.clipSlotIndex - Clip slot index (0-based)
 * @param {string} [args.notes] - ToneLang musical notation string
 * @param {string} [args.name] - Optional clip name
 * @param {string} [args.color] - Optional clip color (CSS format: hex, rgb(), or named color)
 * @param {boolean} [args.loop=false] - Enable looping for the clip
 * @param {boolean} [args.autoplay=false] - Automatically play the clip after creating it
 * @param {boolean} [args.deleteExistingNotes=false] - Whether to delete existing notes before adding new ones
 * @returns {Object} Result object with clip information
 */
function writeClip({
  trackIndex,
  clipSlotIndex,
  notes: toneLangString = null,
  name = null,
  color = null,
  start_marker = null,
  end_marker = null,
  loop_start = null,
  loop_end = null,
  loop = null,
  autoplay = false,
  deleteExistingNotes = false,
}) {
  const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);
  const hasClip = clipSlot.get("has_clip")?.[0] > 0;
  const notes = parseToneLang(toneLangString);

  // Calculate clip length based on the end time of the last note or use a default
  const lastNoteEndTime = notes.length > 0 ? Math.max(...notes.map((note) => note.start_time + note.duration)) : 0;
  const clipLength = Math.max(4, Math.ceil(lastNoteEndTime));

  if (!hasClip) {
    clipSlot.call("create_clip", clipLength);
  }
  const clip = new LiveAPI(`${clipSlot.unquotedpath} clip`);

  if (deleteExistingNotes) {
    clip.call("remove_notes_extended", 0, 127, 0, clip.get("length")?.[0]);
  }

  if (name != null) {
    clip.set("name", name);
  }

  if (color != null) {
    clip.set("color", cssToLiveColor(color));
  }

  // TODO: need to conditionally set start_marker or end_marker first because start must always be before end
  if (start_marker != null) {
    clip.set("start_marker", start_marker);
  }

  if (end_marker != null) {
    clip.set("end_marker", end_marker);
  }

  // and similarly here
  // also we should throw an error if start > end
  if (loop_start != null) {
    clip.set("loop_start", loop_start);
  }

  if (loop_end != null) {
    clip.set("loop_end", loop_end);
  }

  if (loop != null) {
    clip.set("looping", loop);
  }

  if (notes.length > 0) {
    clip.call("add_new_notes", { notes });
  }

  if (autoplay) {
    clipSlot.call("fire");
  }

  return readClip({ trackIndex, clipSlotIndex });
}

module.exports = { writeClip };
