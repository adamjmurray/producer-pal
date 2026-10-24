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
  RUNNING_PING,
  useDeviceScratch,
} from "../../rpc/device-install/tests/device-install-test-helpers.ts";
import {
  remoteScriptPing,
  remoteScriptRequest,
} from "../../rpc/remote-script/remote-script-client.ts";
import { errorHandlerMiddleware } from "../../helpers/http/error-handler-middleware.ts";
import {
  type MarkdownRouteServer,
  errorOf,
  postJson,
  startMarkdownRouteServer,
} from "../../tests/config-dir-test-helpers.ts";
import { registerDeviceInstallRoutes } from "../device-install-route.ts";
import { findUserLibraryPath } from "../../live-library/query/user-library-path.ts";

// The real lookup reads Live's browser database off the developer's machine.
vi.mock(import("../../live-library/query/user-library-path.ts"), () => ({
  findUserLibraryPath: vi.fn(),
}));

// The real ones would talk to a Live running on the developer's machine.
vi.mock(
  import("../../rpc/remote-script/remote-script-client.ts"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    remoteScriptPing: vi.fn(),
    remoteScriptRequest: vi.fn(),
  }),
);

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

  const postInstall = (body: unknown, origin?: string): Promise<Response> =>
    postJson(`${server.baseUrl}/device-install/install`, body, origin);

  beforeEach(async () => {
    fault.copy = false;
    fault.stat = false;
    vi.mocked(findUserLibraryPath)
      .mockReset()
      .mockResolvedValue(scratch().library);
    vi.mocked(remoteScriptPing).mockReset().mockResolvedValue(RUNNING_PING);
    vi.mocked(remoteScriptRequest).mockReset();
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
        inUserLibrary: false,
        state: "not-installed",
        version: VERSION,
        installedVersion: null,
        otherCopies: [],
        swap: {
          allowed: false,
          reason:
            "There is no copy of this device in your User Library yet. Install it first.",
        },
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

  describe("GET /device-install swap offer", () => {
    it("offers the swap once an equal copy is in the User Library", async () => {
      const { runFromDownloads, installed, put } = scratch();

      runFromDownloads(frozenDevice(VERSION));
      put(installed, frozenDevice(VERSION, "library copy"));

      const res = await fetch(`${server.baseUrl}/device-install`);
      const body = (await res.json()) as { swap: unknown };

      expect(body.swap).toStrictEqual({ allowed: true, reason: null });
    });

    it("says why when the remote script isn't running", async () => {
      const { runFromDownloads, installed, put } = scratch();

      runFromDownloads(frozenDevice(VERSION));
      put(installed, frozenDevice(VERSION, "library copy"));
      vi.mocked(remoteScriptPing).mockResolvedValue({
        ...RUNNING_PING,
        running: false,
      });

      const res = await fetch(`${server.baseUrl}/device-install`);
      const body = (await res.json()) as {
        swap: { allowed: boolean; reason: string };
      };

      expect(body.swap.allowed).toBe(false);
      expect(body.swap.reason).toContain("remote script isn't running");
    });
  });

  describe("POST /device-install/swap", () => {
    const postSwap = (body: unknown, origin?: string): Promise<Response> =>
      postJson(`${server.baseUrl}/device-install/swap`, body, origin);

    /**
     * Make the remote script answer the swap.
     *
     * @param status - HTTP status
     * @param body - JSON body
     */
    function liveAnswers(status: number, body: Record<string, unknown>): void {
      vi.mocked(remoteScriptRequest).mockResolvedValue({
        available: true,
        status,
        body,
      });
    }

    /** Put a swappable device and copy in place. */
    function readyToSwap(): void {
      const { runFromDownloads, installed, put } = scratch();

      runFromDownloads(frozenDevice(VERSION));
      put(installed, frozenDevice(VERSION, "library copy"));
    }

    /**
     * Swap into the scratch User Library.
     *
     * @returns The status and JSON body the route answered with
     */
    async function swapped(): Promise<{
      status: number;
      body: Record<string, unknown>;
    }> {
      const res = await postSwap({ userLibrary: scratch().library });

      return {
        status: res.status,
        body: (await res.json()) as Record<string, unknown>,
      };
    }

    it("swaps, and says so", async () => {
      readyToSwap();
      liveAnswers(200, { track: { path: "t1", name: "Pal" } });

      const { status, body } = await swapped();

      expect(status).toBe(200);
      expect(body).toStrictEqual({
        swapping: true,
        confirmed: true,
        track: { path: "t1", name: "Pal" },
      });
    });

    it("says the swap is unconfirmed when Live didn't answer", async () => {
      readyToSwap();
      liveAnswers(500, { error: "boom" });

      const { status, body } = await swapped();

      expect(status).toBe(200);
      expect(body.confirmed).toBe(false);
      expect(body.note).toContain("may have been swapped");
    });

    it("answers 409 with a plain reason and asks Live nothing when there is no copy", async () => {
      scratch().runFromDownloads(frozenDevice(VERSION));

      const res = await postSwap({ userLibrary: scratch().library });

      expect(res.status).toBe(409);
      expect(await errorOf(res)).toContain("no copy of this device");
      expect(remoteScriptRequest).not.toHaveBeenCalled();
    });

    it("answers 409 when Live refuses", async () => {
      readyToSwap();
      liveAnswers(409, { error: "Producer Pal isn't in this Live Set" });

      const res = await postSwap({ userLibrary: scratch().library });

      expect(res.status).toBe(409);
      expect(await errorOf(res)).toContain("isn't in this Live Set");
    });

    it("answers 502 when the remote script can't be reached", async () => {
      readyToSwap();
      vi.mocked(remoteScriptRequest).mockResolvedValue({ available: false });

      const res = await postSwap({ userLibrary: scratch().library });

      expect(res.status).toBe(502);
    });

    it("rejects a blank userLibrary, a bad folder and a foreign origin", async () => {
      readyToSwap();

      const blank = await postSwap({});
      const missing = await postSwap({
        userLibrary: join(scratch().library, "nope"),
      });
      const foreign = await postSwap(
        { userLibrary: scratch().library },
        "https://evil.example",
      );

      expect([blank.status, missing.status, foreign.status]).toStrictEqual([
        400, 400, 403,
      ]);
      expect(remoteScriptRequest).not.toHaveBeenCalled();
    });

    it("answers 500 for an error it can't explain", async () => {
      readyToSwap();
      fault.stat = true;

      const res = await postSwap({ userLibrary: scratch().library });

      expect(res.status).toBe(500);
    });
  });
});
