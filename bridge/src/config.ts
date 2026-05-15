import os from 'os';
import path from 'path';
import fs from 'fs';

const CONFIG_DIR = path.join(os.homedir(), '.suny');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface SunyConfig {
  token?: string;
  server?: string;
  registered_paths?: string[];
}

export function readConfig(): SunyConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {
    // ignore
  }
  return {};
}

export function writeConfig(config: SunyConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

export function updateConfig(updates: Partial<SunyConfig>): void {
  const current = readConfig();
  writeConfig({ ...current, ...updates });
}

export function getRegisteredPaths(): string[] {
  return readConfig().registered_paths || [];
}

export function registerPath(p: string): void {
  const config = readConfig();
  const paths = new Set(config.registered_paths || []);
  paths.add(path.resolve(p));
  config.registered_paths = Array.from(paths);
  writeConfig(config);
}
