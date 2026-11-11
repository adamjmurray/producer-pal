// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Request } from "express";
import { isLocalPeerRequest } from "../test-switch-guard.ts";
import { isSameOriginRequest } from "./request-origin.ts";

export const TURN_ON_REFUSED =
  "Other devices can only be allowed to connect from the computer running " +
  "Live: use the chat UI at localhost, or the toggle on the device.";

/**
 * Whether a request to turn network access on provably comes from a person at
 * this computer, not from another device or a web page of another site. Every
 * check must pass:
 *
 * - The connection is from loopback, with a loopback `Host` and no proxy
 *   headers ({@link isLocalPeerRequest}). A tunnel client runs here and
 *   connects from loopback too, but passes its public name as `Host`.
 * - A browser's `Origin`, if sent, is this server's own loopback origin.
 *   `Origin: null` and foreign origins fail. The Host is already loopback, so
 *   same origin means a loopback origin on this server.
 * - `Sec-Fetch-Site`, if sent, is `same-origin` (or `none`).
 *
 * Headers a page can't set (`Origin`, `Sec-Fetch-Site`) are only ever used to
 * refuse. Their absence proves nothing, so the loopback connection must pass.
 *
 * @param req - Express request
 * @returns true when the request may turn network access on
 */
export function isFromThisComputer(req: Request): boolean {
  if (!isLocalPeerRequest(req)) {
    return false;
  }

  const origin = req.get("Origin");

  if (origin != null && !isSameOriginRequest(origin, req)) {
    return false;
  }

  const site = req.get("Sec-Fetch-Site");

  return site == null || site === "same-origin" || site === "none";
}
