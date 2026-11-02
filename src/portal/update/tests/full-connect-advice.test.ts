// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { VERSION_CHECK_NEVER_CONNECTED } from "#src/shared/version-check.ts";
import {
  requestAnswers,
  responseText,
  SENT_TIMEOUT,
} from "../../offline/tests/offline-add-producer-pal-test-helpers.ts";
import {
  DOWN,
  fakeDeviceWith,
  OLD,
  updateCall,
  updateDeps,
} from "./update-test-helpers.ts";
import {
  isFullConnect,
  updatedNextSteps,
  versionCheckSentence,
} from "../full-connect-advice.ts";

const OK = { content: [] };

const SEEN = { fullConnectSeen: true };
const CHECK_OR_CONNECT = `call ppal-connect with versionCheck: true. ${VERSION_CHECK_NEVER_CONNECTED}`;

describe("version check advice", () => {
  it("says only the plain connect until one has worked", () => {
    expect(versionCheckSentence(false)).toBe("call ppal-connect.");
    expect(updatedNextSteps(false)).toBe(
      "Now call ppal-connect to load the Skills and confirm the update.",
    );
  });

  it("offers the version check, with the hint, once one has", () => {
    expect(versionCheckSentence(true)).toBe(CHECK_OR_CONNECT);
    expect(updatedNextSteps(true)).toBe(
      `Now call ppal-connect with versionCheck: true to confirm the update. ${VERSION_CHECK_NEVER_CONNECTED}`,
    );
  });

  it("names the call, not being connected, in the hint", () => {
    expect(VERSION_CHECK_NEVER_CONNECTED).toBe(
      "(If this chat hasn't called ppal-connect yet, call it without versionCheck.)",
    );
  });
});

describe("update-producer-pal next steps after a plain connect", () => {
  it("offers both after a successful update", async () => {
    const response = await updateCall(fakeDeviceWith(SEEN, OLD, VERSION));

    expect(responseText(response)).toContain(
      `nextSteps:"${updatedNextSteps(true)}"`,
    );
  });

  it("offers both when no new device answers", async () => {
    const text = responseText(
      await updateCall(fakeDeviceWith(SEEN, OLD, DOWN)),
    );

    expect(text).toBe(
      `Error: Live replaced the Producer Pal device on t3 "3-MIDI", but the new one hasn't answered yet. Wait a few seconds, then ${CHECK_OR_CONNECT} Don't call update-producer-pal again.`,
    );
  });

  it("offers both when the old device keeps answering", async () => {
    const text = responseText(await updateCall(fakeDeviceWith(SEEN, OLD)));

    expect(text).toBe(
      `Error: Live replaced the Producer Pal device on t3 "3-MIDI", but the old version (${OLD}) is still answering. Ask the user to check the Producer Pal device in Live, then ${CHECK_OR_CONNECT}`,
    );
  });

  it("offers both when the swap may have happened", async () => {
    const deps = updateDeps({ request: requestAnswers(SENT_TIMEOUT) });
    const text = responseText(
      await updateCall(fakeDeviceWith(SEEN, OLD), deps),
    );

    expect(text).toContain(
      `(it was ${OLD}): ${CHECK_OR_CONNECT} If it is still ${OLD}, call update-producer-pal again.`,
    );
  });

  it("offers both when Live reports a problem after it may have started", async () => {
    const deps = updateDeps({
      request: requestAnswers({
        available: true,
        status: 500,
        body: { error: "boom" },
      }),
    });
    const text = responseText(
      await updateCall(fakeDeviceWith(SEEN, OLD), deps),
    );

    expect(text).toContain(`(it was ${OLD}): ${CHECK_OR_CONNECT} If it is`);
  });
});

describe("isFullConnect", () => {
  it.each([
    ["a plain connect", "ppal-connect", {}, OK, true],
    [
      "a connect that says versionCheck: false",
      "ppal-connect",
      { versionCheck: false },
      OK,
      true,
    ],
    ["a version check", "ppal-connect", { versionCheck: true }, OK, false],
    ["a connect that errored", "ppal-connect", {}, { isError: true }, false],
    ["another tool", "ppal-read-live-set", {}, OK, false],
  ])("%s", (_label, name, args, result, expected) => {
    expect(isFullConnect({ name, args }, result)).toBe(expected);
  });
});
