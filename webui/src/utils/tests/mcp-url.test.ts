// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  detectCorsBlock,
  getMcpUrl,
  getSkillsPreviewUrl,
  getSubagentBriefingUrl,
  getUpdateUrl,
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

describe("getSkillsPreviewUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives the endpoint from the MCP URL with query params", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", port: "3350", protocol: "http:" },
    });
    expect(getSkillsPreviewUrl("stark", true)).toBe(
      "http://localhost:3350/skills-preview?notation=stark&smallModel=true",
    );
  });

  it("encodes standard (non-small-model) selections", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", port: "3350", protocol: "http:" },
    });
    expect(getSkillsPreviewUrl("barbeat", false)).toBe(
      "http://localhost:3350/skills-preview?notation=barbeat&smallModel=false",
    );
  });
});

describe("getUpdateUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives the endpoint from the MCP URL", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", port: "3350", protocol: "http:" },
    });
    expect(getUpdateUrl()).toBe("http://localhost:3350/update");
  });

  // The reason this endpoint has a builder at all: Vite serves the dev webui on
  // 5173 with no proxy configured, so a bare same-origin "/update" 404s there and
  // the update badge silently never appears.
  it("reaches the MCP server from the Vite dev server", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", port: "5173", protocol: "http:" },
    });
    expect(getUpdateUrl()).toBe("http://localhost:3350/update");
  });
});

describe("getSubagentBriefingUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives the endpoint from the MCP URL, with no query params", () => {
    // The worker's profile rides on request headers, not the URL.
    vi.stubGlobal("window", {
      location: { hostname: "localhost", port: "3350", protocol: "http:" },
    });
    expect(getSubagentBriefingUrl()).toBe(
      "http://localhost:3350/subagent-briefing",
    );
  });

  // The briefing lives beside the MCP endpoint, so a config that points its MCP
  // requests at another server must fetch its briefing from that server too —
  // otherwise a worker is briefed by one Producer Pal and calls tools on another.
  it("follows a config's mcpUrl override instead of the page origin", () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost", port: "3350", protocol: "http:" },
    });
    expect(getSubagentBriefingUrl("http://otherhost:9000/mcp")).toBe(
      "http://otherhost:9000/subagent-briefing",
    );
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
