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

    // Test 2: Create device at position 0 on empty track (t{N}/d0 fallback to append)
    // First create a new track to ensure it's empty
    const newTrackResult = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "midi" },
    });
    const newTrack = parseToolResult<{ id: string; trackIndex: number }>(
      newTrackResult,
    );
    const emptyTrackPath = `t${newTrack.trackIndex}/d0`;

    await sleep(100);

    // Now test creating device at position 0 on the empty track
    const eqResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "EQ Eight", path: emptyTrackPath },
    });
    const eq = parseToolResult<CreateDeviceResult>(eqResult);

    expect(eq.id).toBeDefined();
    expect(eq.deviceIndex).toBe(0);

    // Test 3: Create audio effect on track (append)
    const compResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "Compressor", path: "t0" },
    });
    const comp = parseToolResult<CreateDeviceResult>(compResult);

    expect(comp.id).toBeDefined();
    expect(typeof comp.deviceIndex).toBe("number");

    // Test 4: Verify created device via read
    await sleep(100);
    const verifyResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { deviceId: comp.id },
    });
    const verified = parseToolResult<ReadDeviceResult>(verifyResult);

    expect(verified.id).toBe(comp.id);
    expect(verified.type).toContain("Compressor");

    // Test 5: Create MIDI effect
    const arpResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "Arpeggiator", path: "t0" },
    });
    const arp = parseToolResult<CreateDeviceResult>(arpResult);

    expect(arp.id).toBeDefined();

    await sleep(100);
    const verifyArp = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { deviceId: arp.id },
    });
    const arpDevice = parseToolResult<ReadDeviceResult>(verifyArp);

    expect(arpDevice.type).toContain("Arpeggiator");

    // Test 6: Create device on master track
    const masterResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "Limiter", path: "mt" },
    });
    const master = parseToolResult<CreateDeviceResult>(masterResult);

    expect(master.id).toBeDefined();

    // Test 7: Error for invalid device name
    // Note: Tool errors are returned as text, not JSON
    const invalidResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "InvalidDeviceName123", path: "t0" },
    });
    const invalidText = extractToolResultText(invalidResult);

    expect(invalidText).toContain("InvalidDeviceName123");
    expect(invalidText.toLowerCase()).toContain("invalid");

    // Test 8: Error when inserting audio effect before instrument on MIDI track
    // Track t1 "Drums" has an instrument (Cyndal Kit) - can't insert audio effect before it
    const audioBeforeInstrumentResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "Compressor", path: "t1/d0" },
    });
    const audioBeforeInstrumentText = extractToolResultText(
      audioBeforeInstrumentResult,
    );

    expect(audioBeforeInstrumentText).toContain("could not insert");
    expect(audioBeforeInstrumentText).toContain("Compressor");
    expect(audioBeforeInstrumentText).toContain("t1/d0");

    // Test 9: MIDI effect CAN be inserted before instrument
    const midiBeforeInstrumentResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "Arpeggiator", path: "t1/d0" },
    });
    const midiBeforeInstrument = parseToolResult<CreateDeviceResult>(
      midiBeforeInstrumentResult,
    );

    expect(midiBeforeInstrument.id).toBeDefined();
    expect(midiBeforeInstrument.deviceIndex).toBe(0);

    // Test 10: Inserting at position 1 on empty track succeeds
    // Live API allows this - the device ends up at index 1 (sparse indices allowed)
    const emptyTrack2Result = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "midi" },
    });
    const emptyTrack2 = parseToolResult<{ id: string; trackIndex: number }>(
      emptyTrack2Result,
    );
    const position1Path = `t${emptyTrack2.trackIndex}/d1`;

    await sleep(100);

    const position1Result = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "Compressor", path: position1Path },
    });
    const position1Device =
      parseToolResult<CreateDeviceResult>(position1Result);

    expect(position1Device.id).toBeDefined();
    expect(position1Device.deviceIndex).toBe(1);

    // Test 11: Create device at position 0 on empty chain inside rack
    // Creates a rack, then inserts device at d0/c0/d0 (position 0 in first chain)
    const emptyTrack3Result = await ctx.client!.callTool({
      name: "ppal-create-track",
      arguments: { type: "audio" },
    });
    const emptyTrack3 = parseToolResult<{ id: string; trackIndex: number }>(
      emptyTrack3Result,
    );

    await sleep(100);

    // Create an Audio Effect Rack (it auto-creates one empty chain)
    const rackResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: {
        deviceName: "Audio Effect Rack",
        path: `t${emptyTrack3.trackIndex}`,
      },
    });
    const rack = parseToolResult<CreateDeviceResult>(rackResult);

    expect(rack.id).toBeDefined();

    await sleep(100);

    // Insert device at position 0 in the empty chain
    const chainDeviceResult = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: {
        deviceName: "Compressor",
        path: `t${emptyTrack3.trackIndex}/d${rack.deviceIndex}/c0/d0`,
      },
    });
    const chainDevice = parseToolResult<CreateDeviceResult>(chainDeviceResult);

    expect(chainDevice.id).toBeDefined();
    expect(chainDevice.deviceIndex).toBe(0);
  });
});

interface ListDevicesResult {
  instruments: string[];
  midiEffects: string[];
  audioEffects: string[];
}

interface CreateDeviceResult {
  id: string;
  deviceIndex: number;
}

interface ReadDeviceResult {
  id: string;
  type: string;
  name?: string;
}
