// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { MANAGE_ROUTES } from "#src/tools/core/helpers/manage-contract.ts";
import { dispatchNodeRoute } from "../../../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptUndoRoutes } from "../../forwarded/remote-script-undo-routes.ts";
import {
  OUTDATED_ANSWER,
  unknownRouteAnswer,
  useFakeRemoteScriptRoutes,
} from "../remote-script-test-helpers.ts";

const answerWith = useFakeRemoteScriptRoutes(registerRemoteScriptUndoRoutes);

describe.each([
  ["undo", "/undo/undo"],
  ["redo", "/undo/redo"],
] as const)("remoteScript.undo.%s", (action, route) => {
  it("forwards to the remote script with the expiry and hands back what Live can do", async () => {
    const remote = await answerWith({
      body: { done: 1, can_undo: true, can_redo: true },
    });

    expect(
      await dispatchNodeRoute(MANAGE_ROUTES[action], { expiresInMs: 5000 }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        result: { done: 1, can_undo: true, can_redo: true },
      },
    });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route,
        query: {},
        body: { expires_in_ms: 5000 },
      },
    ]);
  });

  it("forwards the number of steps", async () => {
    const remote = await answerWith({
      body: { done: 3, can_undo: true, can_redo: true },
    });

    await dispatchNodeRoute(MANAGE_ROUTES[action], {
      steps: 3,
      expiresInMs: 5000,
    });

    expect(remote.requests[0]?.body).toStrictEqual({
      steps: 3,
      expires_in_ms: 5000,
    });
  });

  it("hands back the remote script's refusal", async () => {
    await answerWith({ status: 409, body: { error: `nothing to ${action}` } });

    expect(
      await dispatchNodeRoute(MANAGE_ROUTES[action], { expiresInMs: 5000 }),
    ).toStrictEqual({
      success: true,
      result: { available: true, error: `nothing to ${action}` },
    });
  });

  it("marks a job Live started but didn't finish as unfinished", async () => {
    await answerWith({
      status: 504,
      body: { error: "Live didn't finish it", started: true },
    });

    expect(
      await dispatchNodeRoute(MANAGE_ROUTES[action], { expiresInMs: 5000 }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: "Live didn't finish it",
        unfinished: true,
      },
    });
  });

  it("words a route an older remote script lacks as out of date", async () => {
    await answerWith(unknownRouteAnswer(route));

    expect(
      await dispatchNodeRoute(MANAGE_ROUTES[action], { expiresInMs: 5000 }),
    ).toStrictEqual({ success: true, result: OUTDATED_ANSWER });
  });

  it("needs the expiry, since it changes the Set", async () => {
    expect(await dispatchNodeRoute(MANAGE_ROUTES[action], {})).toStrictEqual({
      success: false,
      error: "expiresInMs must be a number, 0 or more",
    });
  });
});
