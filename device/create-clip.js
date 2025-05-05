// device/create-clip.js
const { parseToneLang } = require("./tone-lang");
const { cssToLiveColor } = require("./utils");

/**
 * Creates a MIDI clip with optional notes at the specified track and clip slot
 * @param {Object} args - The clip creation parameters
 * @param {number} args.track - Track index (0-based)
 * @param {number} args.clipSlot - Clip slot index (0-based)
 * @param {string} [args.notes] - ToneLang musical notation string
 * @param {string?} [args.name] - Optional clip name
 * @param {string?} [args.color] - Optional clip color (CSS format: hex, rgb(), or named color)
 * @param {boolean} [args.loop] - Enable looping for the clip
 * @param {boolean} [args.autoplay] - Automatically play the clip after creating it
 * @param {'error' | 'replace' | 'merge'} [args.onExistingClip] - How to handle an existing clip: 'error', 'replace', or 'merge'
 * @returns {string} Result message
 */
function createClip({
  track: trackIndex,
  clipSlot: clipSlotIndex,
  notes: toneLangString,
  name = null,
  color = null,
  loop = false,
  autoplay = false,
  onExistingClip = "error",
}) {
  const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);
  const hasClip = clipSlot.get("has_clip") > 0;
  const notes = parseToneLang(toneLangString);

  // Calculate clip length based on the end time of the last note or use a default
  const lastNoteEndTime = notes.length > 0 ? Math.max(...notes.map((note) => note.start_time + note.duration)) : 0;
  const clipLength = Math.max(4, Math.ceil(lastNoteEndTime));

  // Handle existing clip according to the onExistingClip parameter
  if (hasClip) {
    if (onExistingClip === "error") {
      throw new Error(`Clip slot already has a clip at track ${trackIndex}, clip slot ${clipSlotIndex}`);
    } else if (onExistingClip === "replace") {
      clipSlot.call("delete_clip");
      clipSlot.call("create_clip", clipLength);
    }
    // For "merge", we don't need to do anything yet
  } else {
    // No existing clip, create a new one
    clipSlot.call("create_clip", clipLength);
  }

  // Get the clip object (whether it's a newly created clip or an existing one)
  const clip = new LiveAPI(`${clipSlot.unquotedpath} clip`);

  // Allow properties to be changed on create, merge, or replace
  if (name !== null) {
    clip.set("name", name);
  }
  if (color !== null) {
    const liveColor = cssToLiveColor(color);
    clip.set("color", liveColor);
  }

  clip.set("looping", loop);

  // Add notes if there are any
  if (notes.length > 0) {
    clip.call("add_new_notes", { notes });
  }

  // Fire the clip if autoplay is enabled
  if (autoplay) {
    clipSlot.call("fire");
  }

  // Build the result message
  let message;

  if (hasClip) {
    if (onExistingClip === "replace") {
      const emptyText = notes.length === 0 ? " empty" : "";
      const notesText = notes.length > 0 ? ` with ${notes.length} notes` : "";
      const nameText = name ? ` "${name}"` : "";
      message = `Replaced with${emptyText} clip${nameText}${notesText} at track ${trackIndex}, clip slot ${clipSlotIndex}`;
    } else {
      // "merge"
      if (notes.length === 0) {
        message = `No notes to merge into existing clip at track ${trackIndex}, clip slot ${clipSlotIndex}`;
      } else {
        message = `Merged ${notes.length} notes into existing clip at track ${trackIndex}, clip slot ${clipSlotIndex}`;
      }
    }
  } else {
    const emptyText = notes.length === 0 ? " empty" : "";
    const notesText = notes.length > 0 ? ` with ${notes.length} notes` : "";
    const nameText = name ? ` "${name}"` : "";
    message = `Created${emptyText} clip${nameText}${notesText} at track ${trackIndex}, clip slot ${clipSlotIndex}`;
  }

  return message;
}

module.exports = { createClip };
