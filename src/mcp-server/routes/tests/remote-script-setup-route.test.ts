// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { errorHandlerMiddleware } from "../../helpers/http/error-handler-middleware.ts";
import { remoteScriptPath } from "../../rpc/remote-script/remote-script-install.ts";
import { makeScratchUserLibrary } from "../../rpc/remote-script/tests/remote-script-test-helpers.ts";
import {
  type MarkdownRouteServer,
  errorOf,
  startMarkdownRouteServer,
} from "../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptSetupRoutes } from "../remote-script-setup-route.ts";

const { findUserLibraryPath } = vi.hoisted(() => ({
  findUserLibraryPath: vi.fn<() => Promise<string | null>>(),
}));

// The real lookup reads Live's browser database off the developer's machine.
vi.mock(import("../../live-library/query/user-library-path.ts"), () => ({
  findUserLibraryPath,
}));

let scratchDir: string;
let server: MarkdownRouteServer;

/**
 * POST the install endpoint.
 *
 * @param body - The JSON body to send
 * @param origin - Optional Origin header, to exercise the foreign-origin gate
 * @returns The fetch Response
 */
function postInstall(body: unknown, origin?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (origin != null) {
    headers.Origin = origin;
  }

  return fetch(`${server.baseUrl}/remote-script/install`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  scratchDir = makeScratchUserLibrary("route");
  findUserLibraryPath.mockResolvedValue(scratchDir);
  server = await startMarkdownRouteServer((app) => {
    registerRemoteScriptSetupRoutes(app);
    app.use(errorHandlerMiddleware);
  });
});

afterEach(async () => {
  await server.close();
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("GET /remote-script", () => {
  it("reports the status and never caches it", async () => {
    const res = await fetch(`${server.baseUrl}/remote-script`);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toStrictEqual({
      userLibrary: scratchDir,
      installed: false,
      installedVersion: null,
      bundledVersion: VERSION,
      running: false,
      runningVersion: null,
      liveVersion: null,
      updateAvailable: false,
      installedNewer: false,
    });
  });
});

describe("POST /remote-script/install", () => {
  it("installs into the given User Library", async () => {
    const res = await postInstall({ userLibrary: scratchDir });

    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({
      path: remoteScriptPath(scratchDir),
      version: VERSION,
    });
    expect(existsSync(join(remoteScriptPath(scratchDir), "__init__.py"))).toBe(
      true,
    );
  });

  it("rejects a missing or blank userLibrary", async () => {
    for (const body of [{}, { userLibrary: "  " }, { userLibrary: 7 }]) {
      const res = await postInstall(body);

      expect(res.status).toBe(400);
      expect(await errorOf(res)).toBe("userLibrary must be a non-empty string");
    }
  });

  it("rejects a folder that isn't there", async () => {
    const res = await postInstall({ userLibrary: join(scratchDir, "nope") });

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatch(/^Not a folder/);
  });

  it("rejects a relative path", async () => {
    const res = await postInstall({ userLibrary: "User Library" });

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatch(/^Not an absolute path/);
  });

  it("rejects a foreign browser origin", async () => {
    const res = await postInstall(
      { userLibrary: scratchDir },
      "https://evil.example",
    );

    expect(res.status).toBe(403);
  });

  it("answers 500 when the write itself fails", async () => {
    // "Remote Scripts" as a file makes the write fail for a reason that isn't
    // the caller's bad input, so it must not read as a 400.
    writeFileSync(join(scratchDir, "Remote Scripts"), "", "utf8");

    const res = await postInstall({ userLibrary: scratchDir });

    expect(res.status).toBe(500);
  });
});
