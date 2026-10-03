# ADR-0006: Provider keys stay in the browser, encrypted; no backend proxy

- **Status:** Accepted
- **Date logged:** 2026-06-28

## Decision

The chat UI calls LLM providers directly with the user's own keys. Keys are
stored in `localStorage` encrypted with a non-extractable AES-GCM key held in
IndexedDB (`webui/src/lib/api-key-crypto.ts`), and no Producer Pal backend ever
sees them. `~/.producer-pal` never holds keys.

Voice mode is the one exception: the key goes to the local MCP server, which
trades it for a short-lived token. That is a local exchange, not a proxy. No
Producer Pal-run server is involved.

The encryption is a stopgap for the localhost, own-key threat model. Code
running in the same origin can still ask the key to decrypt. The UI says so.

## Rejected

- **Plaintext storage.** Encrypting costs almost nothing (Web Crypto, no
  dependency) and keeps cleartext out of `localStorage`.
- **A backend proxy holding keys.** It puts Producer Pal in the path of the
  user's traffic and keys, against the "your key, your provider, your machine"
  model in `SECURITY.md`.
- **OS keychain or other robust secure storage.** Too much for a localhost tool.

## Revisit if

Producer Pal brokers third-party keys or runs as a hosted service. That needs
real backend secret management.
