// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { refuseParamsOutsideAction } from "../refuse-params-outside-action.ts";

const HOMES = {
  similarTo: { action: ["find-similar"] },
  tags: { action: ["search", "find-similar", "find-duplicates"] },
  query: { action: ["search", "find-similar"] },
  name: { scope: ["memory"] },
  description: { scope: ["memory"], action: ["write"] },
};

describe("refuseParamsOutsideAction", () => {
  it("names the param, where it applies, and what the call has", () => {
    expect(() =>
      refuseParamsOutsideAction(
        { action: "search" },
        { similarTo: "/a.wav" },
        HOMES,
      ),
    ).toThrow(
      'similarTo is only for action "find-similar"; this call has action ' +
        '"search". Change the action or drop similarTo.',
    );
  });

  it("lists several actions that read the param", () => {
    expect(() =>
      refuseParamsOutsideAction(
        { action: "list-tags" },
        { tags: "Kick" },
        HOMES,
      ),
    ).toThrow(
      'tags is only for action "search", "find-similar" or "find-duplicates"',
    );
    expect(() =>
      refuseParamsOutsideAction({ action: "list-tags" }, { query: "k" }, HOMES),
    ).toThrow('query is only for action "search" or "find-similar"');
  });

  it("joins params that share a home and separates those that don't", () => {
    expect(() =>
      refuseParamsOutsideAction(
        { action: "list-tags" },
        { similarTo: "/a.wav", tags: "Kick", query: "k" },
        HOMES,
      ),
    ).toThrow(
      /^similarTo is only for action "find-similar"; tags is only for .*; query is only for .*; this call has action "list-tags"\. Change the action or drop similarTo, tags, query\.$/,
    );
  });

  it("checks each axis, and tells the caller to change the call when both miss", () => {
    expect(() =>
      refuseParamsOutsideAction(
        { action: "read", scope: "project" },
        { description: "hook" },
        HOMES,
      ),
    ).toThrow(
      'description is only for scope "memory" and action "write"; this call ' +
        'has action "read" and scope "project". Change the call or drop ' +
        "description.",
    );
  });

  it("passes a param whose action reads it", () => {
    expect(() =>
      refuseParamsOutsideAction(
        { action: "find-similar" },
        { similarTo: "/a.wav", tags: "Kick" },
        HOMES,
      ),
    ).not.toThrow();
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["blank", "  "],
    ["the word null", "null"],
  ])("counts %s as not sent", (_label, value) => {
    expect(() =>
      refuseParamsOutsideAction(
        { action: "search" },
        { similarTo: value },
        HOMES,
      ),
    ).not.toThrow();
  });

  it("counts false and 0 as sent", () => {
    expect(() =>
      refuseParamsOutsideAction(
        { action: "search" },
        { similarTo: false },
        HOMES,
      ),
    ).toThrow("similarTo");
    expect(() =>
      refuseParamsOutsideAction({ action: "search" }, { similarTo: 0 }, HOMES),
    ).toThrow("similarTo");
  });

  it("ignores args it has no rule for", () => {
    expect(() =>
      refuseParamsOutsideAction({ action: "search" }, { limit: 5 }, HOMES),
    ).not.toThrow();
  });
});
