// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect } from "vitest";
import { dispatchNodeRoute } from "../../../../tests/config-dir-test-helpers.ts";
import {
  type FakeAnswer,
  type FakeRemoteScript,
  callUntilItTimesOut,
} from "../remote-script-test-helpers.ts";

/**
 * Expects a write the remote script never answers to fail as a timeout.
 * @param answerWith - Starts the stand-in remote script
 * @param route - The write route
 * @param args - The write's args, without expiresInMs
 */
export async function expectUnansweredWriteTimesOut(
  answerWith: (answer: FakeAnswer) => Promise<FakeRemoteScript>,
  route: string,
  args: object,
): Promise<void> {
  const remote = await answerWith(null);

  expect(
    await callUntilItTimesOut(remote, 60, () =>
      dispatchNodeRoute(route, { ...args, expiresInMs: 40 }),
    ),
  ).toStrictEqual({
    success: false,
    error: "the Producer Pal remote script did not answer in time",
  });
}
