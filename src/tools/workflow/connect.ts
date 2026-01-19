import { PITCH_CLASS_NAMES } from "#src/shared/pitch.js";
import { VERSION } from "#src/shared/version.js";
import {
  skills as basicSkills,
  buildInstructions as buildBasicInstruction,
} from "#src/skills/basic.js";
import { buildInstructions, skills } from "#src/skills/standard.js";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.js";

interface LiveSetInfo {
  name?: unknown;
  trackCount: number;
  sceneCount: number;
  tempo: unknown;
  timeSignature: string | null;
  scale?: string;
}

interface ConnectResult {
  connected: boolean;
  producerPalVersion: string;
  abletonLiveVersion: string;
  liveSet: LiveSetInfo;
  $skills?: string;
  $instructions?: string;
  messagesForUser?: string;
  projectNotes?: string;
}

/**
 * Initialize connection to Ableton Live with minimal data for safety
 * @param _params - No parameters used
 * @param context - The userContext from main.js
 * @returns Connection status and basic Live Set info
 */
export function connect(
  _params: object = {},
  context: Partial<ToolContext> = {},
): ConnectResult {
  const liveSet = LiveAPI.from("live_set");
  const liveApp = LiveAPI.from("live_app");

  // Get basic info - minimal data for safety
  const trackIds = liveSet.getChildIds("tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  const abletonLiveVersion = liveApp.call("get_version_string") as string;

  // Basic Live info
  const liveSetName = liveSet.getProperty("name");

  const liveSetInfo: LiveSetInfo = {
    ...(liveSetName ? { name: liveSetName } : {}),
    trackCount: trackIds.length,
    sceneCount: sceneIds.length,
    tempo: liveSet.getProperty("tempo"),
    timeSignature: liveSet.timeSignature,
  };

  const result: ConnectResult = {
    connected: true,
    producerPalVersion: VERSION,
    abletonLiveVersion,
    liveSet: liveSetInfo,
  };

  const scaleMode = liveSet.getProperty("scale_mode") as number;
  const scaleEnabled = scaleMode > 0;

  if (scaleEnabled) {
    const scaleName = liveSet.getProperty("scale_name") as string;
    const rootNote = liveSet.getProperty("root_note") as number;
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

    if ((track.getProperty("has_midi_input") as number) > 0) {
      for (const device of track.getChildren("devices")) {
        const deviceType = device.getProperty("type");

        if (deviceType === LIVE_API_DEVICE_TYPE_INSTRUMENT) {
          // it's an instrument, instrument rack, or drum rack
          foundAnyInstrument = true;
          break;
        }
      }

      if (foundAnyInstrument) {
        break;
      }
    }
  }

  if (!foundAnyInstrument) {
    messages.push(`No instruments found.
To create music with MIDI clips, you need instruments (Wavetable, Operator, Drum Rack, etc).
Ask me to add an instrument, or add one yourself and I can compose MIDI patterns.`);
  }

  if (context.smallModelMode) {
    result.$skills = basicSkills;
    result.$instructions = buildBasicInstruction(context);
  } else {
    result.$skills = skills;
    result.$instructions = buildInstructions(context);
  }

  // Format as markdown bullet list
  result.messagesForUser = messages.map((msg) => `* ${msg}`).join("\n");

  // Include project notes if enabled
  if (context.projectNotes?.enabled && context.projectNotes.content) {
    result.projectNotes = context.projectNotes.content;
  }

  return result;
}
