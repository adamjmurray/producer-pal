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

  it("minimal flow has no Tab keypress (caller controls view), clicks Record, ends with screenshot", () => {
    const result = recordArrangement({});
    const labels = result.steps.map((s) => s.label);
    const keySteps = result.steps.filter(
      (s) => s.action === "key" && s.text === "Tab",
    );

    expect(keySteps).toHaveLength(0);
    expect(labels[0]).toBe("click Record button");
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

  it("saveAfter='save' adds cmd+s after the stop", () => {
    const result = recordArrangement({ saveAfter: "save" });
    const labels = result.steps.map((s) => s.label);

    expect(labels).toContain("Save Set (cmd+s)");
  });

  it("saveAfter='save-as' with savePath uses cmd+shift+s + save-dialog pattern", () => {
    const result = recordArrangement({
      saveAfter: "save-as",
      savePath: "/Users/x/sets/take-001.als",
    });
    const labels = result.steps.map((s) => s.label);

    expect(labels).toContain("Save Set As (cmd+shift+s)");
    expect(labels).toContain("type filename take-001.als");
    expect(labels).toContain("type parent directory /Users/x/sets");
  });

  it("saveAfter='save-as' without savePath warns and notes the missing path", async () => {
    const consoleModule = await import("#src/shared/v8-max-console.ts");
    const warn = vi.spyOn(consoleModule, "warn").mockImplementation(() => {});

    const result = recordArrangement({ saveAfter: "save-as" });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("saveAfter='save-as' requires savePath"),
    );
    expect(
      result.meta.notes.some((n) => n.startsWith("savePath missing")),
    ).toBe(true);
    const labels = result.steps.map((s) => s.label);

    expect(labels).toContain("Save Set As (cmd+shift+s)");
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

  it("verify schema reports transportShouldBeStopped true and setDirty based on save mode", () => {
    const noSave = recordArrangement({ saveAfter: "none" });

    expect(noSave.verify).toStrictEqual({
      transportShouldBeStopped: true,
      setDirty: true,
    });
    const withSave = recordArrangement({ saveAfter: "save" });

    expect(withSave.verify.setDirty).toBe(false);
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

  it("verify.setDirty is true when saveAfter is undefined (no save happened)", () => {
    const r = recordArrangement({});

    expect(r.verify.setDirty).toBe(true);
  });

  it("verify.setDirty is false only when an actual save step was emitted", () => {
    const saved = recordArrangement({ saveAfter: "save" });

    expect(saved.verify.setDirty).toBe(false);
    const saveAs = recordArrangement({
      saveAfter: "save-as",
      savePath: "/tmp/x.als",
    });

    expect(saveAs.verify.setDirty).toBe(false);
    const explicitNone = recordArrangement({ saveAfter: "none" });

    expect(explicitNone.verify.setDirty).toBe(true);
  });

  it("estimatedSeconds for minimal flow has no save overhead", () => {
    const r = recordArrangement({});

    expect(r.meta.estimatedSeconds).toBe(1); // base 0 + overhead 1, no +0.4
  });

  it("estimatedSeconds for save mode adds save overhead", () => {
    const r = recordArrangement({ saveAfter: "save" });

    expect(r.meta.estimatedSeconds).toBeCloseTo(1.4, 5);
  });

  it("save-as with empty-string savePath triggers the warn+notes path (treated as missing)", async () => {
    const consoleModule = await import("#src/shared/v8-max-console.ts");
    const warn = vi.spyOn(consoleModule, "warn").mockImplementation(() => {});

    const result = recordArrangement({ saveAfter: "save-as", savePath: "" });

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
