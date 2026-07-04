// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withGlobalContext } from "#src/mcp-server/helpers/global-context/global-context-inject.ts";
import { type McpResponse } from "#src/mcp-server/max-api-adapter.ts";

const ORIGINAL_DIR = process.env.PRODUCER_PAL_CONFIG_DIR;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ppal-ctx-wrap-"));
  process.env.PRODUCER_PAL_CONFIG_DIR = dir;
});

afterEach(() => {
  if (ORIGINAL_DIR == null) {
    delete process.env.PRODUCER_PAL_CONFIG_DIR;
  } else {
    process.env.PRODUCER_PAL_CONFIG_DIR = ORIGINAL_DIR;
  }

  rmSync(dir, { recursive: true, force: true });
});

/**
 * Build a fake inner callLiveApi that resolves to the given response.
 *
 * @param response - The McpResponse the fake should resolve with
 * @returns A vi.fn matching the callLiveApi signature
 */
function fakeInner(response: McpResponse) {
  return vi.fn(async () => response);
}

/**
 * A minimal successful connect-style response with a single content block.
 *
 * @returns A fresh McpResponse
 */
function connectResponse(): McpResponse {
  return { content: [{ type: "text", text: "{connected:true}" }] };
}

describe("withGlobalContext", () => {
  it("appends a labeled global-context block to a ppal-connect response", async () => {
    writeFileSync(join(dir, "context.md"), "I make ambient techno.");
    const inner = fakeInner(connectResponse());

    const result = await withGlobalContext(inner)("ppal-connect", {});

    expect(result.content).toHaveLength(2);
    const appended = result.content[1]?.text ?? "";

    expect(appended).toContain("Global context");
    expect(appended).toContain("I make ambient techno.");
  });

  it("passes the original tool, args, and overrides through to the inner", async () => {
    const inner = fakeInner(connectResponse());
    const overrides = { timeoutMs: 5000 };

    await withGlobalContext(inner)("ppal-connect", { foo: 1 }, overrides);

    expect(inner).toHaveBeenCalledWith("ppal-connect", { foo: 1 }, overrides);
  });

  it("trims surrounding whitespace from the injected block", async () => {
    writeFileSync(join(dir, "context.md"), "  I make ambient techno.\n\n");
    const inner = fakeInner(connectResponse());

    const result = await withGlobalContext(inner)("ppal-connect", {});

    const appended = result.content[1]?.text ?? "";

    expect(appended.endsWith("I make ambient techno.")).toBe(true);
  });

  it("does not inject when there is no global context file", async () => {
    const inner = fakeInner(connectResponse());

    const result = await withGlobalContext(inner)("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });

  it("does not inject when the file is only whitespace", async () => {
    writeFileSync(join(dir, "context.md"), "   \n\n  ");
    const inner = fakeInner(connectResponse());

    const result = await withGlobalContext(inner)("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });

  it("leaves non-connect tool responses untouched", async () => {
    writeFileSync(join(dir, "context.md"), "I make ambient techno.");
    const inner = fakeInner(connectResponse());

    const result = await withGlobalContext(inner)("ppal-read-track", {});

    expect(result.content).toHaveLength(1);
  });

  it("does not inject when the connect response is an error", async () => {
    writeFileSync(join(dir, "context.md"), "I make ambient techno.");
    const inner = fakeInner({
      content: [{ type: "text", text: "boom" }],
      isError: true,
    });

    const result = await withGlobalContext(inner)("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });
});
