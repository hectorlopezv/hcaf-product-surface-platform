import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const pkg = (name: string) => path.resolve(__dirname, `../../packages/${name}/src`);

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '../..'),
  server: { port: Number(process.env.VITE_CONFIG_TOOL_PORT ?? 5174) },
  resolve: {
    alias: [
      { find: '@hcaf/ui/styles.css', replacement: path.join(pkg('ui'), 'styles.css') },
      { find: '@hcaf/ui', replacement: path.join(pkg('ui'), 'index.tsx') },
    ],
  },
});
