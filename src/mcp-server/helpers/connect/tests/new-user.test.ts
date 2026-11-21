// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rememberMemory } from "#src/mcp-server/helpers/memory/memory-store.ts";
import { useTempConfigDir } from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { hasContextTool, isNewUser } from "../new-user.ts";

const getDir = useTempConfigDir();

describe("isNewUser", () => {
  it("is true with no global context and no memories", () => {
    expect(isNewUser({ smallModelMode: false })).toBe(true);
  });

  it("is false once there is global context or a memory", () => {
    writeFileSync(join(getDir(), "context.md"), "I make ambient techno.");

    expect(isNewUser({ smallModelMode: false })).toBe(false);
  });

  it("is false once there is a memory", () => {
    rememberMemory({
      name: "prefers-dark-techno",
      description: "Default genre for new material",
      body: "Dark, hypnotic techno around 138 BPM.",
    });

    expect(isNewUser({ smallModelMode: false })).toBe(false);
  });

  it("is false when nothing could record the outcome", () => {
    expect(isNewUser({ smallModelMode: true })).toBe(false);
    expect(isNewUser({ smallModelMode: false, tools: ["ppal-connect"] })).toBe(
      false,
    );
  });
});

describe("hasContextTool", () => {
  it("is true unless the toolset leaves ppal-context out", () => {
    expect(hasContextTool({})).toBe(true);
    expect(hasContextTool({ tools: ["ppal-context"] })).toBe(true);
    expect(hasContextTool({ tools: ["ppal-connect"] })).toBe(false);
  });
});
