const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
function createWindow () {
  win = new BrowserWindow({
    width: 900, height: 700,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile('app/index.html');
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const RUNTIME_DIR = path.join(app.getPath('userData'), 'runtime');
fs.mkdirSync(RUNTIME_DIR, { recursive: true });

ipcMain.handle('read-clipboard', async () => {
  return clipboard.readText();
});

ipcMain.handle('save-scene', async (_evt, sceneObj) => {
  const scenePath = path.join(RUNTIME_DIR, 'scene.json');
  fs.writeFileSync(scenePath, JSON.stringify(sceneObj, null, 2), 'utf8');
  return scenePath;
});

ipcMain.handle('export-scene-as', async (_evt, sceneObj) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save scene.json',
    defaultPath: 'scene.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, JSON.stringify(sceneObj, null, 2), 'utf8');
  return filePath;
});
