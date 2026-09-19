// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { stripReturnChainLetter } from "../helpers/strip-return-chain-letter.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("stripReturnChainLetter", () => {
  /**
   * A chain mock at a given Live path.
   * @param path - Live API path for the chain
   * @returns The chain LiveAPI object
   */
  function chainAt(path: string): LiveAPI {
    registerMockObject("chain-x", { path, type: "Chain" });

    return LiveAPI.from(path);
  }

  it("leaves the name alone past return chain Z", () => {
    // Live's label for the 27th return chain is unknown, so guessing a prefix
    // to strip would corrupt a name the user typed on purpose.
    const chain = chainAt(`${livePath.track(0).device(0)} return_chains 26`);

    expect(stripReturnChainLetter(chain, "A Reverb")).toBe("A Reverb");
  });

  it("strips the letter for the last chain it can name (Z)", () => {
    const chain = chainAt(`${livePath.track(0).device(0)} return_chains 25`);

    expect(stripReturnChainLetter(chain, "Z Reverb")).toBe("Reverb");
  });
});
