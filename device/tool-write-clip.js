// device/tool-write-clip.js
const { parseToneLang } = require("./tone-lang");
const { readClip } = require("./tool-read-clip");
const { sleep, DEFAULT_SLEEP_TIME_AFTER_WRITE } = require("./sleep");

// Maximum number of scenes we'll auto-create
const MAX_AUTO_CREATED_SCENES = 100;
const MAX_CLIP_BEATS = 1_000_000;

/**
 * Creates or updates a MIDI clip in Session or Arrangement view
 * @param {Object} args - The clip parameters
 * @param {string} args.location - Location of the clip ('session' or 'arrangement')
 * @param {number} [args.trackIndex] - Track index (0-based), required when not providing clipId
 * @param {number} [args.clipSlotIndex] - Clip slot index (0-based), required for session view when not providing clipId
 * @param {string} [args.clipId] - Clip ID to directly update an existing clip
 * @param {number} [args.arrangementStartTime] - Start time in beats for arrangement view clips
 * @param {string} [args.notes] - ToneLang musical notation string
 * @param {string} [args.name] - Optional clip name
 * @param {string} [args.color] - Optional clip color (CSS format: hex, rgb(), or named color)
 * @param {number} [args.start_marker] - Start marker position in beats
 * @param {number} [args.end_marker] - End marker position in beats
 * @param {number} [args.loop_start] - Loop start position in beats
 * @param {number} [args.loop_end] - Loop end position in beats
 * @param {boolean} [args.loop] - Enable looping for the clip
 * @param {boolean} [args.trigger=false] - Automatically play the clip after creating it (session only)
 * @returns {Object} Result object with clip information
 */
async function writeClip({
  location,
  trackIndex = null,
  clipSlotIndex = null,
  clipId = null,
  arrangementStartTime = null,
  notes: toneLangString = null,
  name = null,
  color = null,
  start_marker = null,
  end_marker = null,
  loop_start = null,
  loop_end = null,
  loop = null,
  trigger = false,
}) {
  // Validate parameters based on location
  if (!location) {
    throw new Error("location parameter is required");
  }

  if (clipId === null) {
    if (trackIndex === null) {
      throw new Error("trackIndex is required when clipId is not provided");
    }

    if (location === "session" && clipSlotIndex === null) {
      throw new Error("clipSlotIndex is required when location is 'session' and clipId is not provided");
    }

    if (location === "arrangement" && arrangementStartTime === null) {
      throw new Error("arrangementStartTime is required when location is 'arrangement' and clipId is not provided");
    }
  }

  const notes = parseToneLang(toneLangString);
  let clip;

  // Handle existing clip via clipId
  if (clipId !== null) {
    // Support "id {id}" (such as returned by childIds()) and id values directly
    // TODO: Need test coverage of this logic
    clip = new LiveAPI(clipId.startsWith("id ") ? clipId : `id ${clipId}`);
    if (!clip.exists()) {
      throw new Error(`No clip exists for clipId "${clipId}"`);
    }
  }
  // Handle creating/updating session view clip
  else if (location === "session") {
    const liveSet = new LiveAPI("live_set");
    const currentSceneCount = liveSet.getChildIds("scenes").length;

    if (clipSlotIndex >= MAX_AUTO_CREATED_SCENES) {
      throw new Error(
        `Clip slot index ${clipSlotIndex} exceeds the maximum allowed value of ${MAX_AUTO_CREATED_SCENES - 1}`
      );
    }

    if (clipSlotIndex >= currentSceneCount) {
      const scenesToCreate = clipSlotIndex - currentSceneCount + 1;
      for (let i = 0; i < scenesToCreate; i++) {
        liveSet.call("create_scene", -1); // -1 means append at the end
      }
    }

    const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);

    const lastNoteEndTime = notes.length > 0 ? Math.max(...notes.map((note) => note.start_time + note.duration)) : 0;
    const clipLength = Math.max(4, Math.ceil(lastNoteEndTime));

    if (!clipSlot.getProperty("has_clip")) {
      clipSlot.call("create_clip", clipLength);
    }

    clip = new LiveAPI(`${clipSlot.path} clip`);
  }
  // Handle creating arrangement view clip
  else if (location === "arrangement") {
    const track = new LiveAPI(`live_set tracks ${trackIndex}`);
    if (!track.exists()) {
      throw new Error(`Track with index ${trackIndex} does not exist`);
    }

    const lastNoteEndTime = notes.length > 0 ? Math.max(...notes.map((note) => note.start_time + note.duration)) : 0;
    // TODO: this should respect `end_marker - (start_marker ?? 0)` if provided to avoid unwanted overwrites in the arrangement timeline
    const clipLength = Math.max(4, Math.ceil(lastNoteEndTime));

    // Create the arrangement clip
    const newClipId = track.call("create_midi_clip", arrangementStartTime, clipLength)[1];
    clip = new LiveAPI(`id ${newClipId}`);
    if (!clip.exists()) {
      throw new Error("Failed to create arrangement clip");
    }
  } else {
    throw new Error(`Invalid location: ${location}`);
  }

  if (name != null) {
    clip.set("name", name);
  }

  if (color != null) {
    clip.setColor(color);
  }

  if (start_marker != null) {
    clip.set("start_marker", start_marker);
  }

  if (end_marker != null) {
    clip.set("end_marker", end_marker);
  }

  if (loop_start != null) {
    clip.set("loop_start", loop_start);
  }

  if (loop_end != null) {
    clip.set("loop_end", loop_end);
  }

  if (loop != null) {
    clip.set("looping", loop);
  }

  if (toneLangString != null) {
    clip.call("remove_notes_extended", 0, 127, 0, MAX_CLIP_BEATS);
    clip.call("add_new_notes", { notes });
  }

  if (trigger && location === "session") {
    const clipSlot = new LiveAPI(`live_set tracks ${trackIndex} clip_slots ${clipSlotIndex}`);
    clipSlot.call("fire");
    // triggered state isn't updated until we wait a moment
    await sleep(DEFAULT_SLEEP_TIME_AFTER_WRITE);
  }

  return readClip({ clipId: clip.id });
}

module.exports = { writeClip, MAX_AUTO_CREATED_SCENES };
