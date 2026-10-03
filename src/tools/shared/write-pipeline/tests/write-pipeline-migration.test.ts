// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISPATCH_TOOL_NAMES,
  callTool,
} from "#src/live-api-adapter/live-api-adapter.ts";
import {
  findSourceFiles,
  projectRoot,
} from "#src/test/helpers/meta-test-helpers.ts";
import { ADAPTERS } from "#src/tools/shared/tests/write-conformance/write-conformance-adapters.ts";
import {
  startPipelineProbe,
  stopPipelineProbe,
} from "#src/tools/shared/write-pipeline/pipeline-probe.ts";

// Every write tool runs through the shared pipeline, which is how
// the rules it enforces reach all of them. This holds the migration to its list.

/** The tools that write to the Live Set. Every other tool has to be read-only. */
const WRITE_TOOLS = [
  "ppal-update-device",
  "ppal-update-clip",
  "ppal-duplicate",
  "ppal-create-device",
  "ppal-create-clip",
  "ppal-delete",
  "ppal-create-track",
  "ppal-create-scene",
  "ppal-update-track",
  "ppal-update-scene",
  "ppal-update-live-set",
  "ppal-playback",
  "ppal-select",
];

/** The write tools that were off the pipeline when the migration started. */
const ORIGINALLY_NOT_MIGRATED: ReadonlySet<string> = new Set([
  "ppal-update-clip",
  "ppal-duplicate",
  "ppal-create-device",
  "ppal-create-clip",
  "ppal-delete",
  "ppal-create-track",
  "ppal-create-scene",
  "ppal-update-track",
  "ppal-update-scene",
  "ppal-update-live-set",
  "ppal-playback",
  "ppal-select",
]);

/**
 * Write tools not yet on the pipeline. A ratchet: a tool leaves this list in
 * the commit that moves it over, and none is ever added back (a test below
 * holds it to ORIGINALLY_NOT_MIGRATED). Emptied, and deleted with the last of
 * them.
 */
const NOT_MIGRATED = [
  "ppal-duplicate",
  "ppal-create-clip",
  "ppal-create-track",
  "ppal-create-scene",
  "ppal-update-track",
  "ppal-update-scene",
  "ppal-update-live-set",
  "ppal-playback",
  "ppal-select",
];

/** Tools that don't write to the Live Set, with why where it isn't obvious. */
const READ_ONLY: Record<string, string | null> = {
  "ppal-connect": null,
  "ppal-read-live-set": null,
  "ppal-read-track": null,
  "ppal-read-scene": null,
  "ppal-read-clip": null,
  "ppal-read-device": null,
  "ppal-library": null,
  "ppal-context": "writes the project context, never the Live Set",
  "ppal-live-api":
    "a raw Live API escape hatch the model opts into; not a target-list write",
};

/** Tools whose empty call is not a write at all, so they need a call that is. */
const CALL_THAT_WRITES: Record<string, object> = {
  // With no device it lists the catalog.
  "ppal-create-device": { device: "Reverb" },
};

const WRITE_PIPELINE = "src/tools/shared/write-pipeline";

describe("write pipeline migration", () => {
  it("names every tool as a write tool or a read-only one", () => {
    const named = [...WRITE_TOOLS, ...Object.keys(READ_ONLY)].toSorted();

    expect(named).toStrictEqual([...DISPATCH_TOOL_NAMES].toSorted());
  });

  it("only lists as not migrated tools that write", () => {
    expect(
      NOT_MIGRATED.filter((tool) => !WRITE_TOOLS.includes(tool)),
    ).toStrictEqual([]);
    expect(new Set(NOT_MIGRATED).size).toBe(NOT_MIGRATED.length);
  });

  it("only ever removes tools from the not-migrated list", () => {
    expect(
      NOT_MIGRATED.filter((tool) => !ORIGINALLY_NOT_MIGRATED.has(tool)),
    ).toStrictEqual([]);
  });

  it("runs every migrated write tool through the pipeline, and no other", async () => {
    startPipelineProbe();

    for (const tool of [...WRITE_TOOLS, ...Object.keys(READ_ONLY)]) {
      await callWithNothing(tool);
    }

    const ran = new Set(stopPipelineProbe());
    const expected = WRITE_TOOLS.filter((tool) => !NOT_MIGRATED.includes(tool));

    // A tool that already runs through it must leave NOT_MIGRATED.
    expect(WRITE_TOOLS.filter((tool) => ran.has(tool))).toStrictEqual(expected);
    expect(
      [...ran].filter((tool) => !WRITE_TOOLS.includes(tool)),
    ).toStrictEqual([]);
  });

  it("keeps the pipeline's helpers private to it", () => {
    const private_ = `${WRITE_PIPELINE}/helpers/`;
    const violations: string[] = [];

    for (const file of findSourceFiles(path.join(projectRoot, "src"))) {
      const rel = path.relative(projectRoot, file);

      if (rel.startsWith(`${WRITE_PIPELINE}/`)) {
        continue;
      }

      for (const specifier of importsOf(file)) {
        const target = resolveSpecifier(specifier, rel);

        if (target?.startsWith(private_) === true) {
          violations.push(`${rel} imports ${specifier}`);
        }
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("runs the conformance suite against every write tool", () => {
    expect(ADAPTERS.map(({ tool }) => tool).toSorted()).toStrictEqual(
      [...WRITE_TOOLS].toSorted(),
    );
  });
});

/**
 * Call a tool the way the dispatcher does, with no args unless it needs some
 * to write. Most refuse; what the probe cares about is whether the call reached
 * the pipeline first.
 * @param tool - The tool's name
 */
async function callWithNothing(tool: string): Promise<void> {
  const pending = Promise.resolve()
    .then(() => callTool(tool, CALL_THAT_WRITES[tool] ?? {}, {} as ToolContext))
    .catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;

  // A tool that waits on Live or the remote script has no answer to give here.
  await Promise.race([
    pending,
    new Promise((resolve) => {
      timer = setTimeout(resolve, 200);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * The specifiers a file imports from or re-exports.
 * @param file - Absolute path
 * @returns The specifiers, as written
 */
function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");

  return [
    ...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g),
  ].map((match) => match[1] as string);
}

/**
 * Where a specifier points, relative to the repo root.
 * @param specifier - An import specifier
 * @param fromRel - Repo-relative path of the importing file
 * @returns The repo-relative path it names, or null for a package
 */
function resolveSpecifier(specifier: string, fromRel: string): string | null {
  if (specifier.startsWith("#src/")) {
    return `src/${specifier.slice("#src/".length)}`;
  }

  return specifier.startsWith(".")
    ? path.join(path.dirname(fromRel), specifier)
    : null;
}
