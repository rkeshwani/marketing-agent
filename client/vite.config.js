import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/proxy', // Set the base path for the application (no trailing slash)
  server: {
    hmr: {
      // If your Vite dev server is running on, say, port 5173,
      // and your proxy is on 8379.
      // The base path '/proxy/' should also apply to HMR.
      // Vite might handle this automatically with `base`, but explicitly setting
      // the path for HMR might be needed if issues persist.
      // path: '/proxy/vite-hmr', // Example if HMR needs explicit path under proxy
      clientPort: 5173, // Keep if Vite dev server port is different from proxy seen by client for WS
    }
  }
})
