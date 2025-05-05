// device/create-clip.js
const { parseToneLang } = require("./tone-lang");

/**
 * Creates a MIDI clip with optional notes at the specified track and clip slot
 * @param {Object} args - The clip creation parameters
 * @param {number} args.track - Track index (0-based)
 * @param {number} args.clipSlot - Clip slot index (0-based)
 * @param {string} [args.notes] - ToneLang musical notation string
 * @param {string} [args.name] - Optional clip name
 * @param {string} [args.autoplay] - Optional clip name
 * @returns {string} Result message
 */
function createClip({
  track: trackIndex,
  clipSlot: clipSlotIndex,
  notes: toneLangString,
  name = "",
  loop = false,
  autoplay = false,
}) {
  const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);
  if (clipSlot.get("has_clip") == 0) {
    const notes = parseToneLang(toneLangString);

    // Calculate clip length based on the end time of the last note
    const lastNoteEndTime = notes.length > 0 ? Math.max(...notes.map((note) => note.start_time + note.duration)) : 0;
    const clipLength = Math.max(4, Math.ceil(lastNoteEndTime));

    clipSlot.call("create_clip", clipLength);
    const clip = new LiveAPI(`${clipSlot.unquotedpath} clip`);

    clip.set("name", name);
    clip.set("looping", loop);

    if (notes.length > 0) {
      clip.call("add_new_notes", { notes });

      if (autoplay) {
        clipSlot.call("fire");
      }

      return `Created clip${name ? ` "${name}"` : ""} with ${
        notes.length
      } notes at track ${trackIndex}, clip slot ${clipSlotIndex}`;
    } else {
      return `Created empty clip${name ? ` "${name}"` : ""} at track ${trackIndex}, clip slot ${clipSlotIndex}`;
    }
  } else {
    throw new Error(`Clip slot already has a clip at track ${trackIndex}, clip slot ${clipSlotIndex}`);
  }
}

module.exports = { createClip };
