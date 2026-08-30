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

describe("ppal-create-clip auto", () => {
  afterEach(async () => {
    await ctx.client!.callTool({
      name: "ppal-playback",
      arguments: { action: "stop" },
    });
  });

  it("fires just the new clip with play-clip", async () => {
    const created = await createClip("t8/s1", "play-clip");

    await sleep(300);

    const clip = await readClip(created.id);

    expect(clip.playing || clip.triggered).toBe(true);

    // s1 also holds t3's clip, which a scene launch would have caught
    const neighbor = parseToolResult<{ sessionClips?: ReadClipResult[] }>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { trackIndex: 3, include: ["session-clips"] },
      }),
    );
    const t3Clip = neighbor.sessionClips!.find((c) => c.id !== created.id);

    expect(t3Clip?.playing).toBeUndefined();
    expect(t3Clip?.triggered).toBeUndefined();
  });

  it("fires the whole scene with play-scene", async () => {
    const created = await createClip("t8/s1", "play-scene");

    await sleep(300);

    const clip = await readClip(created.id);

    expect(clip.playing || clip.triggered).toBe(true);

    // The point of play-scene is that the neighbors start too
    const neighbor = parseToolResult<{ sessionClips?: ReadClipResult[] }>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { trackIndex: 3, include: ["session-clips"] },
      }),
    );
    const t3Clip = neighbor.sessionClips![0]!;

    expect(t3Clip.playing || t3Clip.triggered).toBe(true);
  });

  it("leaves the transport alone without auto", async () => {
    const created = await createClip("t8/s1");

    await sleep(300);

    const clip = await readClip(created.id);

    expect(clip.playing).toBeUndefined();
    expect(clip.triggered).toBeUndefined();
  });
});
