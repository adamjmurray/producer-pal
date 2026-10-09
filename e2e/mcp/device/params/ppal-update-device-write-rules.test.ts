// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the rules every write tool answers the same way,
 * as ppal-update-device keeps them: a target named twice, an entry that can't
 * be parsed, and an action named twice.
 * Uses: e2e-test-set
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-update-device-write-rules
 */
import { describe, expect, it } from "vitest";
import {
  callToolAndSettle,
  createMidiTrack,
  createTestDevice,
  createTestDeviceAt,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

interface DeviceEntry {
  id: string;
  path?: string;
  ok?: false;
  detail?: string;
  actions?: Array<{ action: string; ok?: false; detail?: string }>;
}

/**
 * Call a tool and let Live settle.
 * @param name - The tool
 * @param args - Its args
 * @returns The raw result
 */
async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return callToolAndSettle(ctx.client!, name, args);
}

/**
 * A Compressor on a fresh MIDI track.
 * @returns Its id and path
 */
async function createCompressor(): Promise<{ id: string; path: string }> {
  const track = await createMidiTrack(ctx.client!);
  const path = await createTestDeviceAt(ctx.client!, "Compressor", `t${track}`);
  const { id } = parseToolResult<{ id: string }>(
    await call("ppal-read-device", { path }),
  );

  return { id, path };
}

/**
 * Read a device's name back from Live.
 * @param path - The device's path
 * @returns Its name
 */
async function readName(path: string): Promise<string | undefined> {
  return parseToolResult<{ name?: string }>(
    await call("ppal-read-device", { path }),
  ).name;
}

describe("ppal-update-device: write rules", () => {
  it("writes a device named by id and by path once, at the last mention", async () => {
    const { id, path } = await createCompressor();
    const entries = parseToolResult<DeviceEntry[]>(
      await call("ppal-update-device", { id, path, name: "First,Second" }),
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]).toStrictEqual({
      id,
      detail: `named again as "${path}" later in this call`,
    });
    expect(entries[1]).toStrictEqual({ id, path });
    expect(await readName(path)).toBe("Second");
  });

  it("refuses a list with an unparseable path, and changes nothing", async () => {
    const { path } = await createCompressor();
    const before = await readName(path);
    const result = await call("ppal-update-device", {
      path: `${path},not-a-path`,
      name: "Changed,Other",
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain('invalid path "not-a-path"');
    expect(await readName(path)).toBe(before);
  });

  it("runs an action named twice on one device once", async () => {
    const track = await createMidiTrack(ctx.client!);
    const id = await createTestDevice(ctx.client!, "Wavetable", `t${track}`);
    const route = "setModulation('Flt 1 Freq','LFO 1',0.5)";
    const updated = parseToolResult<DeviceEntry>(
      await call("ppal-update-device", { id, actions: [route, route] }),
    );

    expect(updated.actions).toStrictEqual([
      { action: route, detail: "named again later in this call" },
      { action: route },
    ]);
  });

  it("fails the earlier mentions of an action whose last mention failed", async () => {
    const track = await createMidiTrack(ctx.client!);
    const id = await createTestDevice(ctx.client!, "Wavetable", `t${track}`);
    const bad = "setModulation('Flt 1 Freq','LFO 1')";
    const good = "addModulationTarget('Flt 1 Freq')";
    const updated = parseToolResult<DeviceEntry>(
      await call("ppal-update-device", { id, actions: [bad, good, bad] }),
    );

    expect(updated.actions).toStrictEqual([
      {
        action: bad,
        ok: false,
        detail: `not written: "${bad}" was meant to replace it, but failed`,
      },
      { action: good },
      {
        action: bad,
        ok: false,
        detail: "requires 3 arguments (target, source, amount)",
      },
    ]);
  });
});
