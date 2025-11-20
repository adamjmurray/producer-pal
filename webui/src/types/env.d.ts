/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ENABLE_RAW_LIVE_API?: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
