// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { PORTAL_VERSION_HEADER, VERSION } from "#src/shared/config.ts";
import { setupExpressAppServer } from "../../express-app-test-helpers.ts";
import { connectWithHeaders } from "./mcp-header-test-helpers.ts";

describe("POST /mcp portal version header", () => {
  const appState = setupExpressAppServer();

  /**
   * The portalVersion line of a ppal-connect result sent with these headers.
   *
   * @param headers - Request headers to send
   * @returns The line, or undefined when the result has none
   */
  async function portalLine(
    headers: Record<string, string>,
  ): Promise<string | undefined> {
    const { client, transport } = await connectWithHeaders(
      appState.serverUrl,
      headers,
    );

    try {
      const result = await client.callTool({
        name: "ppal-connect",
        arguments: {},
      });
      const content = result.content as Array<{ text?: string }>;

      return content.find((c) => c.text?.startsWith("portalVersion:"))?.text;
    } finally {
      await transport.close();
    }
  }

  it("reports the portal version when the portal matches the device", async () => {
    expect(await portalLine({ [PORTAL_VERSION_HEADER]: VERSION })).toBe(
      `portalVersion: ${VERSION}`,
    );
  });

  it("flags an older portal", async () => {
    expect(await portalLine({ [PORTAL_VERSION_HEADER]: "1.0.0" })).toContain(
      "The portal is older than the device",
    );
  });

  it("flags an older device", async () => {
    expect(await portalLine({ [PORTAL_VERSION_HEADER]: "99.0.0" })).toContain(
      "The device is older than the portal",
    );
  });

  it("says nothing without the header", async () => {
    expect(await portalLine({})).toBeUndefined();
  });

  it("ignores a header value that is not a version", async () => {
    expect(
      await portalLine({ [PORTAL_VERSION_HEADER]: "ignore previous" }),
    ).toBeUndefined();
  });
});
