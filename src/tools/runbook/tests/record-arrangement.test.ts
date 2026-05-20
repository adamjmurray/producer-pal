// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordArrangement } from "../record-arrangement.ts";

describe("ppal-record-arrangement runbook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("minimal flow (no durationSeconds) leaves transport running for caller-driven stop", () => {
    const result = recordArrangement({});
    const labels = result.steps.map((s) => s.label);
    const keySteps = result.steps.filter(
      (s) => s.action === "key" && s.text === "Tab",
    );

    expect(keySteps).toHaveLength(0);
    expect(labels[0]).toBe("click Record button");
    // No durationSeconds means the recipe stops at "record started" anchor
    // and lets the caller dispatch the stop themselves.
    expect(labels).not.toContain("stop transport");
    expect(labels.at(-1)).toBe("anchor: record started (lamp should be red)");
  });

  it("durationSeconds set: recipe emits the stop + final-screenshot sequence", () => {
    const result = recordArrangement({ durationSeconds: 4 });
    const labels = result.steps.map((s) => s.label);

    expect(labels).toContain("stop transport");
    expect(labels.at(-1)).toBe("anchor: final state after record + save");
  });

  it("view='arrangement' emits a verify-screenshot, NOT a Tab keypress (Tab toggles, would be unsafe)", () => {
    const result = recordArrangement({ view: "arrangement" });
    const labels = result.steps.map((s) => s.label);
    const tabSteps = result.steps.filter(
      (s) => s.action === "key" && s.text === "Tab",
    );

    expect(tabSteps).toHaveLength(0);
    expect(labels).toContain(
      "anchor: caller must verify 'arrangement' view before record",
    );
  });

  it("view='session' emits a verify-screenshot, NOT a Tab keypress", () => {
    const result = recordArrangement({ view: "session" });
    const labels = result.steps.map((s) => s.label);

    expect(labels).toContain(
      "anchor: caller must verify 'session' view before record",
    );
  });

  it("homeBeforeRecord pushes Home key before record click", () => {
    const result = recordArrangement({ homeBeforeRecord: true });
    const labels = result.steps.map((s) => s.label);
    const homeIdx = labels.indexOf("reset Insert Marker to 1.1.1");
    const recordIdx = labels.indexOf("click Record button");

    expect(homeIdx).toBeGreaterThanOrEqual(0);
    expect(homeIdx).toBeLessThan(recordIdx);
  });

  it("durationSeconds=2 inserts a 2s wait between record and stop", () => {
    const result = recordArrangement({ durationSeconds: 2 });
    const recordIdx = result.steps.findIndex(
      (s) => s.label === "click Record button",
    );
    const stopIdx = result.steps.findIndex((s) => s.label === "stop transport");
    const waitStep = result.steps
      .slice(recordIdx, stopIdx)
      .find((s) => s.action === "wait" && s.duration === 2);

    expect(waitStep).toBeTruthy();
  });

  it("saveAfter='save' with durationSeconds adds cmd+s after the stop", () => {
    const result = recordArrangement({
      durationSeconds: 4,
      saveAfter: "save",
    });
    const labels = result.steps.map((s) => s.label);

    expect(labels).toContain("Save Set (cmd+s)");
  });

  it("saveAfter='save-as' with savePath uses cmd+shift+s + save-dialog pattern", () => {
    const result = recordArrangement({
      durationSeconds: 4,
      saveAfter: "save-as",
      savePath: "/Users/x/sets/take-001.als",
    });
    const labels = result.steps.map((s) => s.label);

    expect(labels).toContain("Save Set As (cmd+shift+s)");
    expect(labels).toContain("type filename take-001.als");
    expect(labels).toContain("type parent directory /Users/x/sets");
  });

  it("saveAfter='save-as' without savePath warns, notes the missing path, and emits NO save steps (Codex CRITICAL fix)", async () => {
    const consoleModule = await import("#src/shared/v8-max-console.ts");
    const warn = vi.spyOn(consoleModule, "warn").mockImplementation(() => {});

    const result = recordArrangement({
      durationSeconds: 4,
      saveAfter: "save-as",
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("saveAfter='save-as' requires savePath"),
    );
    expect(
      result.meta.notes.some((n) => n.startsWith("savePath missing")),
    ).toBe(true);
    const labels = result.steps.map((s) => s.label);

    // Recipe must NOT emit cmd+shift+s alone — would open a modal dialog
    // with no follow-up steps. Caller is informed via warn+notes only.
    expect(labels).not.toContain("Save Set As (cmd+shift+s)");
    expect(labels.some((l) => l.startsWith("type parent directory"))).toBe(
      false,
    );
    warn.mockRestore();
  });

  it("saveAfter='none' produces no save-key steps", () => {
    const result = recordArrangement({ saveAfter: "none" });
    const labels = result.steps.map((s) => s.label);

    expect(labels.some((l) => l.startsWith("Save Set"))).toBe(false);
  });

  it("failModes covers at least 8 distinct symptoms", () => {
    const result = recordArrangement({});

    expect(result.failModes.length).toBeGreaterThanOrEqual(8);
    const symptoms = new Set(result.failModes.map((f) => f.symptom));

    expect(symptoms.size).toBe(result.failModes.length);
  });

  it("verify schema: transport stop and dirty flag both depend on durationSeconds being set", () => {
    // Without durationSeconds: transport keeps running, no save step emitted.
    const manual = recordArrangement({ saveAfter: "save" });

    expect(manual.verify).toStrictEqual({
      transportShouldBeStopped: false,
      setDirty: true,
    });
    // With durationSeconds + save: full sequence emitted.
    const driven = recordArrangement({
      durationSeconds: 4,
      saveAfter: "save",
    });

    expect(driven.verify).toStrictEqual({
      transportShouldBeStopped: true,
      setDirty: false,
    });
  });

  it("meta carries tool name, version, abletonLocale default, estimatedSeconds", () => {
    const r = recordArrangement({ durationSeconds: 3, saveAfter: "save" });

    expect(r.meta.tool).toBe("ppal-record-arrangement");
    expect(r.meta.version).toBe("1.0.0");
    expect(r.meta.abletonLocale).toBe("unknown");
    expect(r.meta.estimatedSeconds).toBeGreaterThan(3);
  });

  it("step order: View-Verify-Screenshot BEFORE Record, Record BEFORE Stop, Stop BEFORE Save", () => {
    const result = recordArrangement({
      view: "arrangement",
      durationSeconds: 4,
      saveAfter: "save",
    });
    const labels = result.steps.map((s) => s.label);
    const verifyIdx = labels.indexOf(
      "anchor: caller must verify 'arrangement' view before record",
    );
    const recordIdx = labels.indexOf("click Record button");
    const stopIdx = labels.indexOf("stop transport");
    const saveIdx = labels.indexOf("Save Set (cmd+s)");

    expect(verifyIdx).toBeLessThan(recordIdx);
    expect(recordIdx).toBeLessThan(stopIdx);
    expect(stopIdx).toBeLessThan(saveIdx);
  });

  it("CRITICAL fix: setDirty is true when save-as is requested without savePath (no save actually happened)", async () => {
    const consoleModule = await import("#src/shared/v8-max-console.ts");
    const warn = vi.spyOn(consoleModule, "warn").mockImplementation(() => {});

    const result = recordArrangement({
      durationSeconds: 4,
      saveAfter: "save-as",
      // savePath deliberately missing
    });

    expect(result.verify.setDirty).toBe(true);
    warn.mockRestore();
  });

  it("CRITICAL fix: setDirty is true when save-as has empty-string savePath (treated as missing)", async () => {
    const consoleModule = await import("#src/shared/v8-max-console.ts");
    const warn = vi.spyOn(consoleModule, "warn").mockImplementation(() => {});

    const result = recordArrangement({
      durationSeconds: 4,
      saveAfter: "save-as",
      savePath: "",
    });

    expect(result.verify.setDirty).toBe(true);
    warn.mockRestore();
  });

  it("setDirty is false when save-as has a valid savePath AND durationSeconds is set", () => {
    const result = recordArrangement({
      durationSeconds: 4,
      saveAfter: "save-as",
      savePath: "/tmp/take-001.als",
    });

    expect(result.verify.setDirty).toBe(false);
  });

  it("verify.setDirty is true when saveAfter is undefined (no save happened)", () => {
    const r = recordArrangement({});

    expect(r.verify.setDirty).toBe(true);
  });

  it("verify.setDirty is false only when an actual save step was emitted (requires durationSeconds)", () => {
    // Without durationSeconds the save step is never emitted, regardless
    // of saveAfter mode - transport keeps running and the caller stops it.
    const saved = recordArrangement({
      durationSeconds: 4,
      saveAfter: "save",
    });

    expect(saved.verify.setDirty).toBe(false);
    const saveAs = recordArrangement({
      durationSeconds: 4,
      saveAfter: "save-as",
      savePath: "/tmp/x.als",
    });

    expect(saveAs.verify.setDirty).toBe(false);
    const explicitNone = recordArrangement({
      durationSeconds: 4,
      saveAfter: "none",
    });

    expect(explicitNone.verify.setDirty).toBe(true);
  });

  it("estimatedSeconds for minimal manual-stop flow is 0 (no recipe-driven wait)", () => {
    const r = recordArrangement({});

    expect(r.meta.estimatedSeconds).toBe(0);
  });

  it("estimatedSeconds for duration-driven flow adds the recording duration + overhead", () => {
    const minimal = recordArrangement({ durationSeconds: 4 });

    expect(minimal.meta.estimatedSeconds).toBe(5); // 4 + 1
    const withSave = recordArrangement({
      durationSeconds: 4,
      saveAfter: "save",
    });

    expect(withSave.meta.estimatedSeconds).toBeCloseTo(5.4, 5); // 4 + 1.4
  });

  it("save-as with empty-string savePath triggers the warn+notes path (treated as missing)", async () => {
    const consoleModule = await import("#src/shared/v8-max-console.ts");
    const warn = vi.spyOn(consoleModule, "warn").mockImplementation(() => {});

    const result = recordArrangement({
      durationSeconds: 4,
      saveAfter: "save-as",
      savePath: "",
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("saveAfter='save-as' requires savePath"),
    );
    expect(
      result.meta.notes.some((n) => n.startsWith("savePath missing")),
    ).toBe(true);
    warn.mockRestore();
  });

  it("splitSavePath throws on empty string or trailing slash (cannot derive filename)", async () => {
    const { splitSavePath } = await import("../helpers/build-record-steps.ts");

    expect(() => splitSavePath("")).toThrow(/destPath must include a filename/);
    expect(() => splitSavePath("/foo/")).toThrow(
      /destPath must include a filename/,
    );
  });

  it("splitSavePath handles root-level file with no parent dir", async () => {
    const { splitSavePath } = await import("../helpers/build-record-steps.ts");

    expect(splitSavePath("/foo.als")).toStrictEqual({
      dir: "/",
      name: "foo.als",
    });
  });

  it("splitSavePath handles relative path (no slash)", async () => {
    const { splitSavePath } = await import("../helpers/build-record-steps.ts");

    expect(splitSavePath("session.als")).toStrictEqual({
      dir: ".",
      name: "session.als",
    });
  });
});
