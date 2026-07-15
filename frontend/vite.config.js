import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // 자주 안 바뀌는 서드파티 라이브러리를 페이지 코드와 분리한다.
        // recharts(+d3)는 유지보수 분석 페이지에서만 쓰는 무거운 라이브러리라
        // 따로 묶어야, 차트를 안 쓰는 페이지 방문 시 이 청크를 안 받는다.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
          if (id.includes('react-router-dom')) return 'vendor-router'
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
})
