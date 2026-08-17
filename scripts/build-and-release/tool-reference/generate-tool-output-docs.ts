#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Runs every tool once against a mock Live Set and writes the result into the
// tool reference as an "Example output" block. No Ableton Live involved — the
// Live API is the test suite's mock, loaded with the example Live Set in
// example-live-set/live-set.ts.
//
// Unlike the schema generator next door, this runs the tool implementations, so
// it needs the generated Peggy parsers. They're gitignored, which is why
// `npm run docs:examples` builds them first.

import { writeDocPartial } from "./generated-docs-dir.ts";
import { TOOL_EXAMPLES } from "./example-live-set/calls.ts";
import { installMockLiveApi } from "./example-live-set/live-api.ts";

/**
 * Generates the example-output doc partials for the docs site
 */
async function main(): Promise<void> {
  // Everything below has to load after the mock Live API is installed, so the
  // tool modules see it as their global.
  await installMockLiveApi();

  const { createExampleRunner } = await import("./example-live-set/runner.ts");
  const { generateOutputPartial } =
    await import("./tool-output-doc-partials.ts");

  const runner = await createExampleRunner();

  reportMissingExamples(runner.toolNames);

  const failures: string[] = [];

  for (const example of TOOL_EXAMPLES) {
    const run = await runner.run(example);

    if (run.error != null) {
      failures.push(`${example.toolName}: ${run.error}`);
    }

    await writeDocPartial(
      `${example.toolName}-output.md`,
      generateOutputPartial(run),
    );
  }

  console.log(
    `Generated ${TOOL_EXAMPLES.length} example-output partials in docs/_generated/`,
  );

  // A failing example is a broken doc — publishing it would ship a warning box
  // where the output should be, so stop the docs build.
  if (failures.length > 0) {
    console.error(`Example calls that failed:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

/**
 * Warn about any documented tool with no example call.
 * @param toolNames - Every tool the docs cover
 */
function reportMissingExamples(toolNames: string[]): void {
  const covered = new Set(TOOL_EXAMPLES.map((example) => example.toolName));
  const missing = toolNames.filter((name) => !covered.has(name));

  if (missing.length > 0) {
    console.warn(`No example call for: ${missing.join(", ")}`);
  }
}

await main();
