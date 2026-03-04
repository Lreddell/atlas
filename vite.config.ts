import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'
import { existsSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs'
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

const MUSIC_ROOT_DIR = resolve(__dirname, 'public', 'assets', 'rvx', 'sounds', 'music')
const MUSIC_INDEX_PATH = resolve(__dirname, 'public', 'assets', 'rvx', 'sounds', 'music-index.json')
const AUDIO_FILE_REGEX = /\.(ogg|mp3|wav)$/i

const generateMusicFolderIndex = () => {
  const index: Record<string, string[]> = {}

  if (existsSync(MUSIC_ROOT_DIR)) {
    const folderEntries = readdirSync(MUSIC_ROOT_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))

    folderEntries.forEach((folderEntry) => {
      const folderPath = resolve(MUSIC_ROOT_DIR, folderEntry.name)
      const tracks = readdirSync(folderPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && AUDIO_FILE_REGEX.test(entry.name))
        .map((entry) => `assets/rvx/sounds/music/${folderEntry.name}/${entry.name}`)
        .sort((a, b) => a.localeCompare(b))

      if (tracks.length > 0) {
        index[folderEntry.name.toLowerCase()] = tracks
      }
    })
  }

  mkdirSync(resolve(__dirname, 'public', 'assets', 'rvx', 'sounds'), { recursive: true })
  writeFileSync(MUSIC_INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`)
}

const musicFolderIndexPlugin = {
  name: 'atlas-music-folder-index',
  configureServer() {
    generateMusicFolderIndex()
  },
  buildStart() {
    generateMusicFolderIndex()
  },
  handleHotUpdate(ctx: { file: string }) {
    const normalizedFile = ctx.file.replace(/\\/g, '/')
    if (normalizedFile.includes('/public/assets/rvx/sounds/music/')) {
      generateMusicFolderIndex()
    }
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), faviconVersionPlugin, copyBuildIconPlugin, musicFolderIndexPlugin],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_DISPLAY_VERSION__: JSON.stringify(packageJson.displayVersion ?? packageJson.version),
  },
  base: "./",
})