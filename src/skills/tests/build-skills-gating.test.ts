// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The two suppression axes that come from the RUNTIME rather than from the user:
// which tools this caller can reach, and who is listening. They share a file
// because they share the mechanism (both empty a fragment through the same
// `suppressed` set in buildSkills) and because build-skills.test.ts is at the
// test-file line cap.

import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { buildSkills } from "#src/skills/build-skills.ts";

const HEADER = "# Producer Pal Skills";

describe("buildSkills - tool gating", () => {
  const ALL_TOOLS = [...TOOL_NAMES];

  it("ships everything when the toolset is not supplied", () => {
    expect(buildSkills({ notation: "barbeat" })).toBe(
      buildSkills({ notation: "barbeat", tools: ALL_TOOLS }),
    );
  });

  it("drops a section whose every tool is off, and says nothing about it", () => {
    // Disabling a tool is a setting, not a broken document — no warning.
    const warnings: string[] = [];
    const result = buildSkills(
      {
        notation: "barbeat",
        tools: ALL_TOOLS.filter((name) => name !== "ppal-library"),
      },
      {},
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("## Finding Library Content");
    expect(result).toContain("## Devices & Instruments");
    expect(warnings).toStrictEqual([]);
  });

  it("drops a user's override of a gated fragment too", () => {
    // The override slot is named for the fragment's subject, so a customized
    // library guide is exactly as dead as the built-in when the tool is off.
    const result = buildSkills(
      {
        notation: "barbeat",
        tools: ALL_TOOLS.filter((name) => name !== "ppal-library"),
      },
      { fragments: { library: "MY LIBRARY NOTES" } },
    );

    expect(result).not.toContain("MY LIBRARY NOTES");
  });

  it("drops a dependent together with what it requires, never alone", () => {
    const warnings: string[] = [];
    const result = buildSkills(
      {
        notation: "barbeat",
        tools: ALL_TOOLS.filter((name) => !name.endsWith("-device")),
      },
      {},
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("## Devices & Instruments");
    expect(result).not.toContain("### Specialized Device Controls");
    expect(warnings).toStrictEqual([]);
  });

  it("cuts the blob down to the conversational core for a minimal toolset", () => {
    const full = buildSkills({ notation: "barbeat", tools: ALL_TOOLS });
    const minimal = buildSkills({
      notation: "barbeat",
      tools: ["ppal-connect", "ppal-playback", "ppal-select"],
    });

    expect(minimal).toContain("## Time & Note Values");
    expect(minimal).toContain("## Working with Ableton Live");
    expect(minimal).toContain("## Getting Help");
    expect(minimal).not.toContain("## Positions & Meter"); // bar|beat head
    expect(minimal).not.toContain("## Transforms");
    expect(minimal).not.toContain("## Context & Memory");
    expect(minimal.length).toBeLessThan(full.length / 2);
  });

  it("gates the small-model document the same way", () => {
    const result = buildSkills({
      smallModelMode: true,
      tools: ALL_TOOLS.filter((name) => name !== "ppal-context"),
    });

    expect(result).toContain(HEADER);
    expect(result).not.toContain("## Context");
  });
});

describe("buildSkills - audience gating", () => {
  const ALL_TOOLS = [...TOOL_NAMES];

  it("ships everything when the audience is not supplied", () => {
    expect(buildSkills({ notation: "barbeat", tools: ALL_TOOLS })).toBe(
      buildSkills({ notation: "barbeat", tools: ALL_TOOLS, audience: "chat" }),
    );
  });

  it("drops the conversation-only guidance for a subagent worker", () => {
    // A worker has no user to explain a limitation to, and no toolset could
    // ever have said so — Getting Help maps to no tool at all.
    const warnings: string[] = [];
    const result = buildSkills(
      { notation: "barbeat", tools: ALL_TOOLS, audience: "subagent" },
      {},
      (message) => warnings.push(message),
    );

    expect(result).not.toContain("## Getting Help");
    expect(result).toContain("## Working with Ableton Live");
    expect(warnings).toStrictEqual([]);
  });

  it("composes with tool gating rather than replacing it", () => {
    const result = buildSkills({
      notation: "barbeat",
      tools: ALL_TOOLS.filter((name) => name !== "ppal-library"),
      audience: "subagent",
    });

    expect(result).not.toContain("## Getting Help");
    expect(result).not.toContain("## Finding Library Content");
    expect(result).toContain("## Devices & Instruments");
  });

  it("drops a user's override of an audience-gated fragment too", () => {
    // Same rule as tool gating: suppression runs AFTER the override lookup, so
    // a customized fragment is exactly as absent as the built-in.
    const result = buildSkills(
      { notation: "barbeat", tools: ALL_TOOLS, audience: "subagent" },
      { fragments: { "getting-help": "MY HELP NOTES" } },
    );

    expect(result).not.toContain("MY HELP NOTES");
  });

  it("gates the small-model document the same way", () => {
    const result = buildSkills({
      smallModelMode: true,
      tools: ALL_TOOLS,
      audience: "subagent",
    });

    expect(result).toContain(HEADER);
  });
});
