// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-create-clip auto, which drives Live's real transport:
 * play-clip fires only the new clip, play-scene fires the whole scene.
 * Uses: e2e-test-set (t8 is empty; s0 already holds clips on t0-t5)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- clip/create/ppal-create-clip-auto
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

interface CreatedClip {
  id: string;
}

interface ReadClipResult {
  id: string;
  playing?: boolean;
  triggered?: boolean;
}

async function createClip(path: string, auto?: string): Promise<CreatedClip> {
  return parseToolResult<CreatedClip>(
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path,
        notes: "C3 1|1",
        length: "1bar",
        ...(auto && { auto }),
      },
    }),
  );
}

async function readClip(id: string): Promise<ReadClipResult> {
  return parseToolResult<ReadClipResult>(
    await ctx.client!.callTool({ name: "ppal-read-clip", arguments: { id } }),
  );
}

/**
 * s1 also holds a clip on t3, so the neighbor says whether the transport fired
 * just the new clip or the whole scene.
 * @returns t3's session clips
 */
async function readNeighborClips(): Promise<ReadClipResult[]> {
  const track = parseToolResult<{ sessionClips?: ReadClipResult[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path: "t3", include: ["session-clips"] },
    }),
  );

  return track.sessionClips!;
}

/**
 * Create a clip with an `auto` action and read it back once Live has acted.
 * @param auto - The ppal-create-clip auto action
 * @returns The created clip, as read back
 */
async function createAndFire(auto: string): Promise<ReadClipResult> {
  const created = await createClip(`t${EMPTY_MIDI_TRACK}/s1`, auto);

  await sleep(300);

  return readClip(created.id);
}

describe("ppal-create-clip auto", () => {
  afterEach(async () => {
    await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "stop" },
    });
  });

  it("fires just the new clip with play-clip", async () => {
    const clip = await createAndFire("play-clip");

    expect(clip.playing || clip.triggered).toBe(true);

    // A scene launch would have caught the neighbor too
    const t3Clip = (await readNeighborClips()).find((c) => c.id !== clip.id);

    expect(t3Clip?.playing).toBeUndefined();
    expect(t3Clip?.triggered).toBeUndefined();
  });

  it("fires the whole scene with play-scene", async () => {
    const clip = await createAndFire("play-scene");

    expect(clip.playing || clip.triggered).toBe(true);

    // The point of play-scene is that the neighbors start too
    const t3Clip = (await readNeighborClips())[0]!;

    expect(t3Clip.playing || t3Clip.triggered).toBe(true);
  });

  it("leaves the transport alone without auto", async () => {
    const created = await createClip(`t${EMPTY_MIDI_TRACK}/s1`);

    await sleep(300);

    const clip = await readClip(created.id);

    expect(clip.playing).toBeUndefined();
    expect(clip.triggered).toBeUndefined();
  });
});
