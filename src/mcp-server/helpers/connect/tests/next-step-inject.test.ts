// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contextStandard } from "#src/skills/fragments/context.ts";
import { rememberMemory } from "#src/mcp-server/helpers/memory/memory-store.ts";
import {
  connectResponse,
  fakeInnerCall,
  useTempConfigDir,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { withNextStep, type NextStepConfig } from "../next-step-inject.ts";

const getDir = useTempConfigDir();

const MARKER = "nothing is saved about them yet";

/**
 * Run withNextStep over a ppal-connect call and return the appended block.
 * @param overrides - Device settings to override the defaults
 * @returns The appended next-step block
 */
async function nextStep(
  overrides: Partial<NextStepConfig> = {},
): Promise<string> {
  const config: NextStepConfig = {
    smallModelMode: false,
    projectContext: "",
    ...overrides,
  };

  const result = await withNextStep(
    fakeInnerCall(connectResponse()),
    () => config,
  )("ppal-connect", {});

  return result.content.at(-1)?.text ?? "";
}

/** Write a memory entry, which is what marks a user as no longer a stranger. */
function seedMemory(): void {
  rememberMemory({
    name: "prefers-dark-techno",
    description: "Default genre for new material",
    body: "Dark, hypnotic techno around 138 BPM.",
  });
}

/** Fill every layer, so nothing is empty and nobody is a stranger. */
function seedEverything(): void {
  writeFileSync(join(getDir(), "context.md"), "I make ambient techno.");
  seedMemory();
}

describe("withNextStep", () => {
  it("always appends a next-step block, even with nothing else to say", async () => {
    seedEverything();

    const result = await withNextStep(fakeInnerCall(connectResponse()), () => ({
      smallModelMode: false,
      projectContext: "House track.",
    }))("ppal-connect", {});

    expect(result.content).toHaveLength(2);
    expect(result.content[1]?.text).toContain("Report the connection status");
  });

  it("passes the original tool, args, and overrides through to the inner", async () => {
    const inner = fakeInnerCall(connectResponse());
    const overrides = { timeoutMs: 5000 };

    await withNextStep(inner, () => ({
      smallModelMode: false,
      projectContext: "",
    }))("ppal-connect", { foo: 1 }, overrides);

    expect(inner).toHaveBeenCalledWith("ppal-connect", { foo: 1 }, overrides);
  });

  it("leaves non-connect tool responses untouched", async () => {
    const result = await withNextStep(fakeInnerCall(connectResponse()), () => ({
      smallModelMode: false,
      projectContext: "",
    }))("ppal-read-track", {});

    expect(result.content).toHaveLength(1);
  });

  it("does not inject when the connect response is an error", async () => {
    const result = await withNextStep(
      fakeInnerCall({
        content: [{ type: "text", text: "boom" }],
        isError: true,
      }),
      () => ({ smallModelMode: false, projectContext: "" }),
    )("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });

  // The layer injectors emit NO block when their layer is empty, and a model
  // cannot be relied on to notice a block that isn't there — one read an absent
  // global-context block, guessed the document had content, and never checked.
  describe("empty-layer report", () => {
    it("names every empty layer", async () => {
      const block = await nextStep();

      expect(block).toContain(
        "Currently empty: project context, global context, memory.",
      );
    });

    it("names only the layers that are actually empty", async () => {
      seedMemory();

      const block = await nextStep({ projectContext: "House track." });

      expect(block).toContain("Currently empty: global context.");
    });

    it("says nothing when every layer has content", async () => {
      seedEverything();

      const block = await nextStep({ projectContext: "House track." });

      expect(block).not.toContain("Currently empty");
    });

    // Regression: this line was ungated while the memory block and the
    // onboarding ask were gated, so it became the only mention of layers this
    // caller can neither read nor fill.
    it("names nothing when the caller has no ppal-context", async () => {
      const block = await nextStep({
        tools: ["ppal-connect", "ppal-read-track"],
      });

      expect(block).not.toContain("Currently empty");
    });

    // Small-model mode's ppal-context has no scope:memory, so naming memory
    // would point it at a layer it cannot address.
    it("never names memory in small-model mode", async () => {
      const block = await nextStep({ smallModelMode: true });

      expect(block).toContain(
        "Currently empty: project context, global context.",
      );
      expect(block).not.toContain("memory");
    });
  });

  describe("onboarding variant", () => {
    it("marks a user with no global context and no memory as new", async () => {
      const block = await nextStep();

      expect(block).toContain(MARKER);
      expect(block).toContain("wait for their instructions");
    });

    // The connect result only states the fact; the Skill holds the procedure.
    // Both must key on the same phrase or the Skill never fires.
    it("keys the context Skill's New user paragraph on the same marker", () => {
      const paragraph = contextStandard
        .split("\n\n")
        .find((part) => part.startsWith("**New user**"));

      expect(paragraph).toContain(`connect says ${MARKER}`);
      expect(paragraph).toContain("yes-or-no question");
      expect(paragraph).toContain("write what they said to global context");
      expect(paragraph).toContain("write a one-line memory");
    });

    it("is not marked new once the user has any memory", async () => {
      seedMemory();

      const block = await nextStep();

      expect(block).not.toContain(MARKER);
      expect(block).toContain("wait for their instructions");
    });

    it("is not marked new once the user has global context", async () => {
      writeFileSync(join(getDir(), "context.md"), "I make ambient techno.");

      const block = await nextStep();

      expect(block).not.toContain(MARKER);
    });

    it("treats whitespace-only global context as no context", async () => {
      writeFileSync(join(getDir(), "context.md"), "   \n\n  ");

      const block = await nextStep();

      expect(block).toContain(MARKER);
    });

    // Small-model mode drops scope:memory from ppal-context, so a small model
    // could neither save what it learned nor record a decline — it would re-ask
    // on every single connect.
    it("never marks new in small-model mode, even with nothing stored", async () => {
      const block = await nextStep({ smallModelMode: true });

      expect(block).not.toContain(MARKER);
      expect(block).toContain("wait for their instructions");
    });

    // Same reasoning, harder: with no ppal-context at all there is nowhere to
    // put the answer OR the decline, so the ask would repeat forever.
    it("never marks new when the caller has no ppal-context", async () => {
      const block = await nextStep({
        tools: ["ppal-connect", "ppal-read-track"],
      });

      expect(block).not.toContain(MARKER);
      expect(block).toContain("wait for their instructions");
    });

    it("marks a new user when the toolset keeps ppal-context", async () => {
      const block = await nextStep({
        tools: ["ppal-connect", "ppal-context"],
      });

      expect(block).toContain(MARKER);
    });
  });
});
