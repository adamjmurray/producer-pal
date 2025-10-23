export const getModelName = (modelId) => {
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

export const getThinkingBudget = (level) => {
  switch (level) {
    case "Off":
      return 0;
    case "Low":
      return 2048;
    case "Medium":
      return 4096;
    case "High":
      return 8192;
    case "Ultra":
      return 16384;
    case "Auto":
      return -1;
    default:
      return 0;
  }
};

export const toolNames = {
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
