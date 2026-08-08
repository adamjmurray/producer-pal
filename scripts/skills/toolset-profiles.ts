// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The named toolsets the skills snapshot corpus is generated for. Each one is a
// USE CASE the fragment carve is supposed to serve, not a sample of the 2^21
// toolsets a user could actually assemble — the point is to see what a read-only
// worker or a clip author receives, and to notice when a reorganization changes
// it.
//
// Tool lists are written out rather than derived from a prefix, so a profile
// states a decision instead of drifting the day a tool is added. `assertKnownTools`
// catches the other side of that: a renamed tool would otherwise silently widen a
// profile's snapshot.
//
// `read-only` is the exception: it takes the shared table's list so the snapshot
// reports what a `--tools read-only` client actually receives. That name is now
// user-facing vocabulary, so two definitions of it would be a trap.

import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { READ_ONLY_TOOLS } from "#src/shared/tool-groups.ts";

/** A named toolset the corpus is generated for. */
export interface ToolsetProfile {
  /** Directory name in the corpus and column head in the report. */
  name: string;
  /** The caller this stands in for, one line. */
  description: string;
  /** The tools that caller can call. */
  tools: readonly string[];
}

const CONNECT = "ppal-connect";
const READ_CLIP = "ppal-read-clip";
const READ_TRACK = "ppal-read-track";

export const TOOLSET_PROFILES: readonly ToolsetProfile[] = [
  {
    name: "all",
    description: "Every tool — the ungated baseline the chat gets by default.",
    tools: TOOL_NAMES,
  },
  {
    name: "read-only",
    description:
      "A caller that can look but not touch: the narrow subagent worker gating exists to serve, and what --tools read-only gives an external client.",
    tools: READ_ONLY_TOOLS,
  },
  {
    name: "clip-write",
    description: "A clip author: reads a clip's context, writes notes back.",
    tools: [
      CONNECT,
      READ_TRACK,
      READ_CLIP,
      "ppal-create-clip",
      "ppal-update-clip",
    ],
  },
  {
    name: "device-work",
    description:
      "A sound designer: builds and tweaks devices, writes no notes.",
    tools: [
      CONNECT,
      READ_TRACK,
      "ppal-read-device",
      "ppal-create-device",
      "ppal-update-device",
    ],
  },
];

/**
 * Fail loudly when a profile names a tool the server doesn't register. A rename
 * would otherwise drop that tool from the profile silently, widening every
 * snapshot it gates — the exact drift the explicit lists exist to prevent.
 *
 * @throws When any profile names an unknown tool
 */
export function assertKnownTools(): void {
  const known = new Set(TOOL_NAMES);
  const unknown = TOOLSET_PROFILES.flatMap((profile) =>
    profile.tools
      .filter((tool) => !known.has(tool))
      .map((tool) => `${profile.name}: ${tool}`),
  );

  if (unknown.length > 0) {
    throw new Error(
      `toolset profiles name tools the server doesn't register:\n  ${unknown.join("\n  ")}`,
    );
  }
}
