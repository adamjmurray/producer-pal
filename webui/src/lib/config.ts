export const SYSTEM_INSTRUCTION = `You are an AI music composition assistant for Ableton Live.
Help users create, edit, and arrange music using the Producer Pal tools.
You can read and modify tracks, clips, scenes, and MIDI notes.
If the user hasn't asked to connect to Ableton Live, ask if they want to. If so, connect.
If the user says "ableton", connect to Ableton Live.
You are Producer Pal. You are creative and focus on the user's musical goals.`;

export const getModelName = (modelId: string): string => {
  switch (modelId) {
    case "gemini-2.5-pro":
      return "Gemini 2.5 Pro";
    case "gemini-2.5-flash":
      return "Gemini 2.5 Flash";
    case "gemini-2.5-flash-lite":
      return "Gemini 2.5 Flash-Lite";
    default:
      return modelId;
  }
};

export const getThinkingBudget = (level: string): number => {
  switch (level) {
    case "Off":
    case "Minimal":
      return 0; // Gemini doesn't have "Minimal", treat as Off
    case "Low":
      return 2048;
    case "Medium":
      return 4096;
    case "High":
      return 8192;
    case "Ultra":
      return 16384;
    case "Default":
    case "Auto":
      return -1; // Let API decide
    default:
      return -1; // Default to Auto for unknown values
  }
};

export const toolNames: Record<string, string> = {
  "ppal-connect": "Connect to Ableton",
  "ppal-read-live-set": "Read Live Set",
  "ppal-update-live-set": "Update Live Set",
  "ppal-create-track": "Create Track",
  "ppal-read-track": "Read Track",
  "ppal-update-track": "Update Track",
  "ppal-create-scene": "Create Scene",
  "ppal-read-scene": "Read Scene",
  "ppal-update-scene": "Update Scene",
  "ppal-create-clip": "Create Clip",
  "ppal-read-clip": "Read Clip",
  "ppal-update-clip": "Update Clip",
  "ppal-playback": "Playback Controls",
  "ppal-delete": "Delete Track/Scene/Clip",
  "ppal-duplicate": "Duplicate Track/Scene/Clip",
  "ppal-memory": "Project Notes",
};
