# ADR-0006: Provider keys — encrypted at rest in the browser, no backend proxy

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

The chat UI calls LLM providers with the user's own API keys. Where do those
keys live, and should we keep them out of the browser entirely by proxying
provider calls through a Producer Pal backend?

## Decision

Keys stay client-side, encrypted at rest, and no Producer Pal backend ever sees
them.

- `localStorage` holds `enc:v1:<base64 iv>:<base64 ciphertext>` envelopes,
  encrypted with a non-extractable 256-bit AES-GCM key kept in IndexedDB
  (`producer-pal-crypto`). Plaintext never sits in `localStorage`. See
  `webui/src/lib/api-key-crypto.ts`.
- For text chat the browser calls the provider directly.
- `~/.producer-pal` holds only non-secret config; keys are never written there.
- **Voice mode is the one exception.** The key goes to the local MCP server,
  which trades it for a short-lived token
  (`src/mcp-server/routes/voice-token-route.ts`). Gemini's route currently
  returns the key as-is, since the browser opens its WebSocket to Google
  directly and the key would reach Google anyway — the route exists for
  local-origin gating and to leave room for ephemeral tokens later. The key is
  never logged or stored, but it does pass through the local process. This is a
  local key exchange, not the rejected proxy: no Producer Pal-operated server is
  involved and no LLM traffic flows through it.

The encryption is an interim stopgap for the localhost/own-key threat model, not
OS-level protection — code running in the origin can still ask the
non-extractable key to decrypt. The UI says exactly that.

## Alternatives rejected

- **Plaintext storage** — the envelope scheme keeps cleartext out of
  `localStorage` for almost nothing (Web Crypto, no dependency).
- **A backend proxy holding keys server-side** — it would put Producer Pal in
  the path of the user's traffic and keys, inverting the "your key, your
  provider, your machine" model in `SECURITY.md`.
- **OS keychain / fully robust secure storage** — over-engineering for a
  localhost tool. Deferred.

## Consequences

- The security posture is honest and stated in-product rather than overstated.
- The `enc:v1:` version tag lets the scheme change later without a migration
  scramble.
- Revisit trigger: Producer Pal ever brokers third-party keys or runs as a
  hosted service, which would need real backend secret management and supersede
  this.
