// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import {
  MIN_REMOTE_SCRIPT_VERSION,
  outdatedScript,
  setRemoteScriptMinVersion,
  unknownRouteReason,
} from "../remote-script-version.ts";

afterEach(() => {
  setRemoteScriptMinVersion(null);
});

describe("outdatedScript", () => {
  it("words a script older than the minimum", () => {
    expect(outdatedScript("2.4.0")).toBe(
      `the Producer Pal remote script is out of date (running 2.4.0, needs ${MIN_REMOTE_SCRIPT_VERSION} or later); update it with ppal-manage action "install-remote-script" or in the Producer Pal chat UI's Settings → Remote Script, then restart Live`,
    );
  });

  it.each(["2.4.9", "2.4.1-rc1", "2.4.0"])("refuses %s", (version) => {
    expect(outdatedScript(version)).not.toBeNull();
  });

  it.each([MIN_REMOTE_SCRIPT_VERSION, "2.5.0", "2.5.1", "2.6.0", "3.0.0"])(
    "accepts %s",
    (version) => {
      expect(outdatedScript(version)).toBeNull();
    },
  );

  it("says nothing when the version isn't known", () => {
    expect(outdatedScript(null)).toBeNull();
  });

  it("accepts the version this build ships", () => {
    expect(outdatedScript(VERSION)).toBeNull();
  });

  it("uses the dev override in place of the minimum, until it is cleared", () => {
    setRemoteScriptMinVersion("9.0.0");
    expect(outdatedScript("2.5.0")).toContain("needs 9.0.0 or later");

    setRemoteScriptMinVersion(null);
    expect(outdatedScript("2.5.0")).toBeNull();
  });
});

describe("unknownRouteReason", () => {
  const UNKNOWN = {
    error: "unknown route: /envelope/read",
    routes: ["/ping", "/list"],
  };

  it("words the bridge's answer for a route it doesn't have", () => {
    expect(unknownRouteReason(404, UNKNOWN, "2.4.0")).toContain(
      "running 2.4.0, needs",
    );
  });

  it("leaves the running version out when it isn't known", () => {
    expect(unknownRouteReason(404, UNKNOWN, null)).toContain(
      "out of date (needs",
    );
  });

  it.each([
    ["a missing track", 404, { error: "no track t9" }],
    ["a 404 with no routes listed", 404, { error: "unknown route: /x" }],
    ["routes that aren't a list", 404, { ...UNKNOWN, routes: "/ping" }],
    ["a 404 with no error", 404, { routes: ["/ping"] }],
    ["a 400", 400, UNKNOWN],
    ["a 200", 200, UNKNOWN],
  ])("leaves %s as an answer", (_name, status, body) => {
    expect(unknownRouteReason(status, body, "2.5.0")).toBeNull();
  });
});
