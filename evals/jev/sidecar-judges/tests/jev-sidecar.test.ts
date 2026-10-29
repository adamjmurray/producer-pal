// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  criteriaHash,
  judgeSlug,
  readSidecar,
  sidecarPath,
  writeSidecar,
  type SidecarVerdict,
} from "../jev-sidecar.ts";

const verdict = (criteria: string): SidecarVerdict => ({
  version: 1,
  file: join("run1", "a--m.json"),
  scenarioId: "a",
  slug: "codex-code_luna",
  judge: { provider: "codex-code", requestedModel: "luna", model: "luna" },
  criteriaHash: criteriaHash(criteria),
  judgedAt: "2026-10-29T00:00:00.000Z",
  durationMs: 5,
  checksPass: true,
  pass: false,
  issues: ["bad"],
});

describe("judgeSlug", () => {
  it("makes a folder name from provider/model", () => {
    expect(judgeSlug("codex-code/luna")).toBe("codex-code_luna");
    expect(judgeSlug("anthropic/claude-haiku-5-5")).toBe(
      "anthropic_claude-haiku-5-5",
    );
  });

  it("leaves a slug alone", () => {
    expect(judgeSlug("codex-code_luna")).toBe("codex-code_luna");
  });

  it("replaces characters that are unsafe in a path", () => {
    expect(judgeSlug("a/b:c d")).toBe("a_b_c_d");
  });
});

describe("criteriaHash", () => {
  it("differs for different text and repeats for the same", () => {
    expect(criteriaHash("a")).toBe(criteriaHash("a"));
    expect(criteriaHash("a")).not.toBe(criteriaHash("b"));
    expect(criteriaHash("a")).toHaveLength(12);
  });
});

describe("sidecar files", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-sidecar-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it("stores a verdict beside the run, one folder per judge", async () => {
    const v = verdict("C");

    await writeSidecar(dir, v);

    const path = join(dir, "run1", "judges", "codex-code_luna", "a--m.json");

    expect(sidecarPath(dir, v.file, v.slug)).toBe(path);
    expect(JSON.parse(await readFile(path, "utf8"))).toStrictEqual(v);
    expect(await readSidecar(dir, v.file, v.slug, "C")).toStrictEqual(v);
  });

  it("reads nothing for a missing or unparseable file", async () => {
    expect(await readSidecar(dir, "run1/x.json", "s", "C")).toBeUndefined();

    await writeSidecar(dir, { ...verdict("C"), pass: "maybe" as never });

    expect(
      await readSidecar(dir, verdict("C").file, "codex-code_luna", "C"),
    ).toBeUndefined();
  });

  it("treats a verdict for other criteria as missing", async () => {
    await writeSidecar(dir, verdict("old criteria"));

    expect(
      await readSidecar(dir, verdict("x").file, "codex-code_luna", "new"),
    ).toBeUndefined();
  });
});
