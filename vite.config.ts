import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json'
import { existsSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appVersion = packageJson.displayVersion ?? packageJson.version

const faviconVersionPlugin = {
  name: 'atlas-favicon-version',
  transformIndexHtml(html: string) {
    return html
      .replace('__FAVICON_VERSION__', encodeURIComponent(appVersion))
      .replace('__STARTUP_PREVIEW_VERSION__', JSON.stringify(appVersion))
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
const AUDIO_FILE_REGEX = /\.(ogg|mp3|wav|flac|m4a|opus|aac|webm)$/i

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

// DEV-only: the visual tour (src/systems/debug/devQa.ts) posts canvas captures
// here, and they land in the gitignored output/qa/<phase>/<shot>.png for
// before/after comparison. Never part of a build.
const QA_SHOT_ROUTE = '/__atlas-qa/shot'
const QA_SHOT_MAX_BYTES = 40 * 1024 * 1024

const qaShotPlugin: Plugin = {
  name: 'atlas-qa-shot',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(QA_SHOT_ROUTE, (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size <= QA_SHOT_MAX_BYTES) chunks.push(chunk)
      })
      req.on('end', () => {
        try {
          if (size > QA_SHOT_MAX_BYTES) throw new Error('Shot too large')
          const { phase, name, dataUrl } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
          const safe = (value: unknown) => String(value ?? '').replace(/[^a-z0-9._-]/gi, '_').slice(0, 64) || 'unnamed'
          const match = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl ?? ''))
          if (!match) throw new Error('Expected a PNG data URL')
          const dir = resolve(__dirname, 'output', 'qa', safe(phase))
          mkdirSync(dir, { recursive: true })
          const file = resolve(dir, `${safe(name)}.png`)
          writeFileSync(file, Buffer.from(match[1], 'base64'))
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ file }))
        } catch (error) {
          res.statusCode = 400
          res.end(String(error))
        }
      })
    })
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), faviconVersionPlugin, copyBuildIconPlugin, musicFolderIndexPlugin, qaShotPlugin],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_DISPLAY_VERSION__: JSON.stringify(packageJson.displayVersion ?? packageJson.version),
  },
  base: "./",
})
