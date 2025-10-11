import { PITCH_CLASS_NAMES } from "../../notation/midi-pitch-to-name.js";
import { VERSION } from "../../shared/version.js";
import { buildInstructions, skills } from "../../skills/standard.js";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "../constants.js";

/**
 * Initialize connection to Ableton Live with minimal data for safety
 * @param {Object} _ - No parameters used
 * @param {Object} context - The userContext from main.js
 * @returns {Object} Connection status and basic Live Set info
 */
export function connect({} = {}, context) {
  const liveSet = new LiveAPI("live_set");
  const liveApp = new LiveAPI("live_app");

  // Get basic info - minimal data for safety
  const trackIds = liveSet.getChildIds("tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  const abletonLiveVersion = liveApp.call("get_version_string");

  // Basic Live info
  const liveSetName = liveSet.getProperty("name");
  const result = {
    connected: true,
    producerPalVersion: VERSION,
    abletonLiveVersion,
    liveSet: {
      ...(liveSetName && { name: liveSetName }),
      trackCount: trackIds.length,
      sceneCount: sceneIds.length,
      tempo: liveSet.getProperty("tempo"),
      timeSignature: liveSet.timeSignature,
    },
  };

  const scaleEnabled = liveSet.getProperty("scale_mode") > 0;
  if (scaleEnabled) {
    const scaleName = liveSet.getProperty("scale_name");
    const rootNote = liveSet.getProperty("root_note");
    const scaleRoot = PITCH_CLASS_NAMES[rootNote];
    result.liveSet.scale = `${scaleRoot} ${scaleName}`;
  }

  const messages = [
    `Producer Pal ${VERSION} connected to Ableton Live ${abletonLiveVersion}`,
    "Tell me if you rearrange things so I stay in sync.",
    "Save often! I make mistakes.",
    // additional tips set based on the state of the Live Set
  ];

  let foundAnyInstrument = false;
  for (const trackId of trackIds) {
    const track = LiveAPI.from(trackId);
    if (track.getProperty("has_midi_input") > 0) {
      for (const device of track.getChildren("devices")) {
        const deviceType = device.getProperty("type");
        if (deviceType === LIVE_API_DEVICE_TYPE_INSTRUMENT) {
          // it's an instrument, instrument rack, or drum rack
          foundAnyInstrument = true;
          break;
        }
      }
      if (foundAnyInstrument) break;
    }
  }
  if (!foundAnyInstrument) {
    messages.push(`No instruments found.
To create music with MIDI clips, you need instruments (Wavetable, Operator, Drum Rack, plugins, etc).
I can't add instruments but can compose MIDI patterns once they're there.`);
  }

  // Format as markdown bullet list
  result.messagesForUser = messages.map((msg) => `* ${msg}`).join("\n");

  // Include project notes if enabled
  if (context?.projectNotes?.enabled && context.projectNotes.content) {
    result.projectNotes = context.projectNotes.content;
  }

  result.$skills = skills;
  result.$instructions = buildInstructions(context);

  return result;
}
