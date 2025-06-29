// desktop-extension/tool-descriptions.js

// User-facing descriptions for tools in the desktop extension manifest
// These are crisp, concise descriptions for end users, unlike the detailed
// LLM-facing descriptions in the MCP tool definitions
export const toolDescriptions = {
  "transport": "Controls Arrangement and Session transport, playback, position, and loop settings",
  "create-clip": "Creates MIDI clips in Session or Arrangement view",
  "read-clip": "Reads information about clips including notes and properties",
  "update-clip": "Updates clip properties, notes, and settings",
  "create-track": "Creates new tracks in the Live Set",
  "read-track": "Reads information about tracks including clips and settings",
  "update-track": "Updates track properties like name, color, and settings",
  "capture-scene": "Captures existing clips from tracks into a new or existing scene",
  "create-scene": "Creates new scenes in Session view",
  "read-scene": "Reads information about scenes and their clips",
  "update-scene": "Updates scene properties like name and color",
  "read-song": "Reads comprehensive information about the Live Set including global settings and all tracks",
  "update-song": "Updates global song settings like tempo, time signature, and scales",
  "duplicate": "Duplicates objects between Session and Arrangement views",
  "delete": "Deletes various objects (tracks, clips, scenes)",
};