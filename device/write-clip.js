// device/write-clip.js
const { parseToneLang } = require("./tone-lang");
const { cssToLiveColor } = require("./utils");

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
  notes: toneLangString,
  name = null,
  color = null,
  loop = false,
  autoplay = false,
  deleteExistingNotes = false,
}) {
  const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);
  const hasClip = clipSlot.get("has_clip") > 0;
  const notes = parseToneLang(toneLangString);

  // Calculate clip length based on the end time of the last note or use a default
  const lastNoteEndTime = notes.length > 0 ? Math.max(...notes.map((note) => note.start_time + note.duration)) : 0;
  const clipLength = Math.max(4, Math.ceil(lastNoteEndTime));

  let resultMessage;

  // Handle creating a new clip or working with an existing one
  if (!hasClip) {
    // No existing clip, create a new one
    clipSlot.call("create_clip", clipLength);
    resultMessage = notes.length > 0 ? `Created clip with ${notes.length} notes` : "Created empty clip";
  } else {
    // Existing clip - either modify or replace based on deleteExistingNotes
    if (deleteExistingNotes) {
      clipSlot.call("delete_clip");
      clipSlot.call("create_clip", clipLength);
      resultMessage =
        notes.length > 0 ? `Replaced with new clip containing ${notes.length} notes` : "Replaced with empty clip";
    } else {
      resultMessage = notes.length > 0 ? `Updated clip with ${notes.length} new notes` : "Updated clip properties";
    }
  }

  // Get the clip object (whether it's a newly created clip or an existing one)
  const clip = new LiveAPI(`${clipSlot.unquotedpath} clip`);

  // Set clip properties
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

  // Get actual clip name and length for returning
  const finalName = clip.get("name")?.[0] || "Unnamed";
  const finalLength = clip.get("length")?.[0] || clipLength;

  // Return detailed result
  return {
    success: true,
    trackIndex,
    clipSlotIndex,
    clipName: finalName,
    type: "midi",
    length: finalLength,
    noteCount: notes.length,
    message: resultMessage,
  };
}

module.exports = { writeClip };
