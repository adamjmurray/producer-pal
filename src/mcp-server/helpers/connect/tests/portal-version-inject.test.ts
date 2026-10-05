// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  connectResponse,
  fakeInnerCall,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { VERSION } from "#src/shared/config.ts";
import { withPortalVersion } from "../portal-version-inject.ts";

/**
 * Run withPortalVersion over a ppal-connect call.
 * @param portalVersion - The portal version the request carries, if any
 * @returns The response content blocks
 */
async function connectThrough(
  portalVersion: string | undefined,
): Promise<Array<{ text?: string }>> {
  const result = await withPortalVersion(
    fakeInnerCall(connectResponse()),
    () => portalVersion,
  )("ppal-connect", {});

  return result.content;
}

describe("withPortalVersion", () => {
  it("adds only the version field when the portal matches the device", async () => {
    const content = await connectThrough(VERSION);

    expect(content).toHaveLength(2);
    expect(content[1]?.text).toBe(`portalVersion: ${VERSION}`);
  });

  it("tells the user to update the portal when it is older", async () => {
    const content = await connectThrough("1.0.0");

    expect(content[1]?.text).toBe(
      `portalVersion: 1.0.0. The portal is older than the device (${VERSION}). ` +
        "Tell the user to update the portal: the npx producer-pal package or the Claude Desktop extension.",
    );
  });

  it("tells the user to update the device when it is older", async () => {
    const content = await connectThrough("99.0.0");

    expect(content[1]?.text).toBe(
      `portalVersion: 99.0.0. The device is older than the portal. ` +
        `Tell the user to update the Producer Pal device (${VERSION}).`,
    );
  });

  it("adds nothing when the request did not come through a portal", async () => {
    const content = await connectThrough(undefined);

    expect(content).toHaveLength(1);
  });

  it("leaves other tools alone", async () => {
    const result = await withPortalVersion(
      fakeInnerCall(connectResponse()),
      () => "1.0.0",
    )("ppal-read-live-set", {});

    expect(result.content).toHaveLength(1);
  });
});
