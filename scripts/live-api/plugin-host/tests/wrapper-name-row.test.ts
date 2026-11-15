// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { loadWrapper } from "./wrapper-test-helpers.ts";

describe("wrapper name row", () => {
  it("hides the name while it matches the device's name", () => {
    const rig = loadWrapper();

    rig.run('showName("Plug")');

    expect(rig.nameRow).toStrictEqual({ text: "Plug", hidden: 1 });
  });

  it("shows a name that differs from the device's name", () => {
    const rig = loadWrapper();

    rig.device.name = "My synth";
    rig.run('showName("Plug")');

    expect(rig.nameRow).toStrictEqual({ text: "Plug", hidden: 0 });
  });

  it("always shows 'No plug-in loaded'", () => {
    const rig = loadWrapper(null);

    rig.device.name = "No plug-in loaded";
    rig.run("showName(null)");

    expect(rig.nameRow).toStrictEqual({ text: "No plug-in loaded", hidden: 0 });
  });

  it("shows the name when the device's name can't be read", () => {
    const rig = loadWrapper();

    rig.device.name = null;
    rig.run('showName("Plug")');

    expect(rig.nameRow).toStrictEqual({ text: "Plug", hidden: 0 });
  });

  it("follows a rename of the device", () => {
    const rig = loadWrapper();

    rig.run("state.plugin = 'Plug'");
    rig.run('showName("Plug")');
    rig.device.name = "Lead";
    rig.run('onDeviceName(["name", "Lead"])');
    expect(rig.nameRow).toStrictEqual({ text: "Plug", hidden: 0 });

    rig.device.name = "Plug";
    rig.run('onDeviceName(["name", "Plug"])');
    expect(rig.nameRow).toStrictEqual({ text: "Plug", hidden: 1 });
  });

  it("ignores other observed properties", () => {
    const rig = loadWrapper();

    rig.run('onDeviceName(["is_active", 1])');

    expect(rig.nameRow).toStrictEqual({ text: null, hidden: null });
  });

  it("falls back to the name the Set kept when a plug-in is loaded", () => {
    const rig = loadWrapper("Plug");

    rig.run("loadedFile = () => 'Plug'");
    rig.run('onDeviceName(["name", "Other"])');

    expect(rig.nameRow.text).toBe("Plug");
  });

  it("observes the device's name once the device has loaded", () => {
    const rig = loadWrapper();

    // Nothing observed before the delayed task runs: LiveAPI isn't ready yet.
    expect(rig.observers).toHaveLength(0);

    rig.run("nameWatchTask.fn()");

    const watcher = rig.observers.find((o) => o.path === "this_device");

    expect(watcher).toBeDefined();
    expect(watcher?.api.property).toBe("name");

    // The observer's first call, with the current name, sets the row.
    (watcher!.callback as (args: unknown[]) => void)(["name", "Plug"]);
    expect(rig.nameRow).toStrictEqual({ text: "Plug", hidden: 1 });
  });
});
