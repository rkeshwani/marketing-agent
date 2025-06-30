import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Vite itself operates at root; proxy handles /proxy/5173/
  server: {
    port: 5173,
    strictPort: true,
    middlewareMode: true, // Use middleware mode
    hmr: {
      // HMR client needs to connect to the WebSocket via the proxy.
      protocol: 'ws', // Assuming your code-server proxy URL (zeus:8379) is HTTP. Use 'wss' if HTTPS.
      host: 'zeus',    // Public hostname of your code-server.
      port: 8379,      // Public port of your code-server.
      // The path for HMR. Since base is '/', Vite's HMR might default to '/__vite_hmr' or '/vite-hmr'.
      // The proxy needs to map this under its prefix.
      // e.g., browser connects to ws://zeus:8379/proxy/5173/__vite_hmr
      // This path should be proxied by code-server to ws://localhost:5173/__vite_hmr
      path: '/proxy/5173/__vite_hmr',
    }
    // `origin` is generally not used with middlewareMode: true
  }
})
