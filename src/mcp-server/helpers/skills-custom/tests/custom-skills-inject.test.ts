// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  connectResponse,
  fakeInnerCall,
  useTempConfigDir,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { rememberCustomSkill } from "../custom-skills-store.ts";
import { withCustomSkills } from "../custom-skills-inject.ts";

useTempConfigDir();

/**
 * Run withCustomSkills over a ppal-connect call and return the appended block.
 * @returns The appended skills block, or undefined when none was appended
 */
async function appendedBlock(): Promise<string | undefined> {
  const result = await withCustomSkills(fakeInnerCall(connectResponse()))(
    "ppal-connect",
    {},
  );

  return result.content.length > 1 ? result.content[1]?.text : undefined;
}

describe("withCustomSkills", () => {
  it("injects each enabled skill as an index line, never a body", async () => {
    rememberCustomSkill({
      name: "jazz-voicings",
      description: "rich voicings",
      body: "SECRET_VOICINGS_BODY",
    });
    rememberCustomSkill({
      name: "my-drum-style",
      description: "swung, humanized",
      body: "SECRET_DRUMS_BODY",
    });

    const block = (await appendedBlock()) ?? "";

    expect(block).toContain("- `jazz-voicings` — rich voicings");
    expect(block).toContain("- `my-drum-style` — swung, humanized");
    // Bodies are NEVER injected — only the index.
    expect(block).not.toContain("SECRET_VOICINGS_BODY");
    expect(block).not.toContain("SECRET_DRUMS_BODY");
    // Tells the assistant how to load a skill on demand.
    expect(block).toContain('scope:"skills"');
  });

  it("renders a descriptionless skill without a trailing dash", async () => {
    rememberCustomSkill({ name: "bare", description: "", body: "b" });

    const block = (await appendedBlock()) ?? "";

    expect(block).toContain("- `bare`");
    expect(block).not.toContain("- `bare` —");
  });

  it("omits disabled skills from the injected index", async () => {
    rememberCustomSkill({ name: "on", description: "shown", body: "b" });
    rememberCustomSkill({
      name: "off",
      description: "hidden",
      body: "b",
      enabled: false,
    });

    const block = (await appendedBlock()) ?? "";

    expect(block).toContain("- `on` — shown");
    expect(block).not.toContain("off");
  });

  it("does not inject when there are no skills", async () => {
    const result = await withCustomSkills(fakeInnerCall(connectResponse()))(
      "ppal-connect",
      {},
    );

    expect(result.content).toHaveLength(1);
  });

  it("does not inject when every skill is disabled", async () => {
    rememberCustomSkill({
      name: "off",
      description: "hidden",
      body: "b",
      enabled: false,
    });

    const result = await withCustomSkills(fakeInnerCall(connectResponse()))(
      "ppal-connect",
      {},
    );

    expect(result.content).toHaveLength(1);
  });

  it("leaves non-connect tool responses untouched", async () => {
    rememberCustomSkill({ name: "on", description: "d", body: "b" });

    const result = await withCustomSkills(fakeInnerCall(connectResponse()))(
      "ppal-read-track",
      {},
    );

    expect(result.content).toHaveLength(1);
  });
});
