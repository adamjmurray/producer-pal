// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { UserLibraryFolderError } from "#src/mcp-server/rpc/remote-script/user-library/user-library-folder.ts";
import { ASK_FOR_LIBRARY } from "#src/mcp-server/rpc/remote-script/install/remote-script-install-reply.ts";
import { NOT_RUNNING, RUNNING } from "./offline-test-helpers.ts";
import {
  addProducerPalCall,
  connectsAfter,
  copied,
  DEVICE_PATH,
  failure,
  happyDeps,
  LIBRARY,
  LOADED,
  requestAnswers,
  responseText,
  SENT_TIMEOUT,
  UNSENT_TIMEOUT,
} from "./offline-add-producer-pal-test-helpers.ts";

describe("add-producer-pal", () => {
  it("copies the device, loads it by path and answers with the track", async () => {
    const deps = happyDeps();
    const response = await addProducerPalCall(deps);

    expect(response.isError).toBeUndefined();
    expect(responseText(response)).toBe(
      '{track:{index:3,name:"3-MIDI"},device:"installed in the User Library",nextSteps:"Call ppal-connect next."}',
    );
    expect(deps.installDevice).toHaveBeenCalledWith(
      LIBRARY,
      "/bundle/Producer_Pal.amxd",
    );
    expect(deps.request).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.request).mock.calls[0]?.[0]).toStrictEqual({
      method: "POST",
      route: "/load",
      body: { type: "file", path: DEVICE_PATH },
      expiresInMs: 20_000,
    });
  });

  it("refuses a bad call before touching anything", async () => {
    const deps = happyDeps();
    const response = await addProducerPalCall(deps, undefined, { steps: 2 });

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain("steps");
    expect(deps.ping).not.toHaveBeenCalled();
  });
});

describe("add-producer-pal before anything changes", () => {
  it("says a portal with no bundled device can't add one, and where to install it", async () => {
    const deps = happyDeps({ findBundledDevice: () => null });
    const response = await addProducerPalCall(deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      "Error: this Producer Pal install has no bundled device, so nothing was added. Tell the user to install it by hand: https://producer-pal.org/installation",
    );
    expect(deps.ping).not.toHaveBeenCalled();
  });

  it("says the remote script is needed, and how to get it", async () => {
    const deps = happyDeps({ ping: () => Promise.resolve(NOT_RUNNING) });
    const response = await addProducerPalCall(deps);
    const text = responseText(response);

    expect(response.isError).toBe(true);
    expect(text).toContain("remote script isn't running");
    expect(text).toContain('ppal-manage action "install-remote-script"');
    expect(text).toContain("restart Live");
    expect(text).toContain("Control Surface");
    expect(deps.installDevice).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("gives the install advice for a remote script that is too old", async () => {
    const deps = happyDeps({
      ping: () => Promise.resolve({ ...RUNNING, scriptVersion: "1.0.0" }),
    });
    const response = await addProducerPalCall(deps);
    const text = responseText(response);

    expect(response.isError).toBe(true);
    expect(text).toContain("out of date (running 1.0.0");
    expect(text).toContain('ppal-manage action "install-remote-script"');
    expect(text).toContain("Nothing was added.");
    expect(deps.installDevice).not.toHaveBeenCalled();
  });
});

describe("add-producer-pal's User Library", () => {
  it("prefers the one the call gives", async () => {
    const deps = happyDeps({
      findUserLibrary: vi.fn(() => Promise.resolve("/found")),
    });

    await addProducerPalCall(deps, undefined, { userLibrary: " /given " });

    expect(deps.installDevice).toHaveBeenCalledWith(
      "/given",
      expect.any(String),
    );
  });

  it("then the one the remote script runs from", async () => {
    const deps = happyDeps({
      findUserLibrary: vi.fn(() => Promise.resolve("/found")),
    });

    await addProducerPalCall(deps);

    expect(deps.installDevice).toHaveBeenCalledWith(
      LIBRARY,
      expect.any(String),
    );
    expect(deps.findUserLibrary).not.toHaveBeenCalled();
  });

  it("then the one Producer Pal finds, for a script that doesn't say", async () => {
    const deps = happyDeps({
      ping: () => Promise.resolve(RUNNING),
      findUserLibrary: vi.fn(() => Promise.resolve("/found")),
    });

    await addProducerPalCall(deps);

    expect(deps.installDevice).toHaveBeenCalledWith(
      "/found",
      expect.any(String),
    );
  });

  it("asks the user when none can be found", async () => {
    const deps = happyDeps({ ping: () => Promise.resolve(RUNNING) });
    const response = await addProducerPalCall(deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      `Error: couldn't find Live's User Library, so nothing was added. ${ASK_FOR_LIBRARY}`,
    );
    expect(deps.installDevice).not.toHaveBeenCalled();
  });

  it("asks the user when the path isn't a User Library folder", async () => {
    const deps = happyDeps({
      installDevice: () => {
        throw new UserLibraryFolderError("not a folder: /nope");
      },
    });
    const response = await addProducerPalCall(deps);

    expect(responseText(response)).toBe(
      `Error: not a folder: /nope; nothing was added. ${ASK_FOR_LIBRARY}`,
    );
    expect(deps.request).not.toHaveBeenCalled();
  });

  it("says nothing was added when the bundled device can't be read", async () => {
    const deps = happyDeps({
      installDevice: () => {
        throw new Error("The bundled device can't be read: gone");
      },
    });
    const response = await addProducerPalCall(deps);

    expect(responseText(response)).toBe(
      "Error: The bundled device can't be read: gone. Nothing was added.",
    );
  });
});

describe("add-producer-pal's device file", () => {
  it.each([
    ["updated", {}, "updated in the User Library"],
    ["current", {}, "already installed and up to date"],
    [
      "skipped",
      { previousVersion: "9.0.0", bundledVersion: "2.5.0" },
      "used the installed device as it is (9.0.0; the bundled one is 2.5.0 and the installed one is newer or can't be ordered against it)",
    ],
    [
      "skipped",
      {},
      "used the installed device as it is (unknown version; the bundled one is unknown and the installed one is newer or can't be ordered against it)",
    ],
  ] as const)(
    "goes on after a %s copy and says so",
    async (outcome, extra, note) => {
      const deps = happyDeps({ installDevice: () => copied(outcome, extra) });
      const response = await addProducerPalCall(deps);

      expect(response.isError).toBeUndefined();
      expect(responseText(response)).toContain(`device:"${note}"`);
      expect(deps.request).toHaveBeenCalledTimes(1);
    },
  );

  it("goes on with a device that is there when the update failed, and says why", async () => {
    const deps = happyDeps({
      installDevice: () => copied("failed", { error: "EBUSY: file in use" }),
      fileExists: vi.fn(() => true),
    });
    const response = await addProducerPalCall(deps);

    expect(response.isError).toBeUndefined();
    expect(responseText(response)).toContain(
      "couldn't update the installed device (EBUSY: file in use); used the one already there",
    );
    expect(deps.fileExists).toHaveBeenCalledWith(DEVICE_PATH);
    expect(deps.request).toHaveBeenCalledTimes(1);
  });

  it("fails when the copy failed and there is no device to load", async () => {
    const deps = happyDeps({
      installDevice: () =>
        copied("failed", {
          detail:
            "Couldn't install the device. The device file was not changed.",
          error: "EACCES: no write access",
        }),
      fileExists: () => false,
    });
    const response = await addProducerPalCall(deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      "Error: Couldn't install the device. The device file was not changed. Cause: EACCES: no write access. Nothing was added to the Live Set. Tell the user to install the device by hand: https://producer-pal.org/installation",
    );
    expect(deps.request).not.toHaveBeenCalled();
  });
});

describe("add-producer-pal's load", () => {
  it("asks again while Live's browser hasn't seen the new file", async () => {
    const deps = happyDeps({
      request: requestAnswers(
        failure(404, "no device"),
        failure(404, "no device"),
        LOADED,
      ),
    });
    const response = await addProducerPalCall(deps);

    expect(response.isError).toBeUndefined();
    expect(deps.request).toHaveBeenCalledTimes(3);
    expect(deps.sleep).toHaveBeenCalledWith(500);
  });

  it("gives up after about 15 seconds of not finding it, saying what it left", async () => {
    const deps = happyDeps({
      request: requestAnswers(failure(404, "no device")),
    });
    const response = await addProducerPalCall(deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      "Error: Live's browser hasn't found the device file yet (no device). Nothing was added to the Set. The device file is in the User Library. Call add-producer-pal again in a moment.",
    );
    expect(vi.mocked(deps.request).mock.calls.length).toBeGreaterThan(20);
    expect(vi.mocked(deps.request).mock.calls.length).toBeLessThan(40);
  });

  it("passes on a 409 that says Producer Pal is already there, and says its server isn't answering", async () => {
    const deps = happyDeps({
      request: requestAnswers(
        failure(
          409,
          'Producer Pal is already in this Live Set (on track 1 "1-MIDI")',
        ),
      ),
    });
    const response = await addProducerPalCall(deps);
    const text = responseText(response);

    expect(response.isError).toBe(true);
    expect(text).toContain(
      'Producer Pal is already in this Live Set (on track 1 "1-MIDI")',
    );
    expect(text).toContain("its server isn't answering");
    expect(text).toContain("Don't add another.");
    expect(deps.request).toHaveBeenCalledTimes(1);
  });

  it("passes on the remote script's text for any other failure", async () => {
    const deps = happyDeps({
      request: requestAnswers(failure(500, "load_item blew up")),
    });
    const response = await addProducerPalCall(deps);

    expect(responseText(response)).toBe(
      "Error: Live couldn't add Producer Pal: load_item blew up. Nothing was added to the Set. The device file is in the User Library.",
    );
    expect(deps.request).toHaveBeenCalledTimes(1);
  });

  it("says a remote script that went away left the Set alone", async () => {
    const deps = happyDeps({ request: requestAnswers({ available: false }) });
    const response = await addProducerPalCall(deps);

    expect(responseText(response)).toBe(
      "Error: the remote script stopped answering. Nothing was added to the Set. The device file is in the User Library.",
    );
  });

  it("gives the install advice when the script turns out too old for the route", async () => {
    const deps = happyDeps({
      request: requestAnswers({
        available: false,
        outdated: "the Producer Pal remote script is out of date",
      }),
    });
    const response = await addProducerPalCall(deps);

    expect(responseText(response)).toContain(
      "Error: the Producer Pal remote script is out of date. Nothing was added to the Set.",
    );
  });

  it("says Live may have added it when the request timed out after it was sent", async () => {
    const deps = happyDeps({ request: requestAnswers(SENT_TIMEOUT) });
    const connect = connectsAfter(0);
    const response = await addProducerPalCall(deps, connect);
    const text = responseText(response);

    expect(response.isError).toBe(true);
    expect(text).toContain("may have been added to a new MIDI track");
    expect(text).toContain("call ppal-connect");
    expect(text).toContain("Don't call add-producer-pal again.");
    expect(connect).not.toHaveBeenCalled();
  });

  it("treats a connection lost mid-request the same way", async () => {
    const deps = happyDeps({
      request: requestAnswers(new Error("socket hang up")),
    });
    const response = await addProducerPalCall(deps);

    expect(responseText(response)).toContain("socket hang up");
    expect(responseText(response)).toContain("may have been added");
  });

  it("says nothing was added when the request never left", async () => {
    const deps = happyDeps({ request: requestAnswers(UNSENT_TIMEOUT) });
    const response = await addProducerPalCall(deps);

    expect(responseText(response)).toBe(
      "Error: ran out of time before the request reached Live, so nothing was added to the Set. The device file is in the User Library. Call add-producer-pal again.",
    );
  });
});

describe("add-producer-pal's wait for the server", () => {
  it("polls until the device's server answers", async () => {
    const connect = connectsAfter(3);
    const deps = happyDeps();
    const response = await addProducerPalCall(deps, connect);

    expect(response.isError).toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(4);
    expect(deps.sleep).toHaveBeenCalledTimes(3);
    expect(deps.sleep).toHaveBeenCalledWith(500);
  });

  it("gives up after about 30 seconds and says where it was added", async () => {
    const connect = connectsAfter(Number.POSITIVE_INFINITY);
    const deps = happyDeps();
    const response = await addProducerPalCall(deps, connect);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toBe(
      "Error: Producer Pal was added to track 3 \"3-MIDI\" but hasn't answered yet. Wait a moment, then call ppal-connect. Don't call add-producer-pal again.",
    );
    expect(vi.mocked(connect).mock.calls.length).toBeGreaterThan(50);
  });

  it("keeps polling when a connect throws something that isn't an Error", async () => {
    let calls = 0;
    const connect = vi.fn(() => {
      calls += 1;

      return calls < 3 ? Promise.reject("refused") : Promise.resolve();
    });
    const response = await addProducerPalCall(happyDeps(), connect);

    expect(response.isError).toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it("names a new track when the remote script didn't say which", async () => {
    const deps = happyDeps({
      request: requestAnswers({
        available: true,
        status: 200,
        body: { track: "x" },
      }),
    });
    const ok = await addProducerPalCall(deps);

    expect(responseText(ok)).toBe(
      '{device:"installed in the User Library",nextSteps:"Call ppal-connect next."}',
    );

    const slow = await addProducerPalCall(
      deps,
      connectsAfter(Number.POSITIVE_INFINITY),
    );

    expect(responseText(slow)).toContain("added to a new MIDI track but");
  });
});
