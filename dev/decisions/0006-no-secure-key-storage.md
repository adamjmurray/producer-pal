# ADR-0006: Provider keys — encrypted at rest in the browser, no backend proxy

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Context

The chat UI calls LLM providers with the user's own API keys. Two questions:
where do those keys live, and do we keep them out of the browser entirely (e.g.
behind a Producer Pal backend that proxies provider calls)?

## Decision

Keys stay client-side and are **encrypted at rest**:

- Stored in `localStorage` as `enc:v1:<base64 iv>:<base64 ciphertext>`
  envelopes, encrypted with a 256-bit **non-extractable** AES-GCM `CryptoKey`
  persisted in IndexedDB (`producer-pal-crypto`). Plaintext never sits in
  `localStorage`. See `webui/src/lib/api-key-crypto.ts`.
- **No Producer Pal backend / LLM proxy** — the browser calls the chosen
  provider directly with the user's key.
- The filesystem config (`~/.producer-pal`) holds only non-secret, user-facing
  config; keys are not written there.

This at-rest encryption is explicitly an **interim stopgap** for the
localhost/own-key threat model — not OS-level protection. In-origin code
execution can still ask the non-extractable key to decrypt. The UI says so:
_"API keys are encrypted at rest in your browser; this is not a substitute for
OS-level protection."_

## Alternatives rejected / deferred

- **Plaintext storage** — rejected; the envelope scheme keeps cleartext out of
  `localStorage` at negligible cost (Web Crypto, no dependency).
- **Backend LLM proxy holding keys server-side** — not done. It would put
  Producer Pal in the path of the user's traffic and keys and invert the "your
  key, your provider, your machine, nothing leaves except the call you chose"
  model (`SECURITY.md`). The earlier secure-storage / NfM-proxy tickets were
  cancelled.
- **OS keychain / fully robust secure storage** — deferred as over-engineering
  for a localhost tool. The versioned stopgap (`enc:v1:`) plus honest in-product
  disclosure is the pragmatic middle; the "real fix" is a future backend move if
  one ever happens.

## Consequences

- Honest security posture, surfaced in-product rather than overstated.
- The envelope is version-tagged (`enc:v1:`), so the scheme can evolve without a
  data migration scramble.
- Aligns with the project's pragmatism stance — defensive hardening is flagged,
  not ground on, for localhost/own-key surfaces.
- Revisit trigger: Producer Pal ever brokers third-party keys or runs as a
  hosted service → real backend secret management, superseding this ADR.
