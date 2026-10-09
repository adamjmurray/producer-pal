// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests that writing a parameter with an arrangement lane says so on the
 * target's entry. Live then ignores the whole lane until the user presses
 * Re-Enable Automation (`automation_state` 1 to 2), so the write is no longer
 * silent. A second write finds it already overridden and says nothing.
 *
 * The lanes come from arrangement recording (see
 * ppal-read-arrangement-automation): with record mode on and the transport
 * running, changing a parameter through the API writes a lane. It only works in
 * real time, hence the sleeps.
 *
 * Uses: e2e-test-set — t1 "Bass" with the Instrument Rack at d0; t10 is armed.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- live-set/ppal-write-overrides-arrangement-automation
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { callTool } from "../clip/helpers/arrangement-clip-query-test-helpers.ts";
import {
  recordArrangementLanes,
  setProperty,
} from "./helpers/arrangement-recording-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

const TRACK = "live_set tracks 1";
const RACK_PATH = `${TRACK} devices 0`;
const CHAIN = `${RACK_PATH} chains 0`;
const OVERRIDDEN = "arrangement automation overridden";
// Parameter 0 is Device On, so this is the rack's first macro: the only one
// the rack shows.
const MACRO_PATH = `${RACK_PATH} parameters 1`;

interface Param {
  id: string;
  name: string;
  automation?: string;
  detail?: string;
}

interface Entry {
  detail?: string;
  /** A write's per-param entries */
  params?: Param[];
  /** A read's params */
  parameters?: Param[];
}

/**
 * Call a write tool and parse its lone entry.
 * @param tool - Tool name
 * @param args - Tool arguments
 * @returns The entry
 */
async function write(
  tool: string,
  args: Record<string, unknown>,
): Promise<Entry> {
  const entry = parseToolResult<Entry>(await callTool(ctx.client!, tool, args));

  // automation_state updates on Live's next tick (~100 ms): a write sooner
  // than that still sees the lane as not overridden.
  await sleep(250);

  return entry;
}

/**
 * The id of the one rack param that has a lane.
 * @returns The param's id
 */
async function automatedParamId(): Promise<string> {
  const rack = await write("ppal-read-device", {
    path: "t1/d0",
    include: ["param-values"],
  });
  const automated = rack.parameters?.find((param) => param.automation != null);

  expect(automated).toBeDefined();

  return automated!.id;
}

/**
 * Change every parameter under test, so each gets a lane while recording.
 * @param high - False for the first values, true for the second
 */
async function changeParameters(high: boolean): Promise<void> {
  await setProperty(ctx.client!, "live_set", "tempo", high ? 140 : 130);
  await setProperty(
    ctx.client!,
    `${TRACK} mixer_device volume`,
    "value",
    high ? 0.7 : 0.6,
  );
  await setProperty(
    ctx.client!,
    `${TRACK} mixer_device track_activator`,
    "value",
    Number(high),
  );
  await setProperty(
    ctx.client!,
    `${CHAIN} mixer_device volume`,
    "value",
    high ? 0.7 : 0.6,
  );
  await setProperty(
    ctx.client!,
    `${CHAIN} mixer_device chain_activator`,
    "value",
    Number(high),
  );
  await setProperty(ctx.client!, MACRO_PATH, "value", high ? 80 : 40);
}

describe("writing a parameter that has an arrangement lane", () => {
  beforeAll(async () => {
    await setConfig({ liveApiEnabled: true });

    await recordArrangementLanes(ctx.client!, changeParameters);
  });

  // The config resets before each test, which hides ppal-live-api again.
  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
  });

  it("says so for tempo, once", async () => {
    const first = await write("ppal-update-live-set", { tempo: 120 });

    expect(first.detail).toBe(
      `tempo: ${OVERRIDDEN} — Live ignores it until Re-Enable Automation`,
    );

    expect(
      (await write("ppal-update-live-set", { tempo: 125 })).detail,
    ).toBeUndefined();
  });

  it("says so for a track's gain, once", async () => {
    const first = await write("ppal-update-track", { path: "t1", gainDb: -3 });

    expect(first.detail).toContain(`gainDb: ${OVERRIDDEN}`);

    const second = await write("ppal-update-track", { path: "t1", gainDb: -4 });

    expect(second.detail ?? "").not.toContain(OVERRIDDEN);
  });

  it("says so on a device param's own entry, once", async () => {
    const params = [{ id: await automatedParamId(), value: "64" }];
    const first = await write("ppal-update-device", { path: "t1/d0", params });

    expect(first.params?.[0]?.detail).toContain(OVERRIDDEN);

    const second = await write("ppal-update-device", {
      path: "t1/d0",
      params: [{ ...params[0]!, value: "32" }],
    });

    expect(second.params?.[0]?.detail ?? "").not.toContain(OVERRIDDEN);
  });

  it("says so for a chain's gain, once", async () => {
    const first = await write("ppal-update-device", {
      path: "t1/d0/c0",
      // Not -6: the lane reads -6 dB at the playhead, and writing the value
      // a param already has overrides nothing.
      gainDb: -8,
    });

    expect(first.detail).toContain(`gainDb: ${OVERRIDDEN}`);

    const second = await write("ppal-update-device", {
      path: "t1/d0/c0",
      gainDb: -9,
    });

    expect(second.detail ?? "").not.toContain(OVERRIDDEN);
  });

  // Mute drives the activator parameter, which can have a lane of its own.
  describe("mute", () => {
    it("says so for a track, once", async () => {
      const first = await write("ppal-update-track", {
        path: "t1",
        mute: true,
      });

      expect(first.detail).toContain(`mute: ${OVERRIDDEN}`);

      const second = await write("ppal-update-track", {
        path: "t1",
        mute: false,
      });

      expect(second.detail ?? "").not.toContain(OVERRIDDEN);
    });

    it("says so for a chain, once", async () => {
      const first = await write("ppal-update-device", {
        path: "t1/d0/c0",
        mute: true,
      });

      expect(first.detail).toContain(`mute: ${OVERRIDDEN}`);

      const second = await write("ppal-update-device", {
        path: "t1/d0/c0",
        mute: false,
      });

      expect(second.detail ?? "").not.toContain(OVERRIDDEN);
    });
  });
});
