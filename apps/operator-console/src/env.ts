import { buildSurfaceLinks } from '@hcaf/ui';

export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
  wsUrl: import.meta.env.VITE_WS_URL ?? 'http://localhost:3001',
  surfaces: buildSurfaceLinks({
    operatorConsole: import.meta.env.VITE_OPERATOR_CONSOLE_URL ?? 'http://localhost:5173',
    configTool: import.meta.env.VITE_CONFIG_TOOL_URL ?? 'http://localhost:5174',
    analytics: import.meta.env.VITE_ANALYTICS_URL ?? 'http://localhost:5175',
  }),
};
