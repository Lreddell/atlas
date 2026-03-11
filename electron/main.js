
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fsSync = require('fs');
const fs = require('fs/promises');

// ✅ Add this BEFORE app.whenReady() and before any BrowserWindow is created
// Increase memory limit for voxel processing
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

async function loadDevUrlWithFallback(mainWindow) {
  const candidateUrls = [
    process.env.ELECTRON_START_URL,
    'http://localhost:5173',
    'http://localhost:5174'
  ].filter(Boolean);

  for (const url of candidateUrls) {
    try {
      await mainWindow.loadURL(url);
      return;
    } catch (e) {
      console.warn(`Failed to load dev URL ${url}`, e);
    }
  }

  throw new Error('Failed to load any dev server URL. Ensure Vite is running.');
}

const isExternalHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

const openExternalUrl = async (value) => {
  const url = String(value || '').trim();
  if (!isExternalHttpUrl(url)) {
    throw new Error('Only http(s) URLs are allowed.');
  }
  await shell.openExternal(url);
};

function createWindow() {
  const devIconPath = path.join(__dirname, '../build/icon.ico');
  const windowIcon = fsSync.existsSync(devIconPath) ? devIconPath : undefined;

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'Atlas',
    icon: windowIcon,
    backgroundColor: '#87CEEB',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      void openExternalUrl(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    if (url !== currentUrl && isExternalHttpUrl(url)) {
      event.preventDefault();
      void openExternalUrl(url);
    }
  });

  // Production vs Development Logic
  if (app.isPackaged) {
    // In production, load the built index.html from dist
    // __dirname is 'electron/' in the build, so we go up to root then into dist
    const indexPath = path.join(__dirname, '../dist/index.html');
    mainWindow.loadFile(indexPath).catch(e => {
        console.error("Failed to load app:", e);
    });
  } else {
    // In development, load from Vite dev server
    loadDevUrlWithFallback(mainWindow).catch(e => {
        console.error("Failed to load dev server. Ensure 'npm run dev' is running.", e);
    });
    // Optional: Open DevTools automatically in dev
    // mainWindow.webContents.openDevTools();
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

const sanitizeFileName = (value) => {
  const trimmed = String(value || '').trim();
  const safe = trimmed.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ');
  if (!safe) return `atlas-panorama-${Date.now()}`;
  return safe;
};

const parseDataUrlPng = (dataUrl) => {
  const match = /^data:image\/png;base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
};

const getPanoramaStorageDir = () => {
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'data', 'panoramas');
  }
  return path.join(app.getPath('userData'), 'panoramas');
};

const getWorldPresetStorageDir = () => {
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'data', 'world-presets');
  }
  return path.join(app.getPath('userData'), 'world-presets');
};

const sanitizePresetName = (value) => {
  const trimmed = String(value || '').trim();
  const safe = trimmed.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ');
  if (!safe) return 'World Preset';
  return safe;
};

const toPresetFileName = (name) => `${name}.json`;

ipcMain.handle('system:openExternal', async (_event, payload) => {
  try {
    const url = typeof payload === 'string' ? payload : payload?.url;
    await openExternalUrl(url);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

const getUniquePresetName = async (directory, requestedName) => {
  const base = sanitizePresetName(requestedName);
  let attempt = 1;
  while (attempt < 10000) {
    const candidateName = attempt === 1 ? base : `${base} (${attempt})`;
    const candidatePath = path.join(directory, toPresetFileName(candidateName));
    try {
      await fs.access(candidatePath);
      attempt += 1;
    } catch {
      return candidateName;
    }
  }
  throw new Error('Unable to allocate unique world preset name.');
};

const parsePresetFile = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  if (!parsed.config || typeof parsed.config !== 'object') return null;

  const stat = await fs.stat(filePath);
  const id = path.basename(filePath, '.json');
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : id;
  return {
    id,
    name,
    config: parsed.config,
    createdAt: Number(parsed.createdAt) || stat.birthtimeMs || Date.now(),
    updatedAt: Number(parsed.updatedAt) || stat.mtimeMs || Date.now(),
    filePath,
  };
};

const getUniqueFilePath = async (directory, baseFileName) => {
  const ext = path.extname(baseFileName) || '.png';
  const stem = path.basename(baseFileName, ext);
  let attempt = 0;

  while (attempt < 10000) {
    const candidateName = attempt === 0 ? `${stem}${ext}` : `${stem}-${attempt}${ext}`;
    const candidatePath = path.join(directory, candidateName);
    try {
      await fs.access(candidatePath);
      attempt += 1;
    } catch {
      return candidatePath;
    }
  }

  throw new Error('Unable to allocate unique panorama filename.');
};

ipcMain.handle('panorama:save', async (_event, payload) => {
  try {
    const pngBuffer = parseDataUrlPng(payload?.dataUrl);
    if (!pngBuffer) return { canceled: true, error: 'Invalid PNG data.' };

    const cubeFaces = Array.isArray(payload?.cubeFaces) ? payload.cubeFaces : [];
    if (cubeFaces.length !== 6) {
      return { canceled: true, error: 'Panorama capture requires exactly 6 cube face screenshots.' };
    }

    const suggestedBase = sanitizeFileName(payload?.suggestedName);
    const suggestedFileName = suggestedBase.toLowerCase().endsWith('.png')
      ? suggestedBase
      : `${suggestedBase}.png`;

    const panoramasDir = getPanoramaStorageDir();
    await fs.mkdir(panoramasDir, { recursive: true });

    const filePath = await getUniqueFilePath(panoramasDir, suggestedFileName);
    const baseDir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const cubeDir = path.join(baseDir, `${baseName}_panorama`);
    await fs.mkdir(cubeDir, { recursive: true });

    for (let i = 0; i < 6; i += 1) {
      const faceBuffer = parseDataUrlPng(cubeFaces[i]);
      if (!faceBuffer) {
        return { canceled: true, error: `Panorama face ${i} is invalid.` };
      }
      const outPath = path.join(cubeDir, `panorama_${i}.png`);
      await fs.writeFile(outPath, faceBuffer);
    }

    await fs.writeFile(filePath, pngBuffer);
    return { canceled: false, filePath, cubeDir };
  } catch (error) {
    return { canceled: true, error: String(error?.message || error) };
  }
});

ipcMain.handle('panorama:read', async (_event, payload) => {
  try {
    const targetPath = String(payload?.filePath || '').trim();
    if (!targetPath) return { ok: false, error: 'Missing file path.' };
    const raw = await fs.readFile(targetPath);
    return { ok: true, dataUrl: `data:image/png;base64,${raw.toString('base64')}` };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('panorama:pick', async () => {
  try {
    const panoramasDir = getPanoramaStorageDir();
    await fs.mkdir(panoramasDir, { recursive: true });

    const result = await dialog.showOpenDialog({
      title: 'Select Panorama Image',
      defaultPath: panoramasDir,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths?.length) {
      return { canceled: true };
    }

    return { canceled: false, filePath: result.filePaths[0] };
  } catch (error) {
    return { canceled: true, error: String(error?.message || error) };
  }
});

ipcMain.handle('panorama:delete', async (_event, payload) => {
  try {
    const targetPath = String(payload?.filePath || '').trim();
    if (!targetPath) return { ok: false, error: 'Missing file path.' };

    await fs.unlink(targetPath).catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });

    const baseDir = path.dirname(targetPath);
    const baseName = path.basename(targetPath, path.extname(targetPath));
    const cubeDir = path.join(baseDir, `${baseName}_panorama`);
    await fs.rm(cubeDir, { recursive: true, force: true });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('panorama:getDefaultPath', async () => {
  try {
    const dir = getPanoramaStorageDir();
    const defaultFile = path.join(dir, 'panorama-2026-03-10-07-06-34.png');
    await fs.access(defaultFile);
    return { filePath: defaultFile };
  } catch {
    return { filePath: null };
  }
});

ipcMain.handle('worldPreset:list', async () => {
  try {
    const dir = getWorldPresetStorageDir();
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const presetFiles = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'));
    const presets = [];
    for (const entry of presetFiles) {
      const parsed = await parsePresetFile(path.join(dir, entry.name));
      if (parsed) presets.push(parsed);
    }
    presets.sort((a, b) => b.updatedAt - a.updatedAt);
    return { ok: true, presets };
  } catch (error) {
    return { ok: false, error: String(error?.message || error), presets: [] };
  }
});

ipcMain.handle('worldPreset:read', async (_event, payload) => {
  try {
    const id = String(payload?.id || '').trim();
    if (!id) return { ok: false, error: 'Missing preset id.' };
    const dir = getWorldPresetStorageDir();
    const filePath = path.join(dir, `${id}.json`);
    const parsed = await parsePresetFile(filePath);
    if (!parsed) return { ok: false, error: 'Invalid preset file.' };
    return { ok: true, preset: parsed };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('worldPreset:save', async (_event, payload) => {
  try {
    const config = payload?.config;
    if (!config || typeof config !== 'object') {
      return { ok: false, error: 'Missing preset config.' };
    }
    const requestedName = sanitizePresetName(payload?.name || 'World Preset');
    const dir = getWorldPresetStorageDir();
    await fs.mkdir(dir, { recursive: true });

    const finalName = await getUniquePresetName(dir, requestedName);
    const now = Date.now();
    const body = {
      name: finalName,
      createdAt: now,
      updatedAt: now,
      config,
    };

    const filePath = path.join(dir, toPresetFileName(finalName));
    await fs.writeFile(filePath, JSON.stringify(body, null, 2), 'utf8');
    const preset = await parsePresetFile(filePath);
    return { ok: true, preset };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle('worldPreset:delete', async (_event, payload) => {
  try {
    const id = String(payload?.id || '').trim();
    if (!id) return { ok: false, error: 'Missing preset id.' };
    const dir = getWorldPresetStorageDir();
    const filePath = path.join(dir, `${id}.json`);
    await fs.rm(filePath, { force: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

const AUDIO_EXTENSIONS = new Set(['.ogg', '.mp3', '.wav', '.flac', '.m4a', '.opus', '.aac', '.webm']);

const getMusicDir = () => {
  if (app.isPackaged) {
    return path.join(__dirname, '../dist/assets/rvx/sounds/music');
  }
  return path.join(process.cwd(), 'public/assets/rvx/sounds/music');
};

ipcMain.handle('music:scanFolders', async () => {
  try {
    const musicDir = getMusicDir();
    const index = {};
    let entries;
    try {
      entries = await fs.readdir(musicDir, { withFileTypes: true });
    } catch {
      return { ok: true, index };
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderName = entry.name.toLowerCase();
      const folderPath = path.join(musicDir, entry.name);
      let files;
      try {
        files = await fs.readdir(folderPath, { withFileTypes: true });
      } catch {
        continue;
      }
      const tracks = files
        .filter(f => f.isFile() && AUDIO_EXTENSIONS.has(path.extname(f.name).toLowerCase()))
        .map(f => `assets/rvx/sounds/music/${entry.name}/${f.name}`);
      if (tracks.length > 0) {
        index[folderName] = tracks;
      }
    }
    return { ok: true, index };
  } catch (error) {
    return { ok: false, error: String(error?.message || error), index: {} };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
