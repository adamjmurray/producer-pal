// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  defaultSettingsMiddleware,
  type LanguageModel,
  wrapLanguageModel,
} from "ai";

type GatewayModel = Parameters<typeof wrapLanguageModel>[0]["model"];

/**
 * Ask the Vercel gateway to add prompt-cache breakpoints itself. Set for every
 * model: the gateway leaves providers that cache automatically alone. Merged
 * with per-call provider options, so thinking settings still apply.
 *
 * @param model - Gateway model from `createGateway`
 * @returns The model with gateway caching switched on
 */
export function cacheVercelModel(model: GatewayModel): LanguageModel {
  return wrapLanguageModel({
    model,
    middleware: defaultSettingsMiddleware({
      settings: { providerOptions: { gateway: { caching: "auto" } } },
    }),
  });
}
