// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import type * as SdkClient from "@modelcontextprotocol/sdk/client/index.js";
import type * as SdkHttp from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type * as CreateMcpServer from "#src/mcp-server/create-mcp-server.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = {
  connect: vi.fn(),
  close: vi.fn(),
  listTools: vi.fn(),
};

// Partial module mocks, cast rather than suppressed: only the one export each
// module contributes to this file is stubbed.
vi.mock(
  import("@modelcontextprotocol/sdk/client/index.js"),
  () =>
    ({
      Client: vi.fn(function () {
        return mockClient;
      }),
    }) as unknown as typeof SdkClient,
);

vi.mock(
  import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
  () =>
    ({
      StreamableHTTPClientTransport: vi.fn(function () {
        return {};
      }),
    }) as unknown as typeof SdkHttp,
);

vi.mock(
  import("#src/mcp-server/create-mcp-server.ts"),
  () =>
    ({
      createMcpServer: vi.fn(
        (_callLiveApi: unknown, opts?: { tools?: string[] }) => {
          const registered = {
            "ppal-connect": { description: "Connect" },
            "ppal-read-clip": { description: "Read clip" },
            "ppal-create-clip": { description: "Create clip" },
          };
          const whitelist = opts?.tools;

          return {
            _registeredTools:
              whitelist == null
                ? registered
                : Object.fromEntries(
                    Object.entries(registered).filter(([name]) =>
                      whitelist.includes(name),
                    ),
                  ),
          };
        },
      ),
    }) as unknown as typeof CreateMcpServer,
);

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { DISABLED_TOOLS_HEADER } from "#src/shared/config.ts";
import { formatToolListing } from "../tool-listing.ts";

const MCP_URL = "http://localhost:3350/mcp";

describe("formatToolListing", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.close.mockResolvedValue(undefined);
    stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("always shows the group aliases, which are the portal's own vocabulary", async () => {
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.listTools.mockResolvedValue({ tools: [] });

    const listing = await formatToolListing(MCP_URL, {});

    expect(listing).toContain("read-only");
    expect(listing).toContain("--disable-tools");
    expect(listing).toContain("ppal-create-clip"); // in the clip group row
  });

  it("lists what the device reports when it is reachable", async () => {
    mockClient.connect.mockResolvedValue(undefined);
    // A name this portal build has never heard of: only the device can report it.
    mockClient.listTools.mockResolvedValue({
      tools: [{ name: "ppal-connect" }, { name: "ppal-brand-new" }],
    });

    const listing = await formatToolListing(MCP_URL, {});

    expect(listing).toContain("Available now (2):");
    expect(listing).toContain("ppal-brand-new");
    expect(listing).not.toContain("Could not reach the device");
  });

  it("applies the withheld toolset to the device query", async () => {
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.listTools.mockResolvedValue({ tools: [] });

    await formatToolListing(MCP_URL, { disabledTools: ["ppal-create-clip"] });

    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      new URL(MCP_URL),
      {
        requestInit: {
          headers: { [DISABLED_TOOLS_HEADER]: "ppal-create-clip" },
        },
      },
    );
  });

  it("falls back to the portal's own catalog when the device is unreachable", async () => {
    mockClient.connect.mockRejectedValue(new Error("ECONNREFUSED"));

    const listing = await formatToolListing(MCP_URL, {});

    expect(listing).toContain("Could not reach the device");
    expect(listing).toContain("A running device may offer more");
    expect(listing).toContain("ppal-read-clip");
  });

  it("narrows the fallback list too, so both halves agree", async () => {
    mockClient.connect.mockRejectedValue(new Error("ECONNREFUSED"));

    const listing = await formatToolListing(MCP_URL, {
      disabledTools: ["ppal-create-clip"],
    });
    const toolLines = listing.slice(listing.indexOf("Could not reach"));

    expect(toolLines).toContain("ppal-read-clip");
    expect(toolLines).not.toContain("ppal-create-clip");
  });

  it("reports the failure on stderr, keeping stdout pure data", async () => {
    mockClient.connect.mockRejectedValue(new Error("ECONNREFUSED"));

    await formatToolListing(MCP_URL, {});

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("device unreachable"),
    );
  });

  it("closes the client even when the listing fails", async () => {
    mockClient.connect.mockRejectedValue(new Error("ECONNREFUSED"));

    await formatToolListing(MCP_URL, {});

    expect(mockClient.close).toHaveBeenCalled();
  });

  it("survives a close that itself rejects", async () => {
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.listTools.mockResolvedValue({
      tools: [{ name: "ppal-connect" }],
    });
    mockClient.close.mockRejectedValue(new Error("already gone"));

    await expect(formatToolListing(MCP_URL, {})).resolves.toContain(
      "Available now (1):",
    );
  });
});
