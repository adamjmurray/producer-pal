// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Request, type Response } from "express";
import { isLoopbackHost } from "#src/shared/config.ts";

// POST /config fields that fake the remote script's state. Only a client on
// this machine may send them.
const TEST_SWITCHES = ["remoteScriptEnabled", "remoteScriptMinVersion"];

// Headers a reverse proxy or tunnel adds (ngrok, cloudflared). `x-forwarded-*`
// is matched by prefix.
const PROXY_HEADERS = new Set([
  "forwarded",
  "via",
  "x-real-ip",
  "cf-connecting-ip",
  "cf-ray",
  "true-client-ip",
]);

const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * Whether the request came from a client on this machine. The server listens on
 * all interfaces, so the peer address is checked, not just Origin. An HTTP
 * tunnel running here also connects from loopback, so a request with proxy
 * headers or a non-loopback `Host` is treated as remote. Best-effort: a raw TCP
 * forwarder (`ssh -R`, socat) passes the client's own headers and can't be told
 * apart.
 *
 * @param req - Express request
 * @returns true when the peer is loopback and nothing marks it as proxied
 */
export function isLocalPeerRequest(req: Request): boolean {
  const address = req.socket.remoteAddress?.toLowerCase();

  if (address == null) {
    return false;
  }

  const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;

  if (address !== "::1" && !LOOPBACK_V4.test(v4)) {
    return false;
  }

  const proxied = Object.keys(req.headers).some(
    (name) => PROXY_HEADERS.has(name) || name.startsWith("x-forwarded-"),
  );

  // A tunnel passes the public hostname as Host; local clients use a loopback
  // name. DNS rebinding is refused the same way.
  const host = req.get("host");

  return !proxied && host != null && isLoopbackHost(host);
}

/**
 * Refuse a POST /config body that sets a remote script test switch unless the
 * request came from this machine. A refused request changes nothing, including
 * the other fields in the same body.
 *
 * @param req - Express request
 * @param res - Express response (a 403 is written when rejected)
 * @param body - The request body
 * @returns true if the request was rejected (403 written); false to proceed
 */
export function rejectNonLocalTestSwitches(
  req: Request,
  res: Response,
  body: Record<string, unknown>,
): boolean {
  const sent = TEST_SWITCHES.filter((name) => body[name] !== undefined);

  if (sent.length === 0 || isLocalPeerRequest(req)) {
    return false;
  }

  res.status(403).json({
    error: `${sent.join(", ")} can only be set from the machine Producer Pal runs on`,
  });

  return true;
}
