// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  canonicalManageAction,
  type InstallPart,
} from "../helpers/manage-contract.ts";
import { manageInstallResult } from "../helpers/manage-install-result.ts";

const OK: InstallPart = { status: "installed", path: "/x" };
const BAD: InstallPart = { ok: false, detail: "nope" };

describe("manageInstallResult plug-in host wrappers", () => {
  const INSTALLED = [
    { name: "PPal Plug-in Effect", status: "installed" as const, path: "/e" },
    {
      name: "PPal Plug-in Instrument",
      status: "installed" as const,
      path: "/i",
    },
  ];
  const STUCK = {
    name: "PPal Plug-in Instrument",
    ok: false as const,
    path: "/i",
    detail: "Couldn't install the wrapper (EBUSY).",
  };

  it("reports each wrapper and adds nothing to the next steps when they installed", () => {
    const withWrappers = manageInstallResult(
      { ran: true, remoteScript: OK, device: OK, pluginHost: INSTALLED },
      { running: true },
    );
    const without = manageInstallResult(
      { ran: true, remoteScript: OK, device: OK },
      { running: true },
    );

    expect(withWrappers.pluginHost).toStrictEqual(INSTALLED);
    expect(withWrappers.nextSteps).toBe(without.nextSteps);
    expect(without).not.toHaveProperty("pluginHost");
  });

  it("is still a result when a wrapper failed, and says to retry it", () => {
    const result = manageInstallResult(
      {
        ran: true,
        remoteScript: OK,
        device: OK,
        pluginHost: [INSTALLED[0] as InstallPart & { name: string }, STUCK],
      },
      { running: true },
    );

    expect(result.pluginHost).toHaveLength(2);
    expect(result.nextSteps).toContain(
      "Plug-in hosting needs PPal Plug-in Instrument (see pluginHost): tell the user why, and call install-producer-pal again to retry.",
    );
    expect(result.nextSteps).toContain("restart Live, then");
  });

  it("is an error only when the script and the device both failed", () => {
    expect(() =>
      manageInstallResult(
        { ran: true, remoteScript: BAD, device: BAD, pluginHost: INSTALLED },
        { running: true },
      ),
    ).toThrow("nothing was installed");
    expect(
      manageInstallResult(
        { ran: true, remoteScript: OK, device: OK, pluginHost: [STUCK] },
        { running: true },
      ),
    ).toHaveProperty("remoteScript", OK);
  });
});

describe("manageInstallResult next steps", () => {
  it("sends the user to restart Live, then add-producer-pal when it isn't running", () => {
    const { nextSteps } = manageInstallResult(
      { ran: true, remoteScript: OK, device: OK },
      { running: false },
    );

    expect(nextSteps).toContain("restart Live, then");
    expect(nextSteps).toContain(
      "Then call add-producer-pal (ask the user first)",
    );
    expect(nextSteps).toContain(
      "the user can drag Producer Pal onto a MIDI track in Live right away",
    );
  });

  it("stops at the restart when Producer Pal is running", () => {
    const { nextSteps } = manageInstallResult(
      { ran: true, remoteScript: OK, device: OK },
      { running: true },
    );

    expect(nextSteps).toContain("restart Live, then");
    expect(nextSteps).not.toContain("add-producer-pal");
    expect(nextSteps).toContain("call ppal-connect with versionCheck: true.");
    expect(nextSteps).toContain("Never connected in this chat?");
  });

  it("leaves the connect check out when nothing is running to connect to", () => {
    const { nextSteps } = manageInstallResult(
      { ran: true, remoteScript: OK, device: OK },
      { running: false },
    );

    expect(nextSteps).not.toContain("versionCheck");
  });

  it("retries a failed device with install-producer-pal when running", () => {
    const { nextSteps } = manageInstallResult(
      { ran: true, remoteScript: OK, device: BAD },
      { running: true },
    );

    expect(nextSteps).toContain(
      "Call install-producer-pal again to retry the device.",
    );
    expect(nextSteps).not.toContain("add-producer-pal");
  });

  it("offers dragging the device in by hand when only the script failed", () => {
    const { nextSteps } = manageInstallResult(
      { ran: true, remoteScript: BAD, device: OK },
      { running: false },
    );

    expect(nextSteps).toContain(
      "the user can drag Producer Pal onto a MIDI track in Live right away",
    );
    expect(
      manageInstallResult(
        { ran: true, remoteScript: BAD, device: OK },
        { running: true },
      ).nextSteps,
    ).not.toContain("drag");
  });

  it("says a reason both parts share once", () => {
    expect(() =>
      manageInstallResult(
        {
          ran: true,
          remoteScript: { ok: false, detail: "disk full." },
          device: { ok: false, detail: "disk full" },
        },
        { running: false },
      ),
    ).toThrow(/^nothing was installed: disk full\.$/);
  });

  it("names both reasons, without their closing periods, when both failed", () => {
    expect(() =>
      manageInstallResult(
        {
          ran: true,
          remoteScript: { ok: false, detail: "no script" },
          device: { ok: false, detail: "no device." },
        },
        { running: false },
      ),
    ).toThrow(
      "nothing was installed. Remote script: no script. Device: no device.",
    );
  });
});

describe("canonicalManageAction", () => {
  it("maps the retired install name, and leaves everything else alone", () => {
    expect(canonicalManageAction("install-remote-script")).toBe(
      "install-producer-pal",
    );
    expect(canonicalManageAction("install-producer-pal")).toBe(
      "install-producer-pal",
    );
    expect(canonicalManageAction("undo")).toBe("undo");
    expect(canonicalManageAction("toString")).toBe("toString");
    expect(canonicalManageAction(undefined)).toBeUndefined();
    expect(canonicalManageAction(7)).toBe(7);
  });
});
