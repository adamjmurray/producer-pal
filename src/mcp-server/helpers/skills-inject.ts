// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  buildSkills,
  type BuildSkillsOptions,
} from "#src/skills/build-skills.ts";
import { type CallLiveApiFunction } from "../create-mcp-server.ts";
import * as console from "../node-for-max-logger.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "./connect/connect-append.ts";
import { readSkillOverrides } from "./skill-overrides-store.ts";

/**
 * Wrap a callLiveApi so a successful ppal-connect response carries the Producer
 * Pal Skills as a distinct content block, assembled Node-side with any user
 * fragment overrides (~/.producer-pal/skills) applied.
 *
 * Skills are assembled here rather than in the V8 connect() handler because the
 * override files are only readable from Node (V8 has no filesystem). The block
 * is self-labeled (it starts with the "# Producer Pal Skills" header), so it is
 * appended raw — no extra framing. Notation/small-model context is read from
 * the live device config via `getContext` at call time. Assembly warnings from
 * a broken user override (unknown fragments, refused nesting, unsafe refs, or an
 * override keyed to a retired slot) are logged to the Max window so the blob
 * doesn't silently shorten.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getContext - Reads the current notation/small-model settings
 * @returns A callLiveApi that appends the skills block to ppal-connect results
 */
export function withSkills(
  inner: CallLiveApiFunction,
  getContext: () => BuildSkillsOptions,
): WrappedCallLiveApi {
  return withConnectAppend(inner, () =>
    buildSkills(getContext(), readSkillOverrides(), (message) =>
      console.warn(`Producer Pal Skills: ${message}`),
    ),
  );
}
