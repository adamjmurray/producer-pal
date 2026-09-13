// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for `inst`, `mfx<n>` and `afx<n>` path segments.
 * Uses: e2e-test-set, track t2 (MIDI Effect Rack → Analog → EQ Eight →
 * Compressor). See e2e/live-sets/e2e-test-set-spec.md.
 *
 * Run with: npm run e2e:mcp -- ppal-device-by-type-paths
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

interface DeviceEntry {
  path?: string;
  type?: string;
  name?: string;
  ok?: false;
  reason?: string;
}

async function readDevices(path: string): Promise<unknown> {
  return ctx.client!.callTool({
    name: "ppal-read-device",
    arguments: { path },
  });
}

describe("device paths by type", () => {
  it("resolves inst, mfx and afx within their own type, and reports d<n>", async () => {
    const devices = parseToolResult<DeviceEntry[]>(
      await readDevices("t2/inst,t2/mfx0,t2/afx0,t2/afx1,t2/d0/c0/mfx0"),
    );

    // A result never echoes the type spelling: the path is the position.
    expect(devices.map((device) => device.path)).toStrictEqual([
      "t2/d1",
      "t2/d0",
      "t2/d2",
      "t2/d3",
      "t2/d0/c0/d0",
    ]);
    expect(devices[0]!.type).toContain("Analog");
    // A rack counts as one device of its own type.
    expect(devices[1]!.type).toBe("midi-effect-rack");
    expect(devices[2]!.type).toContain("EQ Eight");
    expect(devices[3]!.type).toContain("Compressor");
    expect(devices[4]!.type).toContain("Arpeggiator");
  });

  it("reads a rack chain's instrument and audio effect", async () => {
    const devices = parseToolResult<DeviceEntry[]>(
      await readDevices("t1/d0/c0/inst,t1/d0/c0/afx0,t0/d0/pC1/inst"),
    );

    expect(devices[0]!.type).toContain("Operator");
    expect(devices[1]!.type).toContain("Saturator");
    expect(devices[2]!.path).toBe("t0/d0/pC1/d0");
  });

  it("warns and skips when nothing of that type is there", async () => {
    const { data, warnings } = parseToolResultWithWarnings<DeviceEntry[]>(
      await readDevices("t2/d0/c0/inst,t2/afx2,rt0/inst,t2/inst"),
    );

    expect(data.slice(0, 3).map((entry) => entry.ok)).toStrictEqual([
      false,
      false,
      false,
    ]);
    expect(data[3]!.path).toBe("t2/d1");
    expect(warnings.join("\n")).toContain(
      'path "t2/d0/c0/inst" names nothing: t2/d0/c0 has no instrument',
    );
    expect(warnings.join("\n")).toContain(
      'path "t2/afx2" names nothing: t2 has 2 audio effects (afx0-afx1)',
    );
    expect(warnings.join("\n")).toContain(
      'path "rt0/inst" names nothing: return and main tracks hold only audio effects',
    );
  });

  it("updates through a type segment and reports the position", async () => {
    const result = parseToolResult<{ id?: unknown; path?: string }>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { path: "t2/inst", name: "Soft Morning Keys" },
      }),
    );
    const analog = parseToolResult<DeviceEntry & { id?: unknown }>(
      await readDevices("t2/d1"),
    );

    expect(result.path).toBe("t2/d1");
    expect(String(result.id)).toBe(String(analog.id));
    expect(analog.name).toBe("Soft Morning Keys");
  });
});
