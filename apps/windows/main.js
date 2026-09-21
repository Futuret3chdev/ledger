const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'Quill',
    webPreferences: {
      contextIsolation: true,
    },
  });
  win.loadURL('https://ledger-futuret3ch.vercel.app/app');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
