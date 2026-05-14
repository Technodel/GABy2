import fs from 'fs';
import path from 'path';
import { validatePath, validateCommand, SandboxError } from './sandbox';
import { processManager } from './process-manager';

type SendFn = (msg: Record<string, unknown>) => void;

/**
 * Handle all exec:* instructions from the VPS server.
 * All file operations are sandboxed to registered project directories.
 * All commands are run via spawn() with arg arrays — never exec() with raw strings.
 */
export async function handleExec(
  type: string,
  id: string,
  payload: Record<string, unknown>,
  send: SendFn
): Promise<void> {
  try {
    switch (type) {
      case 'exec:read_file':
        await execReadFile(id, payload, send);
        break;
      case 'exec:write_file':
        await execWriteFile(id, payload, send);
        break;
      case 'exec:mkdir':
        await execMkdir(id, payload, send);
        break;
      case 'exec:delete_file':
        await execDeleteFile(id, payload, send);
        break;
      case 'exec:list_dir':
        await execListDir(id, payload, send);
        break;
      case 'exec:path_exists':
        await execPathExists(id, payload, send);
        break;
      case 'exec:shell':
        await execShell(id, payload, send);
        break;
      case 'exec:run_tests':
        await execShell(id, payload, send);
        break;
      case 'exec:start_dev_server':
        await execStartDevServer(id, payload, send);
        break;
      case 'exec:kill':
        execKill(id, payload, send);
        break;
      default:
        send({ type: 'bridge:error', id, payload: { message: `Unknown instruction type: ${type}` } });
    }
  } catch (err) {
    const msg = err instanceof SandboxError
      ? err.message
      : 'Operation failed';
    send({ type: 'bridge:error', id, payload: { message: msg } });
  }
}

async function execReadFile(id: string, payload: Record<string, unknown>, send: SendFn): Promise<void> {
  const filePath = payload.path as string;
  validatePath(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  send({ type: 'bridge:file_content', id, payload: { content, encoding: 'utf8' } });
}

async function execWriteFile(id: string, payload: Record<string, unknown>, send: SendFn): Promise<void> {
  const filePath = payload.path as string;
  const content = payload.content as string;
  validatePath(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  send({ type: 'bridge:done', id, payload: { exitCode: 0, success: true } });
}

async function execMkdir(id: string, payload: Record<string, unknown>, send: SendFn): Promise<void> {
  const dirPath = payload.path as string;
  validatePath(dirPath);
  fs.mkdirSync(dirPath, { recursive: true });
  send({ type: 'bridge:done', id, payload: { exitCode: 0, success: true } });
}

async function execDeleteFile(id: string, payload: Record<string, unknown>, send: SendFn): Promise<void> {
  const filePath = payload.path as string;
  validatePath(filePath);
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
  }
  send({ type: 'bridge:done', id, payload: { exitCode: 0, success: true } });
}

async function execListDir(id: string, payload: Record<string, unknown>, send: SendFn): Promise<void> {
  const dirPath = payload.path as string;
  validatePath(dirPath);
  const entries = fs.readdirSync(dirPath, { withFileTypes: true }).map(e => ({
    name: e.name,
    isDirectory: e.isDirectory(),
  }));
  send({ type: 'bridge:done', id, payload: { entries, exitCode: 0, success: true } });
}

async function execPathExists(id: string, payload: Record<string, unknown>, send: SendFn): Promise<void> {
  const targetPath = payload.path as string;
  validatePath(targetPath);
  send({ type: 'bridge:done', id, payload: { exists: fs.existsSync(targetPath), exitCode: 0, success: true } });
}

async function execShell(id: string, payload: Record<string, unknown>, send: SendFn): Promise<void> {
  const cwd = payload.cwd as string;
  const command = payload.command as string;
  const requiresConfirmation = payload.requiresConfirmation as boolean | undefined;

  validatePath(cwd);
  validateCommand(command, requiresConfirmation);

  // Parse command into cmd + args safely (no shell, respects quotes)
  const parsed = parseShellCommand(command);
  const cmd = parsed.command;
  const args = parsed.args;

  send({ type: 'bridge:ack', id });

  processManager.spawn(
    id,
    cmd,
    args,
    cwd,
    (line, stream) => send({ type: 'bridge:stream', id, payload: { line, stream } }),
    (exitCode) => send({ type: 'bridge:done', id, payload: { exitCode, success: exitCode === 0 } })
  );
}

async function execStartDevServer(id: string, payload: Record<string, unknown>, send: SendFn): Promise<void> {
  const cwd = payload.cwd as string;
  const command = payload.command as string;
  const readySignal = (payload.readySignal as string) || 'Local:';

  validatePath(cwd);
  validateCommand(command);

  const parsed = parseShellCommand(command);
  const cmd = parsed.command;
  const args = parsed.args;

  send({ type: 'bridge:ack', id });

  let serverReady = false;

  processManager.spawn(
    id,
    cmd,
    args,
    cwd,
    (line, stream) => {
      send({ type: 'bridge:stream', id, payload: { line, stream } });
      if (!serverReady && line.includes(readySignal)) {
        serverReady = true;
        send({ type: 'bridge:server_ready', id });
      }
    },
    (exitCode) => {
      if (!serverReady) {
        send({ type: 'bridge:server_crashed', id, payload: { error: `Exited with code ${exitCode}` } });
      }
      send({ type: 'bridge:done', id, payload: { exitCode, success: exitCode === 0 } });
    }
  );

  // Timeout
  const timeoutSeconds = (payload.timeoutSeconds as number) || 30;
  setTimeout(() => {
    if (!serverReady) {
      processManager.kill(id);
      send({ type: 'bridge:server_crashed', id, payload: { error: 'Startup timeout' } });
    }
  }, timeoutSeconds * 1000);
}

function execKill(id: string, payload: Record<string, unknown>, send: SendFn): void {
  const processId = payload.processId as string;
  const killed = processManager.kill(processId);
  send({ type: 'bridge:done', id, payload: { killed, exitCode: 0, success: true } });
}

/**
 * Parse a shell command string into command + args array, respecting quoted arguments.
 * Handles double quotes ("), single quotes ('), and escaped characters.
 * This prevents shell injection while properly handling spaces in arguments like paths.
 */
function parseShellCommand(input: string): { command: string; args: string[] } {
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (escapeNext) {
      current += ch;
      escapeNext = false;
      continue;
    }

    if (ch === '\\' && inDouble) {
      escapeNext = true;
      continue;
    }

    if (ch === '\\' && !inSingle && !inDouble) {
      escapeNext = true;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return {
    command: args[0] || '',
    args: args.slice(1),
  };
}
