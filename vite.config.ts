import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_DISPLAY_VERSION__: JSON.stringify(packageJson.displayVersion ?? packageJson.version),
  },
  base: "./",
})