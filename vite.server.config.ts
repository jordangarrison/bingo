import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'src/server/main.ts',
    outDir: 'dist-server',
    target: 'node24',
    emptyOutDir: true,
    rollupOptions: {
      external: [/^node:/],
    },
  },
  ssr: {
    noExternal: true,
  },
})
