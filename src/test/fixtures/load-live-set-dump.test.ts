// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { loadLiveSetDump } from "./load-live-set-dump.ts";

// Guards the committed blob, not the loader: a fixture that failed to decompress
// or came back truncated would otherwise surface as a confusing failure in
// whichever budget test used it next.
describe("Live Set dump fixture", () => {
  it("decompresses to a complete dump", () => {
    const { meta } = loadLiveSetDump();

    expect(meta.truncated).toBe(false);
    expect(meta.failedReads).toBe(0);
    expect(meta.objects).toBeGreaterThan(20_000);
  });

  it("holds the object graph its meta claims", () => {
    const dump = loadLiveSetDump();

    expect(Object.keys(dump.objects)).toHaveLength(dump.meta.objects);
    expect(Object.keys(dump.aliases)).toHaveLength(dump.meta.aliases);
  });

  it("covers the shapes a hand-written mock would miss", () => {
    const dump = loadLiveSetDump();
    const paths = Object.keys(dump.objects);
    const countOf = (type: string) =>
      paths.filter((path) => dump.objects[path]?.type === type).length;

    expect(countOf("DrumPad")).toBeGreaterThan(0);
    expect(countOf("DeviceParameter")).toBeGreaterThan(20_000);
    expect(countOf("TakeLane")).toBeGreaterThan(0);
    expect(paths.some((path) => path.includes("return_chains"))).toBe(true);

    // The nested instrument rack: chains inside chains, four racks deep.
    const deepest = paths.reduce((a, b) => (b.length > a.length ? b : a));

    expect(deepest.match(/ chains \d+/g)?.length).toBeGreaterThanOrEqual(4);
  });

  // The roots are easy to drop when regenerating, and the loss is silent: the
  // tools would resolve nothing for targets they reach for on every call.
  it("resolves the roots that are not under live_set", () => {
    const dump = loadLiveSetDump();

    expect(dump.aliases.this_device).toMatch(
      /^live_set tracks \d+ devices \d+$/,
    );
    expect(dump.objects.live_app?.type).toBe("Application");
  });

  it("names no absolute filesystem path", () => {
    const dump = loadLiveSetDump();

    expect(dump.meta.redactedValues).toBeGreaterThan(0);
    expect(JSON.stringify(dump.objects)).not.toContain("/Users/");
  });
});
