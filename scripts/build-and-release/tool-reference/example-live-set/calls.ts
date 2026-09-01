// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One example call per tool, run against the example Live Set to produce the
// output shown in the tool reference. Read tools ask for everything ("*") so
// the example shows the widest shape a caller can get back; a later pass can
// break that down per include option.

import { ID } from "./ids.ts";

export interface ToolExample {
  toolName: string;
  /** Arguments as a caller would send them, before schema validation */
  args: Record<string, unknown>;
  /** One line under the example saying what this call asked for */
  caption?: string;
}

const ALL = ["*"];

export const TOOL_EXAMPLES: ToolExample[] = [
  { toolName: "ppal-connect", args: {} },
  { toolName: "ppal-context", args: { action: "read" } },

  { toolName: "ppal-playback", args: { action: "play-scene", sceneIndex: 0 } },
  { toolName: "ppal-select", args: { path: "t0/s0" } },
  { toolName: "ppal-library", args: { query: "kick", limit: 2 } },

  { toolName: "ppal-delete", args: { id: ID.vocalSessionClip, type: "clip" } },
  {
    toolName: "ppal-duplicate",
    args: { type: "clip", id: ID.drumSessionClip, toPath: "t0/s1" },
  },

  { toolName: "ppal-read-live-set", args: { include: ALL } },
  { toolName: "ppal-update-live-set", args: { tempo: 124, scale: "F Minor" } },

  { toolName: "ppal-create-track", args: { trackIndex: 3, name: "Keys" } },
  { toolName: "ppal-read-track", args: { path: "t0", include: ALL } },
  {
    toolName: "ppal-update-track",
    args: { id: ID.vocalTrack, mute: false, gainDb: -3 },
  },

  { toolName: "ppal-create-scene", args: { sceneIndex: 2, name: "Chorus" } },
  { toolName: "ppal-read-scene", args: { path: "s1", include: ALL } },
  {
    toolName: "ppal-update-scene",
    args: { id: ID.verseScene, name: "Verse A", tempo: 96 },
  },

  {
    toolName: "ppal-create-clip",
    args: {
      path: "t1/s0",
      name: "Bass Fill",
      notes: "v100 n/8 F1 1|1 C2 1|2",
    },
  },
  {
    toolName: "ppal-read-clip",
    args: { id: ID.bassSessionClip, include: ALL },
  },
  {
    toolName: "ppal-update-clip",
    args: {
      id: ID.bassSessionClip,
      name: "Bass Line A",
      transforms: "pitch += 12",
    },
  },

  {
    toolName: "ppal-create-device",
    args: { deviceName: "Saturator", path: "t1" },
  },
  {
    toolName: "ppal-read-device",
    args: { id: ID.drumRack, include: ALL },
  },
  {
    toolName: "ppal-update-device",
    args: {
      id: ID.bassInstrument,
      params: [{ name: "Filter Freq", value: "0.6" }],
    },
  },

  {
    toolName: "ppal-live-api",
    args: {
      path: "live_set",
      operations: [
        { type: "getProperty", property: "tempo" },
        { type: "getChildIds", property: "tracks" },
      ],
    },
  },
];
