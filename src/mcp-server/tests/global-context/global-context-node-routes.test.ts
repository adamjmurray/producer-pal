// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGlobalContextNodeRoutes } from "#src/mcp-server/helpers/global-context/global-context-node-routes.ts";
import { clearNodeRoutes } from "#src/mcp-server/rpc/node-request-protocol.ts";
import { dispatchNodeRoute } from "../config-dir-test-helpers.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const ORIGINAL_DIR = process.env.PRODUCER_PAL_CONFIG_DIR;

let dir: string;

beforeEach(() => {
  vi.clearAllMocks();
  dir = mkdtempSync(join(tmpdir(), "ppal-ctx-routes-"));
  process.env.PRODUCER_PAL_CONFIG_DIR = dir;
  registerGlobalContextNodeRoutes();
});

afterEach(() => {
  clearNodeRoutes();

  if (ORIGINAL_DIR == null) {
    delete process.env.PRODUCER_PAL_CONFIG_DIR;
  } else {
    process.env.PRODUCER_PAL_CONFIG_DIR = ORIGINAL_DIR;
  }

  rmSync(dir, { recursive: true, force: true });
});

describe("globalContext.read route", () => {
  it("returns the stored content verbatim", async () => {
    writeFileSync(join(dir, "context.md"), "  I make ambient techno.\n\n");

    const response = await dispatchNodeRoute("globalContext.read", {});

    expect(response.success).toBe(true);
    expect(response.result).toStrictEqual({
      content: "  I make ambient techno.\n\n",
    });
  });

  it("returns an empty string when the file is missing", async () => {
    const response = await dispatchNodeRoute("globalContext.read", {});

    expect(response.success).toBe(true);
    expect(response.result).toStrictEqual({ content: "" });
  });
});

describe("globalContext.write route", () => {
  it("persists the content and echoes back what was stored", async () => {
    const response = await dispatchNodeRoute("globalContext.write", {
      content: "I prefer dark, minimal arrangements.",
    });

    expect(response.success).toBe(true);
    expect(response.result).toStrictEqual({
      content: "I prefer dark, minimal arrangements.",
    });
    expect(readFileSync(join(dir, "context.md"), "utf8")).toBe(
      "I prefer dark, minimal arrangements.",
    );
  });

  it("fails when content is not a string", async () => {
    const response = await dispatchNodeRoute("globalContext.write", {
      content: 42,
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("content must be a string");
  });

  it("fails when args are missing entirely", async () => {
    const response = await dispatchNodeRoute("globalContext.write", null);

    expect(response.success).toBe(false);
    expect(response.error).toContain("content must be a string");
  });
});
