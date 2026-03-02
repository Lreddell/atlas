import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appVersion = packageJson.displayVersion ?? packageJson.version

const faviconVersionPlugin = {
  name: 'atlas-favicon-version',
  transformIndexHtml(html: string) {
    return html.replace('__FAVICON_VERSION__', encodeURIComponent(appVersion))
  },
}

const copyBuildIconPlugin = {
  name: 'atlas-copy-build-icon',
  apply: 'build' as const,
  closeBundle() {
    const source = resolve(__dirname, 'build', 'icon.ico')
    if (!existsSync(source)) return

    const targetDir = resolve(__dirname, 'dist', 'build')
    mkdirSync(targetDir, { recursive: true })
    copyFileSync(source, resolve(targetDir, 'icon.ico'))
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), faviconVersionPlugin, copyBuildIconPlugin],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_DISPLAY_VERSION__: JSON.stringify(packageJson.displayVersion ?? packageJson.version),
  },
  base: "./",
})