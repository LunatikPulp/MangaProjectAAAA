import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import viteCompression from 'vite-plugin-compression'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({ open: false, filename: 'bundle-report.html', gzipSize: true }),
    // Brotli pre-compression for static assets (JS/CSS/SVG)
    // Nginx will serve .br files when client supports Accept-Encoding: br
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
      deleteOriginFile: false,
    }),
  ],
  server: {
    allowedHosts: ['localhost', '127.0.0.1', 'springmanga.duckdns.org'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    emptyOutDir: true,
    cssCodeSplit: false,
  },
})
