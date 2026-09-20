// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E sweep: a clip slot past the last scene makes the scenes up to it, the
 * same way for every tool that writes into one, and the entry says which it
 * made. update-scene's `path` names a target rather than a destination, so it
 * still refuses — with create-scene named.
 *
 * The scene count is read before each case: earlier cases add scenes, so a
 * literal index here would name a different place on the second run.
 *
 * Uses: e2e-test-set. See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-clip-past-the-end-scenes
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  getToolErrorMessage,
  isToolError,
  parseToolResultWithWarnings,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** t8, the empty MIDI track every case writes into. */
const SCRATCH = `t${EMPTY_MIDI_TRACK}`;

describe("a clip slot past the last scene", () => {
  /**
   * How many scenes the Set holds right now.
   * @returns The scene count
   */
  async function sceneCount(): Promise<number> {
    const liveSet = parseToolResult<{ scenes?: unknown[] }>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["scenes"] },
      }),
    );

    return liveSet.scenes?.length ?? 0;
  }

  /**
   * A clip in the first free slot of the scratch track, to move or copy.
   * @param sceneIndex - The slot to put it in
   * @returns The clip's id
   */
  async function clipAt(sceneIndex: number): Promise<string> {
    const clip = parseToolResult<CreateClipResult>(
      await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          path: `${SCRATCH}/s${sceneIndex}`,
          notes: "C3 1|1",
          length: "1bar",
        },
      }),
    );

    await sleep(100);

    return clip.id;
  }

  /**
   * Write into the slot one scene past the last, and check the entry names the
   * scenes it made and warns about nothing.
   * @param toolName - The tool to call
   * @param argsFor - The call's arguments, given the scene it writes into
   * @returns What the call reported, and the scene it wrote into
   */
  async function expectScenesCreatedPastTheEnd(
    toolName: string,
    argsFor: (target: number) => Record<string, unknown>,
  ): Promise<{ data: CreateClipResult; target: number }> {
    const before = await sceneCount();
    const target = before + 1;

    const { data, warnings } = parseToolResultWithWarnings<CreateClipResult>(
      await ctx.client!.callTool({
        name: toolName,
        arguments: argsFor(target),
      }),
    );

    await sleep(100);

    expect(data.path).toBe(`${SCRATCH}/s${target}`);
    expect(data.created).toBe(`s${before}-s${target}`);
    expect(warnings).toStrictEqual([]);

    return { data, target };
  }

  it("is created by ppal-create-clip, which names the scenes it made", async () => {
    const { target } = await expectScenesCreatedPastTheEnd(
      "ppal-create-clip",
      (scene) => ({
        path: `${SCRATCH}/s${scene}`,
        notes: "C3 1|1",
        length: "1bar",
      }),
    );

    expect(await sceneCount()).toBe(target + 1);
  });

  it("is created by a ppal-update-clip toPath, which used to refuse it", async () => {
    const clipId = await clipAt(0);
    const { data } = await expectScenesCreatedPastTheEnd(
      "ppal-update-clip",
      (scene) => ({
        id: clipId,
        toPath: `${SCRATCH}/s${scene}`,
      }),
    );

    expect(data.reason).toBeUndefined();
  });

  it("is created by a ppal-duplicate toPath, which used to refuse it", async () => {
    const clipId = await clipAt(1);

    await expectScenesCreatedPastTheEnd("ppal-duplicate", (scene) => ({
      type: "clip",
      id: clipId,
      toPath: `${SCRATCH}/s${scene}`,
    }));
  });

  // A scene is not a destination here: `path` names the scene to write to, and
  // nothing in the call says what a new one would be.
  it("is still refused by ppal-update-scene, which names create-scene", async () => {
    const missing = (await sceneCount()) + 50;
    const result = await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { path: `s${missing}`, name: "Nowhere" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `no scene at path "s${missing}"; ppal-create-scene makes one`,
    );
    // The refusal made nothing.
    expect(await sceneCount()).toBe(missing - 50);
  });
});
