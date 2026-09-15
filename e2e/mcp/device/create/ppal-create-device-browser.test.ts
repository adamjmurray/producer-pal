// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-create-device loading a device from Live's browser through
 * the Producer Pal remote script. Opt-in: skipped unless E2E_REMOTE_SCRIPT=true,
 * and failed, not skipped, when that's set but the remote script isn't
 * answering. Uses Live's built-in LFO, never a machine-specific plug-in.
 *
 * Uses: e2e-test-set (rt0 is a return track)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- device/create/ppal-create-device-browser
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  remoteScriptAnswers,
  setupMcpTestContext,
  sleep,
  trackIndexFromPath,
} from "../../mcp-test-helpers";

describe.skipIf(process.env.E2E_REMOTE_SCRIPT !== "true")(
  "ppal-create-device — devices from Live's browser",
  () => {
    // Ahead of the per-test hooks, so a missing remote script fails before any
    // Live Set opens.
    beforeAll(async () => {
      if (!(await remoteScriptAnswers())) {
        const port = process.env.PPAL_REMOTE_SCRIPT_PORT ?? "3349";

        throw new Error(
          `E2E_REMOTE_SCRIPT=true, but the Producer Pal remote script isn't running: nothing answered GET /ping on 127.0.0.1:${port}. Install it and select it as a control surface (see remote-script/README.md).`,
        );
      }
    });

    const ctx = setupMcpTestContext();

    /**
     * Create a device and parse the result.
     * @param deviceName - Device to create
     * @param path - Insertion path
     * @returns The new device
     */
    async function createDevice(
      deviceName: string,
      path: string,
    ): Promise<CreateDeviceResult> {
      const created = parseToolResult<CreateDeviceResult>(
        await ctx.client!.callTool({
          name: "ppal-create-device",
          arguments: { deviceName, path },
        }),
      );

      await sleep(100);

      return created;
    }

    /**
     * A fresh track to build on, so the Set's own tracks stay intact.
     * @param type - Track type
     * @returns The new track's index
     */
    async function createTrack(type: "midi" | "audio"): Promise<number> {
      const track = parseToolResult<{ path: string }>(
        await ctx.client!.callTool({
          name: "ppal-create-track",
          arguments: { type },
        }),
      );

      await sleep(100);

      return trackIndexFromPath(track.path);
    }

    /**
     * How many regular tracks the Set has, to prove the temp track is gone.
     * @returns The track count
     */
    async function trackCount(): Promise<number> {
      const liveSet = parseToolResult<{ tracks?: unknown[] }>(
        await ctx.client!.callTool({
          name: "ppal-read-live-set",
          arguments: { include: ["tracks"] },
        }),
      );

      return liveSet.tracks?.length ?? 0;
    }

    /**
     * The id of the device at a path, to check a result's path names it.
     * @param path - Producer Pal path to the device
     * @returns The device's id
     */
    async function idAt(path: string): Promise<string> {
      return parseToolResult<{ id: string }>(
        await ctx.client!.callTool({
          name: "ppal-read-device",
          arguments: { path },
        }),
      ).id;
    }

    it("appends LFO to a track and leaves no temp track behind", async () => {
      const trackIndex = await createTrack("audio");
      const before = await trackCount();
      const lfo = await createDevice("LFO", `t${trackIndex}/d+`);

      expect(lfo.path).toMatch(new RegExp(`^t${trackIndex}/d\\d+$`));
      expect(await idAt(lfo.path)).toBe(lfo.id);
      expect(await trackCount()).toBe(before);
    });

    it("inserts LFO at an index", async () => {
      const trackIndex = await createTrack("audio");

      await createDevice("Compressor", `t${trackIndex}/d+`);

      const lfo = await createDevice("LFO", `t${trackIndex}/d0`);

      expect(lfo.path).toBe(`t${trackIndex}/d0`);
      expect(await idAt(lfo.path)).toBe(lfo.id);
    });

    it("loads LFO into a rack chain", async () => {
      const trackIndex = await createTrack("audio");
      const rack = await createDevice("Audio Effect Rack", `t${trackIndex}`);
      const lfo = await createDevice("LFO", `${rack.path}/c0/d+`);

      expect(lfo.path.startsWith(`${rack.path}/c0/d`)).toBe(true);
      expect(await idAt(lfo.path)).toBe(lfo.id);
    });

    it("loads LFO onto a return track", async () => {
      const before = await trackCount();
      const lfo = await createDevice("LFO", "rt0/d+");

      expect(lfo.path).toMatch(/^rt0\/d\d+$/);
      expect(await idAt(lfo.path)).toBe(lfo.id);
      expect(await trackCount()).toBe(before);
    });

    it("refuses a name nothing has, leaving no temp track behind", async () => {
      const before = await trackCount();
      const result = await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "NoSuchDevice12345", path: "t0/d+" },
      });

      expect(isToolError(result)).toBe(true);
      expect(getToolErrorMessage(result)).toContain(
        'invalid deviceName "NoSuchDevice12345"',
      );
      expect(await trackCount()).toBe(before);
    });
  },
);

interface CreateDeviceResult {
  id: string;
  path: string;
}
