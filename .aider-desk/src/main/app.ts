import type { App } from 'electron';

export const isElectron = (): boolean => {
  try {
    return process.versions.electron !== undefined;
  } catch {
    return false;
  }
};

let electronApp: App | null = null;
export const getElectronApp = (): App | null => {
  if (!isElectron()) {
    return null;
  }
  if (electronApp) {
    return electronApp;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  electronApp = require('electron').app as App;
  return electronApp;
};

export const isDev = (): boolean => {
  if (isElectron()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { is } = require('@electron-toolkit/utils');
    return is.dev;
  }
  return process.env.NODE_ENV !== 'production';
};
