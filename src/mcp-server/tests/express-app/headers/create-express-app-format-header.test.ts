// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { FORMAT_HEADER } from "#src/shared/config.ts";
import { setupExpressAppServer } from "../../express-app-test-helpers.ts";
import { callToolRequestContext } from "./mcp-header-test-helpers.ts";

describe("POST /mcp per-request format header", () => {
  const appState = setupExpressAppServer();

  /**
   * The compactOutput value V8 received for a call sent with this header.
   *
   * @param header - Value for the format header, or undefined to omit it
   * @returns The context's compactOutput, or undefined when none was sent
   */
  async function compactOutput(header?: string): Promise<unknown> {
    const context = await callToolRequestContext(
      appState.serverUrl,
      header == null ? {} : { [FORMAT_HEADER]: header },
      "ppal-read-clip",
    );

    return context.compactOutput;
  }

  it("sends compactOutput: true for format=compact", async () => {
    expect(await compactOutput("compact")).toBe(true);
  });

  it("sends compactOutput: false for format=json", async () => {
    expect(await compactOutput("json")).toBe(false);
  });

  it("sends no override when the header is absent", async () => {
    // V8 must stay on its own global rather than get pinned to Node's mirror
    // of the device setting.
    expect(await compactOutput()).toBeUndefined();
  });

  it("sends no override for an unrecognized value", async () => {
    expect(await compactOutput("yaml")).toBeUndefined();
  });

  it("does not leak one request's format onto the next", async () => {
    await compactOutput("json");

    expect(await compactOutput()).toBeUndefined();
  });
});
