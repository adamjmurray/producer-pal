/**
 * E2E tests for ppal-create-device tool
 * Creates devices in the Live Set - these modifications persist within the session.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  extractToolResultText,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-create-device", () => {
  it("creates devices of various types with different options", async () => {
    // Test 1: List available devices (no deviceName)
    const listResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: {},
    });
    const list = parseToolResult<ListDevicesResult>(listResult);

    expect(list.instruments).toBeDefined();
    expect(Array.isArray(list.instruments)).toBe(true);
    expect(list.midiEffects).toBeDefined();
    expect(Array.isArray(list.midiEffects)).toBe(true);
    expect(list.audioEffects).toBeDefined();
    expect(Array.isArray(list.audioEffects)).toBe(true);
    // Verify some known devices exist
    expect(list.audioEffects).toContain("Compressor");
    expect(list.midiEffects).toContain("Arpeggiator");

    // Test 2: Create audio effect on track
    const compResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "Compressor", path: "t0" },
    });
    const comp = parseToolResult<CreateDeviceResult>(compResult);

    expect(comp.deviceId).toBeDefined();
    expect(typeof comp.deviceIndex).toBe("number");

    // Test 3: Verify created device via read
    await sleep(100);
    const verifyResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { deviceId: comp.deviceId },
    });
    const verified = parseToolResult<ReadDeviceResult>(verifyResult);

    expect(String(verified.id)).toBe(String(comp.deviceId));
    expect(verified.type).toContain("Compressor");

    // Test 4: Create MIDI effect
    const arpResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "Arpeggiator", path: "t0" },
    });
    const arp = parseToolResult<CreateDeviceResult>(arpResult);

    expect(arp.deviceId).toBeDefined();

    await sleep(100);
    const verifyArp = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { deviceId: arp.deviceId },
    });
    const arpDevice = parseToolResult<ReadDeviceResult>(verifyArp);

    expect(arpDevice.type).toContain("Arpeggiator");

    // Test 6: Create device on master track
    const masterResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "Limiter", path: "mt" },
    });
    const master = parseToolResult<CreateDeviceResult>(masterResult);

    expect(master.deviceId).toBeDefined();

    // Test 5: Error for invalid device name
    // Note: Tool errors are returned as text, not JSON
    const invalidResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "InvalidDeviceName123", path: "t0" },
    });
    const invalidText = extractToolResultText(invalidResult);

    expect(invalidText).toContain("InvalidDeviceName123");
    expect(invalidText.toLowerCase()).toContain("invalid");
  });
});

interface ListDevicesResult {
  instruments: string[];
  midiEffects: string[];
  audioEffects: string[];
}

interface CreateDeviceResult {
  deviceId: string | number;
  deviceIndex: number;
}

interface ReadDeviceResult {
  id: string;
  type: string;
  name?: string;
}
