import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const pkg = (name: string) => path.resolve(__dirname, `../../packages/${name}/src`);

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '../..'),
  server: { port: Number(process.env.VITE_OPERATOR_CONSOLE_PORT ?? 5173) },
  resolve: {
    alias: [
      { find: '@hcaf/api-client', replacement: path.join(pkg('api-client'), 'index.ts') },
      { find: '@hcaf/ui/styles.css', replacement: path.join(pkg('ui'), 'styles.css') },
      { find: '@hcaf/surface-sdk', replacement: path.join(pkg('surface-sdk'), 'index.ts') },
      { find: '@hcaf/ontology', replacement: path.join(pkg('ontology'), 'index.ts') },
      { find: '@hcaf/ui', replacement: path.join(pkg('ui'), 'index.tsx') },
    ],
  },
});
