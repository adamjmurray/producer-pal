// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The Skills must not deny audio-to-MIDI where `convert` is taught, and must
// still be right where it isn't (no remote script, small-model mode). DENIAL
// only matches the old wording; it guards that sentence, not every phrasing.

import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { buildSkills } from "#src/skills/build-skills.ts";

const ALL_TOOLS = [...TOOL_NAMES];
const CONVERT = "`convert`";
const DENIAL = /no audio→MIDI/;
const CONDITION = /audio→MIDI.*remote script/i;

describe("buildSkills - audio to MIDI", () => {
  it("teaches convert and doesn't deny audio-to-MIDI with the remote script", () => {
    const skills = buildSkills({ tools: ALL_TOOLS, remoteScript: true });

    expect(skills).toContain(CONVERT);
    expect(skills).not.toMatch(DENIAL);
    expect(skills).toMatch(CONDITION);
  });

  it("doesn't deny it without the remote script, and names it as the condition", () => {
    const skills = buildSkills({ tools: ALL_TOOLS, remoteScript: false });

    expect(skills).not.toContain(CONVERT);
    expect(skills).not.toMatch(DENIAL);
    expect(skills).toMatch(CONDITION);
  });

  it("still says there is no audio-to-MIDI in small-model mode", () => {
    for (const remoteScript of [false, true]) {
      const skills = buildSkills({ smallModelMode: true, remoteScript });

      expect(skills).toMatch(DENIAL);
      expect(skills).not.toContain(CONVERT);
    }
  });
});
