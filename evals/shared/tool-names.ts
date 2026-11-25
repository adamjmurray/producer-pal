// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Full names of the standard Producer Pal tools, for scenarios to assert on.
 * One list so a renamed tool is a one-line change, and a test checks it against
 * the tool registry (`TOOL_NAMES`) so a typo can't pass for a real tool.
 */
export const TOOLS = {
  connect: "ppal-connect",
  context: "ppal-context",
  manage: "ppal-manage",
  readLiveSet: "ppal-read-live-set",
  updateLiveSet: "ppal-update-live-set",
  readTrack: "ppal-read-track",
  createTrack: "ppal-create-track",
  updateTrack: "ppal-update-track",
  readScene: "ppal-read-scene",
  createScene: "ppal-create-scene",
  updateScene: "ppal-update-scene",
  readClip: "ppal-read-clip",
  createClip: "ppal-create-clip",
  updateClip: "ppal-update-clip",
  readDevice: "ppal-read-device",
  createDevice: "ppal-create-device",
  updateDevice: "ppal-update-device",
  delete: "ppal-delete",
  duplicate: "ppal-duplicate",
  select: "ppal-select",
  playback: "ppal-playback",
  library: "ppal-library",
} as const;
