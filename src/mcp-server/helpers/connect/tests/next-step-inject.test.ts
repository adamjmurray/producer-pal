// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rememberMemory } from "#src/mcp-server/helpers/memory/global-memory-store.ts";
import {
  connectResponse,
  fakeInnerCall,
  useTempConfigDir,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { withNextStep } from "../next-step-inject.ts";

const getDir = useTempConfigDir();

/**
 * Run withNextStep over a ppal-connect call and return the appended block.
 * @param smallModelMode - Whether small-model mode is active
 * @returns The appended next-step block
 */
async function nextStep(smallModelMode = false): Promise<string> {
  const result = await withNextStep(
    fakeInnerCall(connectResponse()),
    () => smallModelMode,
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

describe("withNextStep", () => {
  it("always appends a next-step block, even with nothing else to say", async () => {
    seedMemory();

    const result = await withNextStep(
      fakeInnerCall(connectResponse()),
      () => false,
    )("ppal-connect", {});

    expect(result.content).toHaveLength(2);
    expect(result.content[1]?.text).toContain("Report the connection status");
  });

  it("passes the original tool, args, and overrides through to the inner", async () => {
    const inner = fakeInnerCall(connectResponse());
    const overrides = { timeoutMs: 5000 };

    await withNextStep(inner, () => false)(
      "ppal-connect",
      { foo: 1 },
      overrides,
    );

    expect(inner).toHaveBeenCalledWith("ppal-connect", { foo: 1 }, overrides);
  });

  it("leaves non-connect tool responses untouched", async () => {
    const result = await withNextStep(
      fakeInnerCall(connectResponse()),
      () => false,
    )("ppal-read-track", {});

    expect(result.content).toHaveLength(1);
  });

  it("does not inject when the connect response is an error", async () => {
    const result = await withNextStep(
      fakeInnerCall({
        content: [{ type: "text", text: "boom" }],
        isError: true,
      }),
      () => false,
    )("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });

  describe("onboarding variant", () => {
    it("asks about the user when there is no global context and no memory", async () => {
      const block = await nextStep();

      expect(block).toContain("no context or memories about this user yet");
      expect(block).toContain("musical style, preferences, and goals");
    });

    it("tells the assistant to record a decline so the offer is one-shot", async () => {
      const block = await nextStep();

      expect(block).toContain("write a memory recording that");
    });

    it("stays quiet once the user has any memory", async () => {
      seedMemory();

      const block = await nextStep();

      expect(block).toBe(
        "Report the connection status and Live Set overview to the user, then wait for their instructions.",
      );
    });

    it("stays quiet once the user has global context", async () => {
      writeFileSync(join(getDir(), "context.md"), "I make ambient techno.");

      const block = await nextStep();

      expect(block).not.toContain("musical style, preferences, and goals");
    });

    it("treats whitespace-only global context as no context", async () => {
      writeFileSync(join(getDir(), "context.md"), "   \n\n  ");

      const block = await nextStep();

      expect(block).toContain("musical style, preferences, and goals");
    });

    // Small-model mode drops scope:memory from ppal-context, so a small model
    // could neither save what it learned nor record a decline — it would re-ask
    // on every single connect.
    it("never asks in small-model mode, even with nothing stored", async () => {
      const block = await nextStep(true);

      expect(block).not.toContain("musical style, preferences, and goals");
      expect(block).toContain("wait for their instructions");
    });
  });
});
