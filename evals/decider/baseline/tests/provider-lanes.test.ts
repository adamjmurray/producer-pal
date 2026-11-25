// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { providerLanes } from "../provider-lanes.ts";

/**
 * Run `count` calls through a lane and report the most in flight at once.
 *
 * @param run - The lane's run function
 * @param provider - The provider to run on
 * @param count - Calls to start
 * @returns The peak number of overlapping calls
 */
async function peak(
  run: ReturnType<typeof providerLanes>["run"],
  provider: "ollama" | "typesafe",
  count: number,
): Promise<number> {
  let active = 0;
  let most = 0;

  await Promise.all(
    Array.from({ length: count }, () =>
      run(provider, async () => {
        active++;
        most = Math.max(most, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active--;
      }),
    ),
  );

  return most;
}

describe("providerLanes", () => {
  it("uses each provider's default limit", () => {
    const lanes = providerLanes();

    expect(lanes.limit("ollama")).toBe(1);
    expect(lanes.limit("typesafe")).toBe(4);
  });

  it("lets an override replace every default", () => {
    expect(providerLanes(2).limit("ollama")).toBe(2);
  });

  it("holds a lane to its limit", async () => {
    const lanes = providerLanes();

    expect(await peak(lanes.run, "ollama", 4)).toBe(1);
    expect(await peak(lanes.run, "typesafe", 6)).toBe(4);
  });

  it("runs different providers at the same time", async () => {
    const lanes = providerLanes();
    let ollamaActive = false;
    let overlapped = false;

    await Promise.all([
      lanes.run("ollama", async () => {
        ollamaActive = true;
        await new Promise((resolve) => setTimeout(resolve, 5));
        ollamaActive = false;
      }),
      lanes.run("typesafe", async () => {
        overlapped = ollamaActive;
      }),
    ]);

    expect(overlapped).toBe(true);
  });

  it("frees the slot when a call throws", async () => {
    const lanes = providerLanes();
    const failing = lanes.run("ollama", async () => {
      throw new Error("boom");
    });
    const next = lanes.run("ollama", async () => "ok");

    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});
