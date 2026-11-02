// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Wrap app source into the iframe's document: policy, then prelude, then the
 * app. The app's own tags can only tighten the policy.
 *
 * @param source - The app's HTML, CSS and JS as one document
 * @returns The `srcdoc` for the app iframe
 */
export function buildAppDocument(source: string): string {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${buildAppCsp()}"><script>${APP_PRELUDE}</script>${source}`;
}

/**
 * Sandbox flags for the app iframe. Never add `allow-same-origin`: without it
 * the app gets an opaque origin and can't touch the host page, its storage or
 * its credentials. Scripts only; ordinary DOM, CSS and JS need nothing else
 * (no top navigation, popups, forms, modals or downloads).
 */
export const APP_SANDBOX = "allow-scripts";

/**
 * CSP directives for an app: no network, but inline script and style run.
 * `data:` and `blob:` are in-memory, not network.
 *
 * Seam for a future opt-in origin allowlist: add origins to `connect-src` and
 * the other fetch directives here.
 */
const APP_CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'none'"],
  // `unsafe-eval` is fine: it adds no network access, and apps may use it.
  "script-src": ["'unsafe-inline'", "'unsafe-eval'"],
  "style-src": ["'unsafe-inline'"],
  "img-src": ["data:", "blob:"],
  "font-src": ["data:"],
  "media-src": ["data:", "blob:"],
  "worker-src": ["blob:"],
  "connect-src": ["'none'"],
  "frame-src": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
};

/**
 * @returns The app policy as a CSP header value
 */
export function buildAppCsp(): string {
  return Object.entries(APP_CSP_DIRECTIVES)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

// CSP doesn't cover WebRTC (ICE traffic reaches any host), so delete its
// constructors. Direct path only: a frame the app makes gets a fresh window.
const APP_PRELUDE = `for (const name of Object.getOwnPropertyNames(window)) { if (/^(webkit|moz)?RTC/.test(name)) Reflect.deleteProperty(window, name); }`;
