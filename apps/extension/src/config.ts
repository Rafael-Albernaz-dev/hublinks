// The build embeds one official HTTPS origin for a deployed installation.
// Unconfigured builds retain the isolated local development bridge.
declare const __HUB_EXTENSION_ORIGIN__: string;
const origin = typeof __HUB_EXTENSION_ORIGIN__ === 'undefined' ? '' : __HUB_EXTENSION_ORIGIN__;
export const WORKSPACE_URL = origin || 'http://127.0.0.1:5177';
export const API_ORIGIN = origin || 'http://127.0.0.1:3177';
export const ALLOWED_ORIGINS = new Set(
  origin ? [origin] : ['http://127.0.0.1:5177', 'http://localhost:5177'],
);
