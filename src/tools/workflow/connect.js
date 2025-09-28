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
  const result = {
    connected: true,
    producerPalVersion: VERSION,
    abletonLiveVersion,
    liveSet: {
      name: liveSet.getProperty("name"),
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
    messages.push(`No instruments found.
To create music with MIDI clips, you need instruments (Wavetable, Operator, Drum Rack, plugins, etc).
I can't add instruments but can compose MIDI patterns once they're there.`);
  } else {
    messages.push(
      "Ready to create or edit MIDI clips, build scenes, arrange a song, and manage your Live Set.",
    );
  }

  // Format as markdown bullet list
  result.messagesForUser = messages.map((msg) => `* ${msg}`).join("\n");

  // Include project notes if enabled
  if (context?.projectNotes?.enabled && context.projectNotes.content) {
    result.projectNotes = context.projectNotes.content;
  }

  result.$reference = `# Producer Pal Reference

## Time Formats
- bar|beat positions: 1|1 = first beat, 2|3.5 = bar 2 beat 3.5
- bar:beat durations: 4:0 = exactly 4 bars, 1:2 = 1 bar + 2 beats
- fractional beats allowed

## Clip Note Syntax: bar|beat Notation
\`\`\`
[bar|beat] [v0-127] [t<duration>] [p0-1] note(s)
\`\`\`

- bar|beat position
  - clip note timing is relative to clip start, not the arrangement's global timeline
  - use the "|beat" shortcut to reuse the current bar
- v0-127: velocity (v127 = loudest, v80 = medium, v80-120 = random range)
  - v0: DELETE notes using ppal-update-clip with merge mode
- t<duration>: note duration in beats (0.5 = half a beat, default: 1)
- p0-1: probability (p0 = never, p0.5 = 50%, default: 1)
- note: C0-B8 with #/b (C#3, Eb4, C3 = middle C)

All parameters are stateful (persist until changed)

### bar|beat Notation Examples
\`\`\`
1|1 C3 E3 G3          // Chord at bar 1 beat 1
1|1 v100 C3 |2.5 D3   // C at beat 1, D at beat 2.5
1|1.75 t0.25 C3       // 16th note at beat 1.75
v0 2|1.5 Gb1          // Delete note (merge mode only)
\`\`\`

## Session vs Arrangement

### Clip Precedence
- Session clips always take priority over Arrangement clips
- When a Session clip is playing, that track stops following the Arrangement until explicitly told to return

### Track Following States
- Following: Track plays Arrangement clips
- Not Following: Track plays Session clips or nothing
- Actions that break following:
  - Playing any Session clip/scene
  - Capturing clips
  - Stopping Session clips (track stays non-following)

## Track Management
- Keep track names unique to avoid routing ambiguity.
- Always set routing type BEFORE channel. Available channels depend on the selected type.

### MIDI Layering (routeToSource)
When duplicating tracks with \`routeToSource=true\`:
- New track routes to source track's instrument
- Enables polyrhythms (different clip lengths)

## Staying in Sync
Always re-read after moves/deletes:
- \`ppal-read-song\` for overview
- \`ppal-read-track\` for track state
- \`ppal-read-clip\` for precise note positions before v0 deletions

## View Management
Change views when:
- User explicitly asks
- After creating objects they requested
- Context strongly suggests benefit`;

  result.$instructions =
    "To initialize Producer Pal:\n" +
    [
      "* Call ppal-read-song _with no arguments_ for the best overview of the Live Set",
      "* Summarize the Live Set state (if ppal-read-song fails, say the error and don't try again)",
      ...(result.projectNotes
        ? [
            `* Summarize the project notes, ${
              context?.projectNotes?.writable
                ? "mention you can update the project notes, "
                : ""
            }and verify you will follow any instructions in project notes if applicable.`,
          ]
        : []),
      "* Say the messagesForUser and wait for input",
    ].join("\n");

  return result;
}
