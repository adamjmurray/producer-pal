import { describe, expect, it, vi } from "vitest";

// Mock the StdioHttpBridge class
const mockBridge = {
  start: vi.fn(() => ({ catch: vi.fn() })),
  stop: vi.fn(),
};

vi.mock(import("./stdio-http-bridge.js"), () => ({
  StdioHttpBridge: vi.fn(() => mockBridge),
}));

// Import after mocking
import { StdioHttpBridge } from "./stdio-http-bridge.js";

describe("producer-pal-portal", () => {
  describe("module execution", () => {
    it("creates StdioHttpBridge instance and calls start", async () => {
      // Trigger one dynamic import to verify basic behavior
      await import("./producer-pal-portal.js");

      expect(StdioHttpBridge).toHaveBeenCalled();
      expect(mockBridge.start).toHaveBeenCalled();

      // Verify it was called with a localhost URL on some port
      const calls = StdioHttpBridge.mock.calls;
      expect(calls[0][0]).toMatch(/^http:\/\/localhost:\d+\/mcp$/);
    });
  });
});
