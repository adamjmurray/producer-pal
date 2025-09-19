import { VERSION } from "../../shared/version.js";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "../constants.js";
import { getHostTrackIndex } from "../shared/get-host-track-index.js";
import { fromLiveApiView } from "../shared/utils.js";
/**
 * Initialize connection to Ableton Live with minimal data for safety
 * @param {Object} _ - No parameters used
 * @param {Object} context - The userContext from main.js
 * @returns {Object} Connection status and basic Live Set info
 */
export function init({} = {}, context) {
  const liveSet = new LiveAPI("live_set");
  const liveApp = new LiveAPI("live_app");
  const appView = new LiveAPI("live_app view");

  // Get basic info - minimal data for safety
  const trackIds = liveSet.getChildIds("tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  const abletonLiveVersion = liveApp.call("get_version_string");

  // Basic Live info
  const result = {
    connected: true,
    producerPalVersion: VERSION,
    abletonLiveVersion,
    songName: liveSet.getProperty("name") || "Untitled",
    view: fromLiveApiView(appView.getProperty("focused_document_view")),
    tempo: liveSet.getProperty("tempo"),
    timeSignature: liveSet.timeSignature,
    isPlaying: liveSet.getProperty("is_playing") > 0,

    // Just counts, no detailed data
    trackCount: trackIds.length,
    sceneCount: sceneIds.length,

    messageForUser: {
      title: `Producer Pal ${VERSION} connected to Ableton Live ${abletonLiveVersion}`,
      tips: [
        "Save often! I can modify and delete things in your project, and I make mistakes.",
        "If you rearrange tracks/clips/scenes, tell me so I stay in sync.",
      ],
      warnings: [], // Array for any warnings
      suggestion: null, // Will be set based on Live Set state
    },
    nextStep: `Automatically call ppal-read-song *with no arguments* for the best view of the state of Live.
Tell the user a summary of their Live Set and the messageForUser.
If ppal-read-song fails, don't try again: tell the user the error and messageForUser.
Wait for input before proceeding.`,
  };

  const hostTrackIndex = getHostTrackIndex();

  // First, check if host track has an instrument
  let instrumentOnHostTrack = false;

  const hostTrack = new LiveAPI(`live_set tracks ${hostTrackIndex}`);
  if (hostTrack.getProperty("has_midi_input") > 0) {
    const deviceIds = hostTrack.getChildIds("devices");
    for (const deviceId of deviceIds) {
      const device = new LiveAPI(deviceId);
      const type = device.getProperty("type");
      if (type === LIVE_API_DEVICE_TYPE_INSTRUMENT) {
        // instrument, instrument rack, or drum rack
        instrumentOnHostTrack = true;
        break;
      }
    }
  }

  // Now check for any instruments in the project
  let foundAnyInstrument = instrumentOnHostTrack; // Start with host track result

  if (!foundAnyInstrument) {
    // Only search other tracks if we haven't found an instrument yet
    for (let i = 0; i < trackIds.length; i++) {
      if (i === hostTrackIndex) continue; // Skip host track, already checked

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
  }

  // Set warnings and suggestions based on findings
  if (instrumentOnHostTrack) {
    result.messageForUser.warnings.push(
      "There's an instrument on the Producer Pal track. It's best to keep the Max for Live device on its own track.",
    );
  }

  if (foundAnyInstrument) {
    result.messageForUser.suggestion =
      "Ready to create or edit MIDI (drums, bass, melodies, chords), arrange clips, build scenes, or manage your Live Set.";
  } else {
    result.messageForUser.suggestion = `No instruments found. To create music with MIDI clips, you'll need instruments.
Add any Live instrument (Wavetable, Operator, Meld, Drift, Drum Rack, etc.) or plugin.
I can't add instruments but can compose MIDI patterns once they're there.`;
  }

  // Clean up empty warnings array
  if (result.messageForUser.warnings.length === 0) {
    delete result.messageForUser.warnings;
  }

  // Include project notes if enabled (moved from read-song)
  if (context?.projectNotes?.enabled && context.projectNotes.content) {
    result.userContext = {
      projectNotes: context.projectNotes.content,
    };
  }

  return result;
}
