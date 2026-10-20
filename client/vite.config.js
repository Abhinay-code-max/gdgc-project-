import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function isIgnoredRollupWarning(warning) {
  if (warning?.code !== 'MODULE_LEVEL_DIRECTIVE') {
    return false;
  }
  if (!warning?.message?.includes('"use client"')) {
    return false;
  }
  const sourcePath = (warning?.id || warning?.loc?.file || '').replace(/\\/g, '/');
  return /node_modules\/react-router(-dom)?\//.test(sourcePath);
}

export function handleRollupWarning(warning, defaultHandler) {
  if (isIgnoredRollupWarning(warning)) {
    return;
  }
  defaultHandler(warning);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  return {
    root: __dirname,
    build: {
      outDir: path.resolve(__dirname, '../dist'),
      emptyOutDir: true,
      rollupOptions: {
        onwarn: handleRollupWarning,
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${env.PORT || 3000}`,
          changeOrigin: false,
        },
      },
    },
  };
});
