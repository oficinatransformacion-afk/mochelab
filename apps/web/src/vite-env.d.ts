/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEMO_PROFILE?: "USUARIO" | "ADMIN" | "SYSTEM";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
