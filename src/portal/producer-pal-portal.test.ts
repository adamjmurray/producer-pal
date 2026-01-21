import { describe, expect, it, vi, type Mock } from "vitest";

// Mock the StdioHttpBridge class
const mockBridge = {
  start: vi.fn(() => ({ catch: vi.fn() })),
  stop: vi.fn(),
};

// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("./stdio-http-bridge.ts"), () => ({
  StdioHttpBridge: vi.fn(function () {
    return mockBridge;
  }),
}));

// Import after mocking
import { StdioHttpBridge } from "./stdio-http-bridge.ts";

describe("producer-pal-portal", () => {
  describe("module execution", () => {
    it("creates StdioHttpBridge instance and calls start", async () => {
      // Trigger one dynamic import to verify basic behavior
      await import("./producer-pal-portal.ts");

      expect(StdioHttpBridge).toHaveBeenCalled();
      expect(mockBridge.start).toHaveBeenCalled();

      // Verify it was called with a localhost URL on some port
      const calls = (StdioHttpBridge as unknown as Mock).mock.calls;

      expect(calls[0]?.[0]).toMatch(/^http:\/\/localhost:\d+\/mcp$/);
    });
  });
});
