import { describe, it, expect, vi, afterEach } from "vitest";
import { getMcpUrl } from "./mcp-url";

describe("getMcpUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns default URL when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(getMcpUrl()).toBe("http://localhost:3350/mcp");
  });

  it("returns default URL when on Vite dev server (port 5173)", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", port: "5173", protocol: "http:" },
    });
    expect(getMcpUrl()).toBe("http://localhost:3350/mcp");
  });

  it("returns origin-based URL in production with custom port", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", port: "3351", protocol: "http:" },
    });
    expect(getMcpUrl()).toBe("http://localhost:3351/mcp");
  });

  it("returns origin-based URL in production without port", () => {
    vi.stubGlobal("window", {
      location: { hostname: "example.com", port: "", protocol: "https:" },
    });
    expect(getMcpUrl()).toBe("https://example.com/mcp");
  });

  it("returns origin-based URL with default port 3350", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", port: "3350", protocol: "http:" },
    });
    expect(getMcpUrl()).toBe("http://localhost:3350/mcp");
  });
});
