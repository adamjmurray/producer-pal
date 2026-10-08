// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { REMOTE_SCRIPT_SETUP } from "#src/tools/shared/remote-script/remote-script-setup.ts";
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
      `undo needs the Producer Pal remote script, which isn't answering; ${REMOTE_SCRIPT_SETUP}`,
    );
    expect(REMOTE_SCRIPT_SETUP).toContain(
      'ppal-manage action "install-remote-script"',
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

describe("ppal-manage install-remote-script", () => {
  it("reports the version and path, and what the user does next", async () => {
    answers({ installed: true, version: "2.5.0", path: "/lib/Producer_Pal" });

    const result = await manage({ action: "install-remote-script" });

    expect(result).toStrictEqual({
      version: "2.5.0",
      path: "/lib/Producer_Pal",
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

  it("passes the User Library, trimmed", async () => {
    answers({ installed: true, version: "2.5.0", path: "/p" });

    await manage({ action: "install-remote-script", userLibrary: " /lib " });

    expect(vi.mocked(requestNode).mock.calls[0]?.[1]).toStrictEqual({
      userLibrary: "/lib",
    });
  });

  it("sends no User Library for a blank one", async () => {
    answers({ installed: true, version: "2.5.0", path: "/p" });

    await manage({ action: "install-remote-script", userLibrary: "  " });

    expect(vi.mocked(requestNode).mock.calls[0]?.[1]).toStrictEqual({});
  });

  it("refuses with Node's reason, which says what state the install left", async () => {
    answers({
      installed: false,
      error: "the install failed (EACCES). any previous install is unchanged",
    });

    await expect(manage({ action: "install-remote-script" })).rejects.toThrow(
      "the install failed (EACCES). any previous install is unchanged",
    );
  });

  it("says the install may or may not have finished when Node gave no answer", async () => {
    vi.mocked(requestNode).mockResolvedValue({
      success: false,
      error: "timed out",
    });

    await expect(manage({ action: "install-remote-script" })).rejects.toThrow(
      /may or may not have finished\. Run it again/,
    );
  });
});

describe("ppal-manage refusals", () => {
  it("needs an action", async () => {
    await expect(manage({})).rejects.toThrow(
      "action must be one of: install-remote-script, add-producer-pal, undo, redo",
    );
    await expect(manage()).rejects.toThrow("action must be one of");
  });

  it("refuses an unknown action, naming it", async () => {
    await expect(manage({ action: "reboot" })).rejects.toThrow(
      'action must be one of: install-remote-script, add-producer-pal, undo, redo, not "reboot"',
    );
  });

  it("refuses steps on an install, before asking anything", async () => {
    await expect(
      manage({ action: "install-remote-script", steps: 2 }),
    ).rejects.toThrow(/steps is only for action "undo" or "redo"/);
    expect(requestNode).not.toHaveBeenCalled();
  });

  it.each(["undo", "redo"])(
    "refuses userLibrary on %s, before asking anything",
    async (action) => {
      await expect(manage({ action, userLibrary: "/lib" })).rejects.toThrow(
        /userLibrary is only for action "install-remote-script" or "add-producer-pal"/,
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

  it("refuses steps on add-producer-pal", async () => {
    await expect(
      manage({ action: "add-producer-pal", steps: 2 }),
    ).rejects.toThrow(/steps is only for action "undo" or "redo"/);
  });
});
