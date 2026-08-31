// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { DISABLED_TOOLS_HEADER, LIVE_API_HEADER } from "#src/shared/config.ts";
import { LIVE_API_TOOL_ID } from "#src/shared/tool-groups.ts";
import { TOOL_NAMES } from "../../../create-mcp-server.ts";
import { setupExpressAppServer } from "../../express-app-test-helpers.ts";
import { listToolNames } from "./mcp-header-test-helpers.ts";

// The harness leaves config.liveApiEnabled at its default (off), so these cover
// a client turning the tool on for itself on an otherwise-untouched device.
describe("POST /mcp per-request Direct Live API header", () => {
  const appState = setupExpressAppServer();

  it("registers ppal-live-api for the request that asks for it", async () => {
    const names = await listToolNames(appState.serverUrl, {
      [LIVE_API_HEADER]: "true",
    });

    expect(names).toContain(LIVE_API_TOOL_ID);
  });

  it("leaves it out for a concurrent client that did not ask", async () => {
    // The reason it is a header and not a POST /config: an agent under
    // evaluation on the same device must not inherit another client's grant.
    const [asked, other] = await Promise.all([
      listToolNames(appState.serverUrl, { [LIVE_API_HEADER]: "true" }),
      listToolNames(appState.serverUrl, {}),
    ]);

    expect(asked).toContain(LIVE_API_TOOL_ID);
    expect(other).not.toContain(LIVE_API_TOOL_ID);
  });

  it("falls back to the device global when the header is absent", async () => {
    const names = await listToolNames(appState.serverUrl, {});

    expect(names).not.toContain(LIVE_API_TOOL_ID);
  });

  it("falls back to the device global for an unrecognized value", async () => {
    const names = await listToolNames(appState.serverUrl, {
      [LIVE_API_HEADER]: "yes",
    });

    expect(names).not.toContain(LIVE_API_TOOL_ID);
  });

  it("still honors the disabled-tools header, which wins", async () => {
    const names = await listToolNames(appState.serverUrl, {
      [LIVE_API_HEADER]: "true",
      [DISABLED_TOOLS_HEADER]: LIVE_API_TOOL_ID,
    });

    expect(names).not.toContain(LIVE_API_TOOL_ID);
  });
});

describe("POST /mcp Direct Live API header against an enabled device", () => {
  const appState = setupExpressAppServer({ enableLiveApi: true });

  it("withholds the tool from the request that opts out", async () => {
    const names = await listToolNames(appState.serverUrl, {
      [LIVE_API_HEADER]: "false",
    });

    expect(names).not.toContain(LIVE_API_TOOL_ID);
  });

  it("leaves it in place for a request that sends no header", async () => {
    const names = await listToolNames(appState.serverUrl, {});

    expect(names).toContain(LIVE_API_TOOL_ID);
  });

  it("grants the tool to an explicit opt-in even when a curated whitelist omits it", async () => {
    // validateTools only checks tool names, not agreement with the flag, so a
    // whitelist set after the flag turns on can still drop ppal-live-api by
    // name. The per-request header must still win.
    await appState.postConfig({ tools: TOOL_NAMES });

    const names = await listToolNames(appState.serverUrl, {
      [LIVE_API_HEADER]: "true",
    });

    expect(names).toContain(LIVE_API_TOOL_ID);
  });
});
