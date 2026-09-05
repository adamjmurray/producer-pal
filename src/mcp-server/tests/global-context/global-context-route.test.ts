// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync } from "node:fs";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerGlobalContextRoutes } from "#src/mcp-server/routes/config/global-context-route.ts";
import { putJson } from "../config-dir-test-helpers.ts";

const ORIGINAL_DIR = process.env.PRODUCER_PAL_CONFIG_DIR;

let dir: string;
let server: Server | undefined;
let url = "";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ppal-ctx-route-"));
  process.env.PRODUCER_PAL_CONFIG_DIR = dir;

  const app = express();

  app.use(express.json());
  registerGlobalContextRoutes(app);

  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;

  url = `http://localhost:${port}/global-context`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }

  if (ORIGINAL_DIR == null) {
    delete process.env.PRODUCER_PAL_CONFIG_DIR;
  } else {
    process.env.PRODUCER_PAL_CONFIG_DIR = ORIGINAL_DIR;
  }

  rmSync(dir, { recursive: true, force: true });
});

/**
 * PUT a JSON body to the /global-context endpoint.
 *
 * @param body - Request body
 * @param origin - Optional Origin header to exercise the localhost gate
 * @returns The fetch Response
 */
function putContext(body: unknown, origin?: string): Promise<Response> {
  return putJson(url, body, origin);
}

describe("global-context route", () => {
  it("GET returns an empty string when no file exists yet", async () => {
    const res = await fetch(url);

    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({ content: "" });
  });

  it("PUT writes the content and echoes it; GET reads it back verbatim", async () => {
    const content = "I compose dark techno at 140bpm.\n\n";

    const putRes = await putContext({ content });

    expect(putRes.status).toBe(200);
    // Byte-faithful: the trailing newlines survive the round-trip.
    expect(await putRes.json()).toStrictEqual({ content });

    const getRes = await fetch(url);

    expect(await getRes.json()).toStrictEqual({ content });
  });

  it("PUT rejects a non-string content with 400", async () => {
    const res = await putContext({ content: 42 });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("content must be a string");
  });

  it("PUT rejects a request with no JSON body with 400, not 500", async () => {
    // No Content-Type: application/json → express leaves req.body undefined;
    // the handler must 400 (bad request) rather than TypeError into a 500.
    const res = await fetch(url, { method: "PUT" });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("content must be a string");
  });

  it("PUT rejects a genuinely cross-site browser write with 403", async () => {
    const res = await putContext(
      { content: "blocked" },
      "https://evil.example.com",
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain("cross-site");
  });

  it("PUT accepts a localhost Origin", async () => {
    const res = await putContext({ content: "" }, "http://localhost:9999");

    expect(res.status).toBe(200);
  });
});
