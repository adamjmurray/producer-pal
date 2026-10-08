// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests that ppal-read-live-set shows the tempo's arrangement lane, and
 * ppal-read-device (chains) shows the lanes on a rack chain's mixer. A chain
 * follows its track, so while the track plays from Session its lanes can't be
 * read, and the rack says so.
 *
 * The lanes come from arrangement recording: with record mode on and the
 * transport running, changing a parameter through the API writes a lane. It
 * only works in real time, hence the sleeps.
 *
 * Uses: e2e-test-set — t1 "Bass" with the Instrument Rack at d0; t10 is armed.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- live-set/ppal-read-arrangement-automation
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { callTool } from "../clip/helpers/arrangement-clip-query-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

const RACK = "t1/d0";
const CHAIN_VOLUME = "live_set tracks 1 devices 0 chains 0 mixer_device volume";
const UNKNOWN =
  "arrangement automation unknown while the track plays from Session";

interface ReadLiveSetResult {
  tempo: number;
  automation?: string[];
}

interface ReadRackResult {
  chains: { automation?: string[]; detail?: string }[];
  detail?: string;
}

/**
 * Run operations on a Live object through ppal-live-api.
 * @param path - Live path of the object
 * @param operations - Operations to run, in order
 */
async function liveApi(path: string, operations: unknown[]): Promise<void> {
  await callTool(ctx.client!, "ppal-live-api", { path, operations });
}

/**
 * Set a property on a Live object.
 * @param path - Live path of the object
 * @param property - Property name
 * @param value - New value
 */
async function setProperty(
  path: string,
  property: string,
  value: number,
): Promise<void> {
  await liveApi(path, [{ type: "set-property", property, value }]);
}

/**
 * Read the Live Set's top level.
 * @returns The Live Set entry
 */
async function readLiveSet(): Promise<ReadLiveSetResult> {
  return parseToolResult<ReadLiveSetResult>(
    await callTool(ctx.client!, "ppal-read-live-set", { include: [] }),
  );
}

/**
 * Read the rack with its chains.
 * @returns The rack entry
 */
async function readRack(): Promise<ReadRackResult> {
  return parseToolResult<ReadRackResult>(
    await callTool(ctx.client!, "ppal-read-device", {
      path: RACK,
      include: ["chains"],
    }),
  );
}

describe("arrangement automation on tempo and rack chains", () => {
  beforeAll(async () => {
    await setConfig({ liveApiEnabled: true });

    // Nothing else may record: only the parameters changed below get a lane.
    await setProperty("live_set tracks 10", "arm", 0);

    await setProperty("live_set", "record_mode", 1);
    await liveApi("live_set", [{ type: "call", method: "start_playing" }]);
    await sleep(1000);
    await setProperty("live_set", "tempo", 130);
    await setProperty(CHAIN_VOLUME, "value", 0.6);
    await sleep(1000);
    await setProperty("live_set", "tempo", 140);
    await setProperty(CHAIN_VOLUME, "value", 0.7);
    await sleep(500);
    await setProperty("live_set", "record_mode", 0);
    await liveApi("live_set", [{ type: "call", method: "stop_playing" }]);
    await sleep(500);
  });

  // The config resets before each test, which hides ppal-live-api again.
  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
  });

  it("names the tempo on the Live Set", async () => {
    expect((await readLiveSet()).automation).toStrictEqual(["tempo"]);
  });

  it("names the automated mixer field of a rack chain", async () => {
    const rack = await readRack();

    expect(rack.chains[0]?.automation).toStrictEqual(["gainDb"]);
    expect(rack.chains[1]?.automation).toBeUndefined();
    expect(rack.detail).toBeUndefined();
  });

  it("still names the tempo while every track is stopped in Session", async () => {
    await liveApi("live_set tracks 1", [
      { type: "call", method: "stop_all_clips" },
    ]);
    await sleep(250);

    expect((await readLiveSet()).automation).toStrictEqual(["tempo"]);
  });

  it("says once on the rack that a chain's automation is unknown from Session", async () => {
    await liveApi("live_set tracks 1", [
      { type: "call", method: "stop_all_clips" },
    ]);
    await sleep(250);

    const rack = await readRack();

    for (const chain of rack.chains) {
      expect(chain.automation).toBeUndefined();
      expect(chain.detail).toBeUndefined();
    }

    expect(rack.detail).toBe(UNKNOWN);
  });
});
