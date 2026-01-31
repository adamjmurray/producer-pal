/**
 * E2E tests for ppal-read-device tool
 * Tests reading device information by ID and path with various include options.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  parseToolResult,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

describe("ppal-read-device", () => {
  it("reads devices by various methods with different include params", async () => {
    // Create a Compressor on track 0 to have a known device
    const deviceId = await createTestDevice(ctx.client!, "Compressor", "t0");

    // Test 1: Read device by deviceId
    const byIdResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { deviceId },
    });
    const byId = parseToolResult<ReadDeviceResult>(byIdResult);

    expect(String(byId.id)).toBe(String(deviceId));
    expect(byId.type).toContain("Compressor");

    // Test 2: Read device by path
    const byPathResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: "t0/d0" },
    });
    const byPath = parseToolResult<ReadDeviceResult>(byPathResult);

    expect(byPath.id).toBeDefined();

    // Test 3: Read with include: ["params"] - parameter names only
    const paramsResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { deviceId, include: ["params"] },
    });
    const withParams = parseToolResult<ReadDeviceResult>(paramsResult);

    expect(withParams.parameters).toBeDefined();
    expect(Array.isArray(withParams.parameters)).toBe(true);
    expect(withParams.parameters!.length).toBeGreaterThan(0);
    expect(withParams.parameters![0]!.id).toBeDefined();
    expect(withParams.parameters![0]!.name).toBeDefined();

    // Test 4: Read with include: ["param-values"] - full parameter details
    const paramValuesResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { deviceId, include: ["param-values"] },
    });
    const withParamValues =
      parseToolResult<ReadDeviceResult>(paramValuesResult);

    expect(withParamValues.parameters).toBeDefined();
    expect(withParamValues.parameters!.length).toBeGreaterThan(0);
    // param-values includes value property
    const paramWithValue = withParamValues.parameters!.find(
      (p) => p.value !== undefined,
    );

    expect(paramWithValue).toBeDefined();

    // Test 5: Read with include: ["*"] - all data
    const allResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { deviceId, include: ["*"] },
    });
    const withAll = parseToolResult<ReadDeviceResult>(allResult);

    expect(String(withAll.id)).toBe(String(deviceId));
    expect(withAll.parameters).toBeDefined();

    // Test 6: Read with paramSearch filter
    const searchResult = await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { deviceId, include: ["params"], paramSearch: "threshold" },
    });
    const searched = parseToolResult<ReadDeviceResult>(searchResult);

    expect(searched.parameters).toBeDefined();

    // Should only include parameters matching "threshold"
    // All returned params should contain "threshold" (case-insensitive)
    const allMatchThreshold = searched.parameters!.every((p) =>
      p.name.toLowerCase().includes("threshold"),
    );

    expect(allMatchThreshold).toBe(true);

    // Note: Unlike ppal-read-track which returns {id: null} for non-existent items,
    // ppal-read-device throws an error for non-existent device IDs.
    // This behavioral difference could be worth investigating for consistency.
  });
});

interface ReadDeviceResult {
  id: string | null;
  type?: string;
  name?: string;
  collapsed?: boolean;
  parameters?: Array<{
    id: string;
    name: string;
    value?: number | string;
    min?: number;
    max?: number;
  }>;
  chains?: Array<{
    id: string;
    name: string;
  }>;
}
