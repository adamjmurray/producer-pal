// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import {
  developmentDevice,
  frozenDevice,
  useDeviceScratch,
} from "../../rpc/device-install/tests/device-install-test-helpers.ts";
import { errorHandlerMiddleware } from "../../helpers/http/error-handler-middleware.ts";
import {
  type MarkdownRouteServer,
  errorOf,
  startMarkdownRouteServer,
} from "../../tests/config-dir-test-helpers.ts";
import { registerDeviceInstallRoutes } from "../device-install-route.ts";

const { findUserLibraryPath } = vi.hoisted(() => ({
  findUserLibraryPath: vi.fn<() => Promise<string | null>>(),
}));

// The real lookup reads Live's browser database off the developer's machine.
vi.mock(import("../../live-library/query/user-library-path.ts"), () => ({
  findUserLibraryPath,
}));

// Names a copy to fail halfway.
const fault = vi.hoisted(() => ({ copy: false, stat: false }));

vi.mock(
  import("../../rpc/remote-script/user-library/user-library-fs.ts"),
  async (importOriginal) => {
    const actual = await importOriginal();

    return {
      ...actual,
      isLibraryFolder: (path) => {
        if (fault.stat) {
          throw Object.assign(new Error("EACCES: stat"), { code: "EACCES" });
        }

        return actual.isLibraryFolder(path);
      },
      copyIntoLibrary: (from, to) => {
        actual.copyIntoLibrary(from, to);

        if (fault.copy) {
          throw new Error("ENOSPC: copy");
        }
      },
    };
  },
);

describe("device-install routes", () => {
  const scratch = useDeviceScratch();
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

    return fetch(`${server.baseUrl}/device-install/install`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    fault.copy = false;
    fault.stat = false;
    findUserLibraryPath.mockReset().mockResolvedValue(scratch().library);
    vi.mocked(Max.outlet).mockClear();
    server = await startMarkdownRouteServer((app) => {
      registerDeviceInstallRoutes(app);
      app.use(errorHandlerMiddleware);
    });
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /device-install", () => {
    it("reports the status and never caches it", async () => {
      const { library, installed, runFromDownloads } = scratch();
      const source = runFromDownloads(frozenDevice(VERSION));
      const res = await fetch(`${server.baseUrl}/device-install`);

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toStrictEqual({
        source,
        problem: null,
        userLibrary: library,
        path: installed,
        state: "not-installed",
        version: VERSION,
        installedVersion: null,
        otherCopies: [],
      });
    });

    it("says why a development device can't be installed", async () => {
      scratch().runFromDownloads(developmentDevice());

      const res = await fetch(`${server.baseUrl}/device-install`);

      expect(await res.json()).toStrictEqual(
        expect.objectContaining({
          problem: "not-frozen",
          state: null,
        }),
      );
    });
  });

  describe("POST /device-install/install", () => {
    it("installs into the given User Library", async () => {
      const { library, installed, runFromDownloads } = scratch();
      const bytes = frozenDevice(VERSION);

      runFromDownloads(bytes);

      const res = await postInstall({ userLibrary: library });

      expect(res.status).toBe(200);
      expect(await res.json()).toStrictEqual(
        expect.objectContaining({
          outcome: "installed",
          path: installed,
          detail: "Installed the device.",
          changed: true,
        }),
      );
      expect(readFileSync(installed).equals(bytes)).toBe(true);
    });

    it("rejects a missing or blank userLibrary", async () => {
      scratch().runFromDownloads(frozenDevice(VERSION));

      for (const body of [{}, { userLibrary: "  " }, { userLibrary: 7 }]) {
        const res = await postInstall(body);

        expect(res.status).toBe(400);
        expect(await errorOf(res)).toBe(
          "userLibrary must be a non-empty string",
        );
      }
    });

    it("rejects a body that isn't JSON", async () => {
      const res = await fetch(`${server.baseUrl}/device-install/install`, {
        method: "POST",
      });

      expect(res.status).toBe(400);
    });

    it("rejects a folder that isn't there, and a relative path", async () => {
      const { library, runFromDownloads } = scratch();

      runFromDownloads(frozenDevice(VERSION));

      const missing = await postInstall({ userLibrary: join(library, "nope") });
      const relative = await postInstall({ userLibrary: "User Library" });

      expect(missing.status).toBe(400);
      expect(await errorOf(missing)).toMatch(/^Not a folder/);
      expect(relative.status).toBe(400);
      expect(await errorOf(relative)).toMatch(/^Not an absolute path/);
    });

    it("rejects a foreign browser origin", async () => {
      const { library, installed, runFromDownloads } = scratch();

      runFromDownloads(frozenDevice(VERSION));

      const res = await postInstall(
        { userLibrary: library },
        "https://evil.example",
      );

      expect(res.status).toBe(403);
      expect(existsSync(installed)).toBe(false);
    });

    it("answers 409 for a development device and writes nothing", async () => {
      const { library, installed, runFromDownloads } = scratch();

      runFromDownloads(developmentDevice());

      const res = await postInstall({ userLibrary: library });

      expect(res.status).toBe(409);
      expect(await errorOf(res)).toContain("Freeze it first");
      expect(existsSync(installed)).toBe(false);
    });

    it("answers 409 for a newer copy, and replaces it with force", async () => {
      const { library, installed, runFromDownloads, put } = scratch();

      runFromDownloads(frozenDevice(VERSION));
      put(installed, frozenDevice("999.0.0"));

      const refused = await postInstall({ userLibrary: library });

      expect(refused.status).toBe(409);
      expect(await refused.json()).toStrictEqual(
        expect.objectContaining({
          outcome: "skipped",
          error: expect.stringContaining("newer"),
        }),
      );

      const forced = await postInstall({ userLibrary: library, force: true });

      expect(forced.status).toBe(200);
      expect(await forced.json()).toStrictEqual(
        expect.objectContaining({ outcome: "updated" }),
      );
    });

    it("answers 500 with what it changed when the copy fails", async () => {
      const { library, installed, runFromDownloads } = scratch();

      runFromDownloads(frozenDevice(VERSION));
      fault.copy = true;

      const res = await postInstall({ userLibrary: library });

      expect(res.status).toBe(500);
      expect(await res.json()).toStrictEqual(
        expect.objectContaining({
          outcome: "failed",
          changed: false,
          createdFolders: [
            join(library, "Presets"),
            join(library, "Presets", "MIDI Effects"),
            dirname(installed),
          ],
          error: expect.stringContaining("ENOSPC"),
        }),
      );
      expect(existsSync(installed)).toBe(false);
    });

    it("answers 500 for an error it doesn't know how to explain", async () => {
      const { library, runFromDownloads } = scratch();

      runFromDownloads(frozenDevice(VERSION));
      // Not "no such folder": the check itself can't run.
      fault.stat = true;

      const res = await postInstall({ userLibrary: library });

      expect(res.status).toBe(500);
    });

    it("answers 500 when a write fails for a reason that isn't the caller's input", async () => {
      const { library, runFromDownloads } = scratch();

      runFromDownloads(frozenDevice(VERSION));
      // "Presets" as a file makes the folder it needs impossible to make.
      writeFileSync(join(library, "Presets"), "");

      const res = await postInstall({ userLibrary: library });

      expect(res.status).toBe(500);
    });
  });
});
