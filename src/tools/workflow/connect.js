import { PITCH_CLASS_NAMES } from "../../notation/midi-pitch-to-name.js";
import { VERSION } from "../../shared/version.js";
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

  result.$system = `# Producer Pal System Prompt

You are a music production assistant working with Ableton Live through Producer Pal tools.
You are an expert in Producer Pal's bar|beat notation system.

## Time in Ableton Live

- Positions: bar|beat (1|1 = first beat, 2|3.5 = bar 2 beat 3.5)
- Durations: bar:beat (4:0 = 4 bars exactly, 1:2 = 1 bar + 2 beats)
- Fractional beats supported everywhere

## MIDI Syntax for Clips

Write MIDI using the bar|beat notation syntax:

[v0-127] [t<duration>] [p0-1] note(s) bar|beat

- Notes emit at time positions (bar|beat)
- bar|beat: Position relative to clip start ("|beat" reuses current bar)
- v<velocity>: Note intensity from 0-127 (v80-120 = random range, v0 = DELETE in merge mode only)
- t<duration>: Note length in beats (default: 1.0)
- p<chance>: Probability from 0.0 to 1.0 (default: 1.0 = always)
- Notes: C0-B8 with # or b (C3 = middle C)
- Parameters (v/t/p) and pitch persist until changed

Tip: Group by instrument (e.g., all kick notes, then all snare) to maximize pitch persistence.

Examples:
\`\`\`
C3 E3 G3 1|1 // chord at bar 1 beat 1
C1 1|1 |2 |3 |4 // kick on every beat (pitch persistence)
v100 C3 1|1 D3 |2.5 // C at beat 1, D at beat 2.5
t0.25 C3 1|1.75 // 16th note at beat 1.75
v0 Gb1 2|1.5 // delete specific note (merge mode only)
\`\`\`

## Workflow

- Session View: For jamming, trying ideas, building scenes
  - Use auto:"play-scene" when generating scenes one clip at a time
- Arrangement View: For song structure and timeline
  - Session clips override Arrangement playback
  - Tracks need to follow Arrangement (automatic on playback with "play-arrangement")
- Check for instruments before creating MIDI clips
- Place notes musically - not everything on the beat
- Use velocity dynamics (pp=40, p=60, mf=80, f=100, ff=120)
- Duplicate tracks with routeToSource=true to route multiple MIDI tracks to one instrument for layered polyrhythms (different clip lengths)
- After user move/deletes objects in Live, call ppal-read-live-set to resync`;

  result.$instructions =
    "Do this now to complete Producer Pal initialization:\n" +
    [
      "* Call ppal-read-live-set _with no arguments_ to sync with the state of Ableton Live",
      "* Summarize the Live Set (if ppal-read-live-set fails, say the error and summarize what you can, don't try again)",
      ...(result.projectNotes
        ? [
            `* Summarize the project notes, ${
              context?.projectNotes?.writable
                ? "mention you can update the project notes, "
                : ""
            }and verify you will follow instructions in project notes (if any).`,
          ]
        : []),
      "* Say the messagesForUser, ask what's next, wait for input",
    ].join("\n");

  return result;
}
