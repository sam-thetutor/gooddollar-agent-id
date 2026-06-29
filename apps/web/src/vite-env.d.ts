/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_CELO_RPC_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GOODDOLLAR_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
