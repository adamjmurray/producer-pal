// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { remoteScriptRequest } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { realOfflineDeps } from "../offline-deps.ts";

vi.mock(
  import("#src/mcp-server/rpc/remote-script/remote-script-client.ts"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    remoteScriptRequest: vi.fn(),
  }),
);

describe("realOfflineDeps.request", () => {
  it("asks as the portal, so an out-of-date reason never offers the chat UI", async () => {
    vi.mocked(remoteScriptRequest).mockResolvedValue({ available: false });

    await realOfflineDeps.request({ method: "POST", route: "/load" });

    expect(remoteScriptRequest).toHaveBeenCalledWith({
      method: "POST",
      route: "/load",
      asker: "portal",
    });
  });
});
