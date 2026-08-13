// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Builds the skills snapshot corpus: one assembled blob per (toolset profile x
// depth x notation), plus the README that summarizes them.
//
// A snapshot file is the blob and NOTHING else — no header, no timestamp — so a
// reorganization's git diff is pure content movement. The path carries the
// combination.

import { NOTATIONS, type Notation } from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { builtinFragments } from "#src/skills/builtin-fragments.ts";
import {
  fragmentGate,
  gatedOutFragments,
} from "#src/skills/fragment-tool-gates.ts";
import {
  assertKnownTools,
  TOOLSET_PROFILES,
  type ToolsetProfile,
} from "./toolset-profiles.ts";
import { markdownTable } from "./markdown-table.ts";

/** One file in the corpus, at a path relative to the corpus root. */
export interface SnapshotFile {
  path: string;
  content: string;
}

/** The two driver depths, in the order the report lists them. */
const DEPTHS = [
  { name: "standard", smallModelMode: false },
  { name: "basic", smallModelMode: true },
] as const;

/**
 * Build every file in the corpus: the assembled blobs and the README.
 *
 * `code-transforms` is forced OFF regardless of the shell's `ENABLE_CODE_EXEC`,
 * so a debug environment can't rewrite the corpus with content no release build
 * ships. Snapshots are the chat audience; the subagent delta is a column in the
 * report instead of 24 more near-identical files.
 *
 * @returns Every corpus file, path relative to the corpus root
 */
export function buildCorpus(): SnapshotFile[] {
  assertKnownTools();
  process.env.ENABLE_CODE_EXEC = "false";

  const blobs = TOOLSET_PROFILES.flatMap((profile) =>
    DEPTHS.flatMap((depth) =>
      NOTATIONS.map((notation) => ({
        path: `${profile.name}/${depth.name}-${notation}.md`,
        content: assemble(profile, depth.smallModelMode, notation, "chat"),
      })),
    ),
  );

  return [{ path: "README.md", content: buildReadme() }, ...blobs];
}

// --- Helpers below main export ---

/**
 * Assemble one blob.
 *
 * @param profile - The toolset profile
 * @param smallModelMode - Whether to use the basic driver
 * @param notation - The note format
 * @param audience - Who the blob is for
 * @returns The assembled skills string
 */
function assemble(
  profile: ToolsetProfile,
  smallModelMode: boolean,
  notation: Notation,
  audience: "chat" | "subagent",
): string {
  return buildSkills({
    notation,
    smallModelMode,
    tools: profile.tools,
    audience,
  });
}

/**
 * Build the corpus README: what it is, how to regenerate it, and the two tables
 * that answer "how big is each combination" and "which tools keep each fragment".
 *
 * @returns The README markdown
 */
function buildReadme(): string {
  return [
    "# Skills snapshots",
    "",
    "Generated and gitignored. Each file under a profile directory is the exact blob",
    "`ppal-connect` returns for that combination — nothing else, so a diff between two",
    "runs is pure content movement.",
    "",
    "To see what a reorganization did:",
    "",
    "```bash",
    "npm run skills:snapshot -- --out /tmp/skills-before   # before your edits",
    "npm run skills:snapshot -- --diff /tmp/skills-before  # after",
    "```",
    "",
    "Assembled with `code-transforms` off (release behavior) and the `chat` audience.",
    "Rough token cost is chars / 4.",
    "",
    "## Toolset profiles",
    "",
    ...TOOLSET_PROFILES.map((p) => `- **${p.name}** — ${p.description}`),
    "",
    "## Combination sizes",
    "",
    "`subagent` drops the conversation-only fragments; every other axis is identical.",
    "",
    comboTable(),
    "",
    "## Fragments",
    "",
    "A fragment is dropped when NONE of its tools is enabled. That's the only",
    "direction the gate runs: notation heads and the `-basic` variants also depend on",
    "the notation and the depth, so ✓ means the gate keeps it, not that every",
    "combination includes it.",
    "",
    fragmentTable(),
    "",
  ].join("\n");
}

/**
 * The combination-size table: one row per (profile x depth x notation), with the
 * chat and subagent character counts.
 *
 * @returns A markdown table
 */
function comboTable(): string {
  const rows = TOOLSET_PROFILES.flatMap((profile) =>
    DEPTHS.flatMap((depth) =>
      NOTATIONS.map((notation) => [
        profile.name,
        depth.name,
        notation,
        String(
          assemble(profile, depth.smallModelMode, notation, "chat").length,
        ),
        String(
          assemble(profile, depth.smallModelMode, notation, "subagent").length,
        ),
      ]),
    ),
  );

  return markdownTable(
    ["Profile", "Depth", "Notation", "chat", "subagent"],
    rows,
    ["left", "left", "left", "right", "right"],
  );
}

/**
 * The fragment table: size, which profiles' gates keep it, and the gate itself.
 *
 * @returns A markdown table
 */
function fragmentTable(): string {
  const fragments = builtinFragments(false);
  const droppedByProfile = TOOLSET_PROFILES.map((profile) =>
    gatedOutFragments(profile.tools),
  );

  const rows = Object.entries(fragments).map(([name, body]) => [
    name,
    String(body.length),
    ...droppedByProfile.map((dropped) => (dropped.has(name) ? "–" : "✓")),
    describeGate(name),
  ]);

  return markdownTable(
    [
      "Fragment",
      "Chars",
      ...TOOLSET_PROFILES.map((profile) => profile.name),
      "Ships when",
    ],
    rows,
    ["left", "right", ...TOOLSET_PROFILES.map(() => "center" as const), "left"],
  );
}

/**
 * Render a fragment's gate for the report.
 *
 * @param name - Fragment name
 * @returns The gate as display text
 */
function describeGate(name: string): string {
  const gate = fragmentGate(name);

  if (gate == null) return "_driver root_";
  if (gate === "always") return "always";
  if (gate === "conversation-only") return "chat audience only";

  return gate.join(", ");
}
