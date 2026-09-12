// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * An argument no param accepts is reported, on both transports.
 *
 * The schema strips it before the handler runs, so without the warning a
 * misspelled optional param comes back as a clean success that changed
 * nothing. MCP warned from the start; REST was silent, which is what this
 * pins — a unit test can't see the two transports resolve the same schema the
 * running device does.
 *
 * A deprecated param sits in the schema that validates and out of the one that
 * ships, so it must NOT be reported here. That is the regression this guards.
 *
 * Uses: e2e-test-set - t8 "9-MIDI" (empty MIDI track)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- workflow/unexpected-args
 */
import { describe, expect, it } from "vitest";
import {
  CONFIG_URL,
  parseToolResultWithWarnings,
  setupMcpTestContext,
} from "../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

const REST_BASE_URL = CONFIG_URL.replace("/config", "");

/**
 * Call a tool over REST and hand back the warnings it reported.
 * @param toolName - Tool to call
 * @param args - Tool arguments, typo included
 * @returns The response's warnings, empty when it reported none
 */
async function restWarnings(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string[]> {
  const response = await fetch(`${REST_BASE_URL}/api/tools/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  expect(response.status).toBe(200);

  const body = (await response.json()) as {
    isError?: boolean;
    warnings?: string[];
  };

  expect(body.isError ?? false).toBe(false);

  return body.warnings ?? [];
}

describe("unexpected arguments", () => {
  it("names one over MCP", async () => {
    const { warnings } = parseToolResultWithWarnings(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { path: `t${EMPTY_MIDI_TRACK}`, inclde: ["notes"] },
      }),
    );

    expect(warnings.join("\n")).toContain(
      "ignored unexpected argument(s): inclde",
    );
  });

  it("names one over REST", async () => {
    const warnings = await restWarnings("ppal-read-track", {
      path: `t${EMPTY_MIDI_TRACK}`,
      inclde: ["notes"],
    });

    expect(warnings.join("\n")).toContain(
      "ignored unexpected argument(s): inclde",
    );
  });

  it("says nothing when every argument is known", async () => {
    const warnings = await restWarnings("ppal-read-track", {
      path: `t${EMPTY_MIDI_TRACK}`,
    });

    expect(warnings).toStrictEqual([]);
  });

  it("does not call a deprecated param unexpected", async () => {
    // It is in the schema that validates and out of the one that ships, so
    // diffing against the published schema would report every old caller's
    // params as arguments nothing accepts.
    const warnings = await restWarnings("ppal-read-track", {
      trackIndex: EMPTY_MIDI_TRACK,
    });

    expect(warnings.join("\n")).toContain('param "trackIndex" is deprecated');
    expect(warnings.join("\n")).not.toContain("unexpected argument");
  });
});
