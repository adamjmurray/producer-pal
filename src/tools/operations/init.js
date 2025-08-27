// src/tools/init.js
import { VERSION } from "../../version.js";
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

  // Basic Live info
  const result = {
    connected: true,
    producerPalVersion: VERSION,
    abletonLiveVersion: liveApp.call("get_version_string"),
    songName: liveSet.getProperty("name") || "Untitled",
    view: fromLiveApiView(appView.getProperty("focused_document_view")),
    tempo: liveSet.getProperty("tempo"),
    timeSignature: liveSet.timeSignature,
    isPlaying: liveSet.getProperty("is_playing") > 0,

    // Just counts, no detailed data
    trackCount: trackIds.length,
    sceneCount: sceneIds.length,

    // Welcome message as data, not in tool description
    welcome: {
      title: `Producer Pal ${VERSION} connected to Ableton Live`,
      tips: [
        "**Save often!** I can modify and delete things in your project, and I make mistakes.",
        "If you rearrange tracks/clips/scenes, tell me so I stay in sync.",
      ],
      suggestion: null, // Will be set based on Live Set state
      warnings: [], // Array for any warnings
    },
    nextStep: `The assistant should automatically call ppal-read-song with no arguments
(the defaults) to avoid timing out with complex songs running on older, slower computers.
If read-song with no arguments fails, don't try again, just tell the user what happened.`,
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
    result.welcome.warnings.push(
      "There's an instrument on the Producer Pal track. It's better to keep the Max for Live device on its own track in case you want to duplicate the instrument track later.",
    );
  }

  if (foundAnyInstrument) {
    result.welcome.suggestion =
      "Try asking me to create a drum beat, bassline, melody, or chord progression.";
  } else {
    result.welcome.suggestion = `There are no instruments in your project. Instruments are needed to produce sound. 
Live's extensive built-in collection includes Wavetable, Operator, Analog, Electric, Tension, Collision, Sampler, 
Drum Rack, Drum Sampler, and especially the newer Drift and Meld instruments.
Note: I cannot add instruments directly - I can only suggest which Live instruments or plugins might work well for your intended sound.`;
  }

  // Clean up empty warnings array
  if (result.welcome.warnings.length === 0) {
    delete result.welcome.warnings;
  }

  // Include project notes if enabled (moved from read-song)
  if (context?.projectNotes?.enabled && context.projectNotes.content) {
    result.userContext = {
      projectNotes: context.projectNotes.content,
    };
  }

  return result;
}
