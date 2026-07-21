/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_CELO_RPC_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_HOST_BASE_URL?: string;
  /** Set to "1" to use VITE_HOST_BASE_URL when it points at localhost (local @goodagent/host). */
  readonly VITE_HOST_USE_LOCAL?: string;
  readonly VITE_HOST_LIST_BASE_URL?: string;
  readonly VITE_GOODDOLLAR_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Started from index.html before the React bundle loads (dashboard routes). */
  __deployStatusPrefetch?: Promise<DeployStatusResponse>;
}
