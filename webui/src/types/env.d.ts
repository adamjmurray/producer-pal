// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ENABLE_RAW_LIVE_API?: boolean;
  readonly PPAL_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
