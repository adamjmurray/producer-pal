// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

export interface Tool {
  id: string;
  name: string;
  requiresEnvVar?: boolean;
}

export const TOOLS: Tool[] = [
  // Row 1
  { id: "ppal-session", name: "Session Management" },
  { id: "ppal-read-live-set", name: "Read Live Set" },
  { id: "ppal-update-live-set", name: "Update Live Set" },
  // Row 3
  { id: "ppal-create-track", name: "Create Track" },
  { id: "ppal-read-track", name: "Read Track" },
  { id: "ppal-update-track", name: "Update Track" },
  // Row 4
  { id: "ppal-create-scene", name: "Create Scene" },
  { id: "ppal-read-scene", name: "Read Scene" },
  { id: "ppal-update-scene", name: "Update Scene" },
  // Row 5
  { id: "ppal-create-clip", name: "Create Clip" },
  { id: "ppal-read-clip", name: "Read Clip" },
  { id: "ppal-update-clip", name: "Update Clip" },
  // Row 6
  { id: "ppal-create-device", name: "Create Device" },
  { id: "ppal-read-device", name: "Read Device" },
  { id: "ppal-update-device", name: "Update Device" },
  // Row 7
  { id: "ppal-playback", name: "Control Playback" },
  { id: "ppal-select", name: "Select/View Control" },
  // Row 8
  { id: "ppal-delete", name: "Delete Objects" },
  { id: "ppal-duplicate", name: "Duplicate Objects" },
  // Row 9 (conditional)
  {
    id: "ppal-raw-live-api",
    name: "Raw Live API",
    requiresEnvVar: true,
  },
];

export const DEFAULT_ENABLED_TOOLS: Record<string, boolean> = TOOLS.reduce<
  Record<string, boolean>
>((acc, tool) => {
  acc[tool.id] = true;

  return acc;
}, {});
