// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Notation } from "#src/shared/notation.ts";
import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import {
  withGlobalContext,
  withProjectContext,
} from "../global-context/global-context-inject.ts";
import { withMemory } from "../memory/memory-inject.ts";
import { withSkills } from "../skills-inject.ts";
import { type WrappedCallLiveApi } from "./connect-append.ts";
import { withNextStep } from "./next-step-inject.ts";

/** The live device settings the connect-enrichment blocks depend on. */
export interface ConnectEnrichmentConfig {
  notation: Notation;
  smallModelMode: boolean;
  /** This Live Set's context blob, held by the Max device (config, not fs). */
  projectContext: string;
  /**
   * The tools this caller can call — the global whitelist, or one request's
   * narrowed set. Skills fragments teaching only tools that are off are dropped,
   * as is the memory index when ppal-context is gone. Omitted ⇒ no gating.
   */
  tools?: readonly string[];
}

/**
 * Compose the full ppal-connect enrichment chain. Everything but the project
 * blob reads the filesystem, which only Node can do — V8's connect() builds
 * neither the skills nor any context block, and no longer carries nextStep.
 *
 * Order is the point of this function. Blocks land inner-to-outer, so a
 * successful connect response reads: skills, project context, global context,
 * memory index, next step. withNextStep MUST stay outermost — it reads the same
 * context and memory the blocks before it carry (to decide whether this is a
 * user we know nothing about) and its instruction only works as the final word.
 * Settings arrive through a getter because the device can change them between
 * requests; createMcpServer is rebuilt per POST /mcp for the same reason.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getConfig - Reads the current device settings
 * @returns A callLiveApi whose ppal-connect results carry every block
 */
export function enrichConnect(
  inner: CallLiveApiFunction,
  getConfig: () => ConnectEnrichmentConfig,
): WrappedCallLiveApi {
  return withNextStep(
    withMemory(
      withGlobalContext(
        withProjectContext(
          withSkills(inner, () => ({
            notation: getConfig().notation,
            smallModelMode: getConfig().smallModelMode,
            tools: getConfig().tools,
          })),
          () => getConfig().projectContext,
        ),
      ),
      () => ({
        smallModelMode: getConfig().smallModelMode,
        tools: getConfig().tools,
      }),
    ),
    () => ({
      smallModelMode: getConfig().smallModelMode,
      projectContext: getConfig().projectContext,
    }),
  );
}
