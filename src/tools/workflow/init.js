import { PITCH_CLASS_NAMES } from "../../notation/midi-pitch-to-name.js";
import { VERSION } from "../../shared/version.js";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "../constants.js";

/**
 * Initialize connection to Ableton Live with minimal data for safety
 * @param {Object} _ - No parameters used
 * @param {Object} context - The userContext from main.js
 * @returns {Object} Connection status and basic Live Set info
 */
export function init({} = {}, context) {
  const liveSet = new LiveAPI("live_set");
  const liveApp = new LiveAPI("live_app");

  // Get basic info - minimal data for safety
  const trackIds = liveSet.getChildIds("tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  const abletonLiveVersion = liveApp.call("get_version_string");

  // Basic Live info
  const result = {
    connected: true,
    producerPalVersion: VERSION,
    abletonLiveVersion,
    songName: liveSet.getProperty("name"),

    // Just counts, no detailed data
    trackCount: trackIds.length,
    sceneCount: sceneIds.length,

    tempo: liveSet.getProperty("tempo"),
    timeSignature: liveSet.timeSignature,
  };

  const scaleEnabled = liveSet.getProperty("scale_mode") > 0;
  if (scaleEnabled) {
    const scaleName = liveSet.getProperty("scale_name");
    const rootNote = liveSet.getProperty("root_note");
    const scaleRoot = PITCH_CLASS_NAMES[rootNote];
    result.scale = `${scaleRoot} ${scaleName}`;
  }

  result.messagesForUser = [
    `Producer Pal ${VERSION} connected to Ableton Live ${abletonLiveVersion}`,
    "Save often! I can modify and delete things in your project, and I make mistakes.",
    "If you rearrange tracks or scenes or clips, tell me so I stay in sync.",
    // additional tips set based on the state of the Live Set
  ];

  // Set additional tips based on findings

  // TODO: relay this info in $meta response data when delete-track or duplicate (track) fails due to this:
  // const hostTrackIndex = getHostTrackIndex();
  // // First, check if host track has an instrument
  // let instrumentOnHostTrack = false;
  // const hostTrack = new LiveAPI(`live_set tracks ${hostTrackIndex}`);
  // if (hostTrack.getProperty("has_midi_input") > 0) {
  //   const deviceIds = hostTrack.getChildIds("devices");
  //   for (const deviceId of deviceIds) {
  //     const device = new LiveAPI(deviceId);
  //     const type = device.getProperty("type");
  //     if (type === LIVE_API_DEVICE_TYPE_INSTRUMENT) {
  //       // instrument, instrument rack, or drum rack
  //       instrumentOnHostTrack = true;
  //       break;
  //     }
  //   }
  // }
  // if (instrumentOnHostTrack) {
  //   result.messagesForUser.push(
  //     "The Producer Pal device should be on its own track, but it's on a track with an instrument.",
  //   );
  // }

  // Now check for any instruments in the project
  // let foundAnyInstrument = instrumentOnHostTrack; // Start with host track result
  let foundAnyInstrument = false;
  // if (!foundAnyInstrument) {
  // Only search other tracks if we haven't found an instrument yet
  for (let i = 0; i < trackIds.length; i++) {
    // if (i === hostTrackIndex) continue; // Skip host track, already checked

    const track = new LiveAPI(`live_set tracks ${i}`);
    if (track.getProperty("has_midi_input") > 0) {
      const deviceIds = track.getChildIds("devices");

      for (const deviceId of deviceIds) {
        const device = new LiveAPI(deviceId);
        const type = device.getProperty("type");
        if (type === LIVE_API_DEVICE_TYPE_INSTRUMENT) {
          // instrument, instrument rack, or drum rack
          foundAnyInstrument = true;
          break; // Exit device loop
        }
      }

      if (foundAnyInstrument) break; // Exit track loop
    }
  }
  //}

  if (!foundAnyInstrument) {
    result.messagesForUser.push(`No instruments found.
To create music with MIDI clips, you need instruments (Wavetable, Operator, Drum Rack, plugins, etc).
I can't add instruments but can compose MIDI patterns once they're there.`);
  } else {
    result.messagesForUser.push(
      "Ready to create or edit MIDI clips, build scenes, arrange a song, and manage your Live Set.",
    );
  }

  // Include project notes if enabled (moved from read-song)
  if (context?.projectNotes?.enabled && context.projectNotes.content) {
    result.projectNotes = context.projectNotes.content;
    // TODO: mention it to the user if the notes are writable?
  }

  result.$instructions =
    "To initialize Producer Pal:\n" +
    [
      "* Call ppal-read-song _with no arguments_ for the best overview of the Live Set",
      "* Summarize the Live Set state (if ppal-read-song fails, say the error and don't try again)",
      ...(result.projectNotes
        ? [
            "* Summarize the project notes, and verify you will follow any instructions in project notes if applicable.",
          ]
        : []),
      "* Say the messagesForUser and wait for input",
    ].join("\n");

  return result;
}
