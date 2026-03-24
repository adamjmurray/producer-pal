// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  detectCorsBlock,
  getMcpUrl,
  isViteDevServer,
} from "#webui/utils/mcp-url";

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

describe("isViteDevServer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when on port 5173", () => {
    vi.stubGlobal("window", { location: { port: "5173" } });
    expect(isViteDevServer()).toBe(true);
  });

  it("returns false when on a different port", () => {
    vi.stubGlobal("window", { location: { port: "3350" } });
    expect(isViteDevServer()).toBe(false);
  });

  it("returns false when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(isViteDevServer()).toBe(false);
  });
});

describe("detectCorsBlock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when server is reachable (no-cors succeeds)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response()));
    expect(await detectCorsBlock("http://localhost:3350/mcp")).toBe(true);
  });

  it("returns false when server is unreachable (no-cors throws)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    expect(await detectCorsBlock("http://localhost:3350/mcp")).toBe(false);
  });

  it("passes mode: no-cors to fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response());

    vi.stubGlobal("fetch", mockFetch);
    await detectCorsBlock("http://localhost:3350/mcp");
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3350/mcp", {
      mode: "no-cors",
    });
  });
});
