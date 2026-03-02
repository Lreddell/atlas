
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
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

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'Atlas',
    backgroundColor: '#87CEEB',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
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

    await fs.unlink(targetPath);

    const baseDir = path.dirname(targetPath);
    const baseName = path.basename(targetPath, path.extname(targetPath));
    const cubeDir = path.join(baseDir, `${baseName}_panorama`);
    await fs.rm(cubeDir, { recursive: true, force: true });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
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
