// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { remoteScriptSetup } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { MANAGE_ROUTES } from "../helpers/manage-contract.ts";
import { manage } from "../manage.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

/**
 * Have the Node route answer.
 * @param result - The route's reply
 */
function answers(result: unknown): void {
  vi.mocked(requestNode).mockResolvedValue({ success: true, result });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ppal-manage undo and redo", () => {
  it.each([
    ["undo", "undone"],
    ["redo", "redone"],
  ] as const)(
    "%s asks the remote script and reports the steps and what Live can do after",
    async (action, key) => {
      answers({
        available: true,
        result: { done: 1, can_undo: false, can_redo: true },
      });

      expect(await manage({ action })).toStrictEqual({
        [key]: 1,
        canUndo: false,
        canRedo: true,
      });

      const [route, args] = vi.mocked(requestNode).mock.calls[0] ?? [];

      expect(route).toBe(MANAGE_ROUTES[action]);
      expect(args).toHaveProperty("expiresInMs");
      expect(args).not.toHaveProperty("steps");
    },
  );

  it("sends the number of steps asked for", async () => {
    answers({
      available: true,
      result: { done: 3, can_undo: true, can_redo: true },
    });

    expect(await manage({ action: "undo", steps: 3 })).toStrictEqual({
      undone: 3,
      canUndo: true,
      canRedo: true,
    });
    expect(vi.mocked(requestNode).mock.calls[0]?.[1]).toHaveProperty(
      "steps",
      3,
    );
  });

  it("takes steps sent as text", async () => {
    answers({
      available: true,
      result: { done: 2, can_undo: true, can_redo: true },
    });

    await manage({ action: "redo", steps: "2" });

    expect(vi.mocked(requestNode).mock.calls[0]?.[1]).toHaveProperty(
      "steps",
      2,
    );
  });

  it("says why it took fewer steps than asked", async () => {
    answers({
      available: true,
      result: {
        done: 2,
        stopped: "nothing more to undo",
        can_undo: false,
        can_redo: true,
      },
    });

    expect(await manage({ action: "undo", steps: 5 })).toStrictEqual({
      undone: 2,
      canUndo: false,
      canRedo: true,
      stopped: "nothing more to undo",
    });
  });

  it("reports a guard stop that took no steps as a result, not an error", async () => {
    answers({
      available: true,
      result: {
        done: 0,
        stopped: "The next undo would remove Producer Pal from the Set",
        can_undo: true,
        can_redo: false,
      },
    });

    expect(await manage({ action: "undo" })).toStrictEqual({
      undone: 0,
      canUndo: true,
      canRedo: false,
      stopped: "The next undo would remove Producer Pal from the Set",
    });
  });

  it.each([0, -1, 51, 2.5, "many"])(
    "refuses steps of %s before asking anything",
    async (steps) => {
      await expect(manage({ action: "undo", steps })).rejects.toThrow(
        /^steps must be a whole number from 1 to 50/,
      );
      expect(requestNode).not.toHaveBeenCalled();
    },
  );

  it("takes the most steps allowed", async () => {
    answers({
      available: true,
      result: { done: 50, can_undo: true, can_redo: true },
    });

    await expect(manage({ action: "undo", steps: 50 })).resolves.toHaveProperty(
      "undone",
      50,
    );
  });

  it.each(["undo", "redo"] as const)(
    "%s refuses with the remote script's reason when there is nothing to step",
    async (action) => {
      answers({ available: true, error: `nothing to ${action}` });

      await expect(manage({ action })).rejects.toThrow(
        new RegExp(`^nothing to ${action}$`),
      );
    },
  );

  it("refuses, pointing at the install, when the remote script isn't running", async () => {
    answers({ available: false });

    await expect(manage({ action: "undo" })).rejects.toThrow(
      `undo needs the Producer Pal remote script, which isn't answering; ${remoteScriptSetup(true)}`,
    );
    expect(remoteScriptSetup(true)).toContain(
      'ppal-manage action "install-producer-pal"',
    );
  });

  it("refuses with the out-of-date reason when the remote script lacks the route", async () => {
    answers({ available: false, outdated: "the script is out of date" });

    await expect(manage({ action: "redo" })).rejects.toThrow(
      "the script is out of date",
    );
  });

  it("says the step may have been applied when the answer was lost", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: false,
      error: "timed out",
    });

    await expect(manage({ action: "undo" })).rejects.toThrow(
      /did not answer in time; the undo may have been applied\. Read the Live Set to check before trying again/,
    );
  });

  it("says the step may have been applied when the remote script broke after taking it", async () => {
    answers({
      available: true,
      error: "the connection was lost",
      unfinished: true,
    });

    await expect(manage({ action: "redo" })).rejects.toThrow(
      "the connection was lost; the redo may have been applied. Read the Live Set to check before trying again",
    );
  });

  it("says nothing was started when the request had no time left", async () => {
    await expect(
      manage({ action: "undo" }, { deadline: Date.now() - 1 }),
    ).rejects.toThrow("ran out of time; the undo wasn't started, re-run it");
    expect(requestNode).not.toHaveBeenCalled();
  });
});

const SCRIPT_OK = {
  status: "installed",
  version: "2.5.0",
  path: "/lib/Producer_Pal",
};
const DEVICE_OK = { status: "installed", path: "/lib/Producer_Pal.amxd" };

describe("ppal-manage install-producer-pal", () => {
  it("reports the remote script and the device, and what the user does next", async () => {
    answers({ ran: true, remoteScript: SCRIPT_OK, device: DEVICE_OK });

    const result = await manage({ action: "install-producer-pal" });

    expect(result).toStrictEqual({
      remoteScript: SCRIPT_OK,
      device: DEVICE_OK,
      nextSteps: expect.stringMatching(
        /^Tell the user to finish in Live: restart Live, then, on first install, choose "Producer Pal" as a Control Surface/,
      ),
    });
    expect(vi.mocked(requestNode).mock.calls[0]).toStrictEqual([
      MANAGE_ROUTES.install,
      {},
      expect.any(Number),
    ]);
  });

  it("doesn't send the user to add-producer-pal, since Producer Pal is running", async () => {
    answers({ ran: true, remoteScript: SCRIPT_OK, device: DEVICE_OK });

    const result = await manage({ action: "install-producer-pal" });

    expect(JSON.stringify(result)).not.toContain("add-producer-pal");
  });

  it("treats the retired name exactly as the new one", async () => {
    answers({ ran: true, remoteScript: SCRIPT_OK, device: DEVICE_OK });

    const retired = await manage({ action: "install-remote-script" });
    const current = await manage({ action: "install-producer-pal" });

    expect(retired).toStrictEqual(current);
  });

  it("passes the User Library, trimmed", async () => {
    answers({ ran: true, remoteScript: SCRIPT_OK, device: DEVICE_OK });

    await manage({ action: "install-producer-pal", userLibrary: " /lib " });

    expect(vi.mocked(requestNode).mock.calls[0]?.[1]).toStrictEqual({
      userLibrary: "/lib",
    });
  });

  it("sends no User Library for a blank one", async () => {
    answers({ ran: true, remoteScript: SCRIPT_OK, device: DEVICE_OK });

    await manage({ action: "install-producer-pal", userLibrary: "  " });

    expect(vi.mocked(requestNode).mock.calls[0]?.[1]).toStrictEqual({});
  });

  it("reports the file that installed when the other failed, not an error", async () => {
    const failed = { ok: false, detail: "the device file is in use" };

    answers({ ran: true, remoteScript: SCRIPT_OK, device: failed });

    expect(await manage({ action: "install-producer-pal" })).toStrictEqual({
      remoteScript: SCRIPT_OK,
      device: failed,
      nextSteps: expect.stringContaining(
        "Only the remote script was installed; the device was not (see device).",
      ),
    });

    answers({ ran: true, remoteScript: failed, device: DEVICE_OK });

    expect(await manage({ action: "install-producer-pal" })).toStrictEqual({
      remoteScript: failed,
      device: DEVICE_OK,
      nextSteps: expect.stringContaining(
        "Only the device was installed; the remote script was not (see remoteScript).",
      ),
    });
  });

  it("refuses naming both reasons when neither installed", async () => {
    answers({
      ran: true,
      remoteScript: { ok: false, detail: "EACCES." },
      device: { ok: false, detail: "EBUSY" },
    });

    await expect(manage({ action: "install-producer-pal" })).rejects.toThrow(
      "nothing was installed. Remote script: EACCES. Device: EBUSY.",
    );
  });

  it("refuses with Node's reason when nothing was tried", async () => {
    answers({
      ran: false,
      error: "couldn't find Live's User Library, so nothing was installed.",
    });

    await expect(manage({ action: "install-producer-pal" })).rejects.toThrow(
      "couldn't find Live's User Library, so nothing was installed.",
    );
  });

  it("says the install may or may not have finished when Node gave no answer in time", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: false,
      error: "node_request 'manage.installProducerPal' timed out after 20000ms",
      timedOut: true,
    });

    await expect(manage({ action: "install-producer-pal" })).rejects.toThrow(
      /may or may not have finished\. Run it again/,
    );
  });

  it.each([
    ["an unknown route", "Unknown route: manage.installProducerPal"],
    ["a request too large to send", "node_request too large"],
    ["a send failure", "Failed to send node_request: outlet exploded"],
  ])(
    "says nothing was installed, with the real error, for %s",
    async (_why, error) => {
      vi.mocked(requestNode).mockResolvedValue({
        success: false,
        error,
        notRun: true,
      });

      const failure = manage({ action: "install-producer-pal" });

      await expect(failure).rejects.toThrow(`nothing was installed: ${error}`);
      await expect(failure).rejects.not.toThrow(/may or may not/);
    },
  );

  it("says a failure that did not run may have finished, without an error text", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: false, notRun: true });

    await expect(manage({ action: "install-producer-pal" })).rejects.toThrow(
      "nothing was installed: the install did not run",
    );
  });

  it.each([
    ["an unreadable answer", "Failed to parse node_response: Unexpected token"],
    [
      "Node's own route timeout",
      "Route 'manage.installProducerPal' timed out after 25000ms",
    ],
    [
      "a reply too large to send back",
      "Response too large: 9 bytes would require 9 chunks",
    ],
    ["a handler that threw", "EACCES: permission denied"],
  ])(
    "says the install may have finished, with the real error, for %s",
    async (_why, error) => {
      vi.mocked(requestNode).mockResolvedValue({ success: false, error });

      await expect(manage({ action: "install-producer-pal" })).rejects.toThrow(
        `(${error}), so it may or may not have finished. Run it again`,
      );
    },
  );

  it("says the install may have finished when the route answered success with no result", async () => {
    vi.mocked(requestNode).mockResolvedValue({ success: true });

    await expect(manage({ action: "install-producer-pal" })).rejects.toThrow(
      "(no result), so it may or may not have finished",
    );
  });
});

describe("ppal-manage refusals", () => {
  it("needs an action", async () => {
    await expect(manage({})).rejects.toThrow(
      "action must be one of: install-producer-pal, add-producer-pal, update-producer-pal, undo, redo",
    );
    await expect(manage()).rejects.toThrow("action must be one of");
  });

  it("refuses an unknown action, naming it", async () => {
    await expect(manage({ action: "reboot" })).rejects.toThrow(
      'action must be one of: install-producer-pal, add-producer-pal, update-producer-pal, undo, redo, not "reboot"',
    );
  });

  it("refuses steps on an install, before asking anything", async () => {
    await expect(
      manage({ action: "install-producer-pal", steps: 2 }),
    ).rejects.toThrow(/steps is only for action "undo" or "redo"/);
    expect(requestNode).not.toHaveBeenCalled();
  });

  it.each(["undo", "redo"])(
    "refuses userLibrary on %s, before asking anything",
    async (action) => {
      await expect(manage({ action, userLibrary: "/lib" })).rejects.toThrow(
        /userLibrary is only for action "install-producer-pal", "add-producer-pal" or "update-producer-pal"/,
      );
      expect(requestNode).not.toHaveBeenCalled();
    },
  );

  it("refuses add-producer-pal when Producer Pal is running, before asking anything", async () => {
    await expect(manage({ action: "add-producer-pal" })).rejects.toThrow(
      "Producer Pal is already running in this Live Set",
    );
    await expect(
      manage({ action: "add-producer-pal", userLibrary: "/lib" }),
    ).rejects.toThrow("Producer Pal is already running in this Live Set");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("sends update-producer-pal to the portal, before asking anything", async () => {
    await expect(manage({ action: "update-producer-pal" })).rejects.toThrow(
      /runs through the portal \(the npx producer-pal package or the Claude Desktop extension\)/,
    );
    await expect(
      manage({ action: "update-producer-pal", userLibrary: "/lib" }),
    ).rejects.toThrow("runs through the portal");
    expect(requestNode).not.toHaveBeenCalled();
  });

  it("refuses steps on add-producer-pal", async () => {
    await expect(
      manage({ action: "add-producer-pal", steps: 2 }),
    ).rejects.toThrow(/steps is only for action "undo" or "redo"/);
  });
});
