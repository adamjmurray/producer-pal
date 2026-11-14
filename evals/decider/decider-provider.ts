// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The places a decider can run, and the `--decider provider/model` value that
 * picks one. All of them take the same `/v1/systemone` request and answer alike.
 */

/** The model the hosted providers use when none is named. */
export const DEFAULT_HOSTED_MODEL = "jev-latest";

const OLLAMA_DEFAULT_URL = "http://localhost:11434";
const OLLAMA_DEFAULT_PORT = "11434";

export interface DeciderProviderInfo {
  /** The full endpoint URL; read per call so OLLAMA_HOST is picked up late */
  url: () => string;
  /** The API key variable; absent when the provider needs no key */
  envVar?: string;
  /** Size cap for the state text, in characters */
  maxStateChars: number;
  /** Cap for the whole request body, in UTF-8 bytes, when the provider has one */
  maxRequestBytes?: number;
  /** Calls to run at once by default */
  defaultConcurrency: number;
}

export type DeciderProvider = "typesafe" | "openrouter" | "vercel" | "ollama";

/** Jev's input limit is 32k tokens; 80k characters stays well under it. */
const HOSTED = { maxStateChars: 80_000, defaultConcurrency: 4 };

/** Hosted Jev first (the default pick takes the first with a key), then local. */
export const DECIDER_PROVIDERS: Record<DeciderProvider, DeciderProviderInfo> = {
  typesafe: {
    ...HOSTED,
    url: () => "https://api.typesafe.ai/v1/systemone",
    envVar: "TYPESAFE_KEY",
  },
  openrouter: {
    ...HOSTED,
    url: () => "https://openrouter.ai/api/v1/systemone",
    envVar: "OPENROUTER_KEY",
  },
  vercel: {
    ...HOSTED,
    url: () => "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
    envVar: "VERCEL_AI_GATEWAY_KEY",
  },
  // Local models run one call at a time. Ollama refuses text plus schema over
  // 64 KiB, so the state leaves room for the questions.
  ollama: {
    url: () => `${ollamaBaseUrl(process.env.OLLAMA_HOST)}/v1/systemone`,
    maxStateChars: 48_000,
    maxRequestBytes: 63_000,
    defaultConcurrency: 1,
  },
};

/** Provider names in default-pick order. */
export const DECIDER_PROVIDER_NAMES = Object.keys(
  DECIDER_PROVIDERS,
) as DeciderProvider[];

const HOSTED_NAMES = DECIDER_PROVIDER_NAMES.filter(
  (n) => DECIDER_PROVIDERS[n].envVar != null,
);

/** What `--decider` names; a missing provider means the first hosted one with a key. */
export interface DeciderSpec {
  provider?: DeciderProvider;
  model?: string;
}

/** A spec resolved to what a call needs. */
export interface ResolvedDecider {
  provider: DeciderProvider;
  model: string;
  url: string;
  /** Absent for a provider that needs no key */
  apiKey?: string;
}

/**
 * Turn OLLAMA_HOST into a base URL. Ollama accepts a bare `host`, `host:port`
 * or a full URL.
 *
 * @param host - The OLLAMA_HOST value, if set
 * @returns The base URL, without a trailing slash
 */
export function ollamaBaseUrl(host: string | undefined): string {
  const value = host?.trim() ?? "";

  if (value === "") {
    return OLLAMA_DEFAULT_URL;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  const withScheme = hasScheme ? value : `http://${value}`;
  const trimmed = withScheme.replace(/\/+$/, "");
  const hasPort = /:\d+$/.test(trimmed);

  return hasScheme || hasPort ? trimmed : `${trimmed}:${OLLAMA_DEFAULT_PORT}`;
}

/**
 * Check the value of `--decider`.
 *
 * `jev` is the first hosted provider with a key, running `jev-latest`. A bare
 * hosted provider name runs `jev-latest` there. `provider/model` runs that
 * model; only the first `/` splits, since model names can contain `:` and `/`.
 *
 * @param value - The flag value
 * @param flag - The flag's name, for the error message
 * @returns The provider and model it names, each when given
 * @throws On an unknown provider, an empty model, or `ollama` with no model
 */
export function parseDeciderSpec(
  value: string,
  flag = "--decider",
): DeciderSpec {
  const text = value.trim();
  const slash = text.indexOf("/");
  const name = slash === -1 ? text : text.slice(0, slash);
  const model = slash === -1 ? undefined : text.slice(slash + 1);
  const usage = `use jev, ${HOSTED_NAMES.join(", ")}, or <provider>/<model> (provider: ${DECIDER_PROVIDER_NAMES.join(", ")})`;

  if (slash === -1 && name === "jev") {
    return {};
  }

  if (!DECIDER_PROVIDER_NAMES.includes(name as DeciderProvider)) {
    throw new Error(`Unknown ${flag}=${value}; ${usage}`);
  }

  const provider = name as DeciderProvider;

  if (model === "") {
    throw new Error(`${flag}=${value} has no model after the "/"`);
  }

  if (provider === "ollama" && model == null) {
    throw new Error(`${flag}=ollama needs a model, e.g. ollama/autotrust-jev`);
  }

  return { provider, ...(model != null && { model }) };
}

/**
 * Pick the provider, model, URL and key a call uses.
 *
 * @param spec - What was asked for; no provider takes the first hosted one with a key
 * @param apiKey - Key override; with no provider, it goes to TypeSafe
 * @returns The provider, model, URL and key (none for Ollama)
 * @throws When no hosted provider has a key, or the one named has none
 */
export function resolveDecider(
  spec: DeciderSpec = {},
  apiKey?: string,
): ResolvedDecider {
  const hasOverride = apiKey != null && apiKey !== "";

  const keyFor = (name: DeciderProvider): string | undefined => {
    const envVar = DECIDER_PROVIDERS[name].envVar;
    const key = envVar == null ? undefined : process.env[envVar];

    return key == null || key === "" ? undefined : key;
  };

  const provider =
    spec.provider ??
    HOSTED_NAMES.find((n) => keyFor(n) != null) ??
    (hasOverride ? "typesafe" : undefined);

  if (provider == null) {
    const vars = HOSTED_NAMES.map((n) => DECIDER_PROVIDERS[n].envVar).join(
      ", ",
    );

    throw new Error(
      `No decider API key set: set one of ${vars} (add it to .env)`,
    );
  }

  const info = DECIDER_PROVIDERS[provider];
  const model =
    spec.model ?? (info.envVar == null ? undefined : DEFAULT_HOSTED_MODEL);

  if (model == null) {
    throw new Error(
      `${provider} needs a model, e.g. --decider ${provider}/<model>`,
    );
  }

  if (info.envVar == null) {
    return { provider, model, url: info.url() };
  }

  const key = hasOverride ? apiKey : keyFor(provider);

  if (key == null) {
    throw new Error(
      `${info.envVar} is not set (add it to .env), needed for --decider ${provider}`,
    );
  }

  return { provider, model, url: info.url(), apiKey: key };
}

/**
 * Calls to run at once when the user didn't say.
 *
 * @param spec - What was asked for
 * @returns The provider's default; hosted when the provider is not named
 */
export function defaultConcurrency(spec: DeciderSpec): number {
  return DECIDER_PROVIDERS[spec.provider ?? "typesafe"].defaultConcurrency;
}
