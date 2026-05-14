import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import WebSocket, { WebSocketServer } from 'ws';
import { adminLogin, userLogin, userRegister, logout, requireAuth, requireAdmin } from './auth';
import adminRouter from './admin-routes';
import userRouter from './user-routes';
import { handleBridgeUpgrade } from './bridge-routes';
import { userClientManager } from './user-client-manager';
import { isBridgeConnected, registerPathForUser } from './bridge-manager';
import { verifyToken } from './auth';
import { getDb } from './db';
import { AgentMessage } from './agent';
import { hasSufficientBalance, deductUsage } from './billing';
import { runAgentLoop } from './agent-loop';

const PORT = parseInt(process.env.GABY_PORT || '3000', 10);
const ALLOWED_ORIGIN = process.env.GABY_ALLOWED_ORIGIN || 'http://localhost:5173';

const app = express();
const server = http.createServer(app);

// ── Middleware ─────────────────────────────────────────────────────────────────

app.use(cors({
  origin: [ALLOWED_ORIGIN, 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Rate limiting on auth routes (relaxed in development)
const isDev = process.env.NODE_ENV !== 'production';
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 5,
  message: { error: 'Too many login attempts. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Auth routes ────────────────────────────────────────────────────────────────

app.post('/admin/login', authLimiter, adminLogin);
app.post('/api/login', authLimiter, userLogin);
app.post('/api/register', authLimiter, userRegister);
app.post('/api/logout', logout);
app.post('/admin/logout', logout);

// Lightweight admin session check
app.get('/admin/me', requireAdmin, (_req, res) => {
  res.json({ role: 'admin' });
});

// ── Admin API ──────────────────────────────────────────────────────────────────

app.use('/admin/api', adminRouter);

// ── User API ───────────────────────────────────────────────────────────────────

app.use('/api', userRouter);

// ── Serve bridge downloads (public) ───────────────────────────────────────────
const bridgeDist = path.join(__dirname, '../../public/bridge');
app.use('/bridge', express.static(bridgeDist));

// ── Serve frontend build (production) ─────────────────────────────────────────

const rendererDist = path.join(__dirname, '../../src/renderer/dist');
app.use(express.static(rendererDist));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/admin/api')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.sendFile(path.join(rendererDist, 'index.html'));
});

// ── WebSocket server ───────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '', `http://localhost`);
  const pathname = url.pathname;

  if (pathname === '/bridge') {
    // Bridge agent connections (local agent on user's machine)
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleBridgeUpgrade(ws, req);
    });
  } else if (pathname === '/ws') {
    // Browser client connections (user's browser tab)
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleUserClientUpgrade(ws, req);
    });
  } else {
    socket.destroy();
  }
});

function handleUserClientUpgrade(ws: WebSocket, req: http.IncomingMessage): void {
  const url = new URL(req.url || '', 'http://localhost');
  const token = url.searchParams.get('token') ||
    req.headers.cookie?.split(';').find(c => c.trim().startsWith('gaby_token='))?.split('=')[1];

  if (!token) {
    ws.close(4001, 'Missing token');
    return;
  }

  const payload = verifyToken(decodeURIComponent(token));
  if (!payload) {
    ws.close(4001, 'Invalid token');
    return;
  }

  const userId = payload.id as number;
  userClientManager.register(userId, ws);
  ws.send(JSON.stringify({ event: 'connected', message: 'GABy is ready!' }));

  // ── Track active requests for cancellation ──────────────────────────────
  let currentAbortController: AbortController | null = null;
  let isProcessing = false;

  ws.on('message', async (raw: Buffer) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // Handle cancel request
    if (msg.type === 'chat:cancel') {
      if (currentAbortController) {
        currentAbortController.abort(new Error('Request cancelled by user'));
        currentAbortController = null;
        isProcessing = false;
        userClientManager.pushToUser(userId, 'gaby:narration', { message: "Got it — I've stopped! What's next? 😊" });
        // Also tell the bridge to kill any running process
        const { killBridgeRequest } = require('./bridge-manager');
        killBridgeRequest(userId, (msg.requestId as string) || '');
      }
      return;
    }

    if (msg.type !== 'chat:message') return;
    if (isProcessing) {
      userClientManager.pushToUser(userId, 'gaby:narration', { message: "I'm still working on your last message — hang tight! 😊" });
      return;
    }

    isProcessing = true;
    currentAbortController = new AbortController();
    try {
      if (!hasSufficientBalance(userId)) {
        userClientManager.pushToUser(userId, 'gaby:narration', { message: "Looks like you're out of credits! Reach out and we'll top you right up 😊" });
        return;
      }

      const db = getDb();
      const userRow = db.prepare('SELECT selected_mode, max_tokens_per_session, display_name FROM users WHERE id = ?')
        .get(userId) as { selected_mode: string; max_tokens_per_session: number | null; display_name: string | null } | undefined;

      const mode = (msg.mode as string) || userRow?.selected_mode || 'fast';
      const sessionId = (msg.sessionId as string) || `ws_${userId}`;
      const history = (msg.history as AgentMessage[]) || [];
      const displayName = userRow?.display_name;

      // ── Session-level token cap ──────────────────────────────────────
      // max_tokens_per_session caps total usage across the session.
      // Per-call max_tokens is always 4096 (or mode default) independently.
      const pricing = db.prepare('SELECT input_token_base_cost, output_token_base_cost, global_max_tokens FROM pricing_modes WHERE mode = ?')
        .get(mode) as { input_token_base_cost: number; output_token_base_cost: number; global_max_tokens: number | null } | undefined;
      const perCallMaxTokens = Math.min(4096, pricing?.global_max_tokens ?? 4096);

      if (userRow?.max_tokens_per_session && userRow.max_tokens_per_session > 0) {
        const sessStats = db.prepare(
          'SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total_used FROM usage_log WHERE user_id = ? AND session_id = ?'
        ).get(userId, sessionId) as { total_used: number };
        const remaining = userRow.max_tokens_per_session - sessStats.total_used;
        if (remaining <= 0) {
          userClientManager.pushToUser(userId, 'gaby:narration', {
            message: "You've reached the session token limit. Start a new session to continue! 😊",
          });
          return;
        }
      }

      const systemLines = [
        'You are GABy — an AI coding agent inside a terminal. You can ONLY interact with files through <gaby_tool> tags.',
        '',
        '⚠️ ABSOLUTE RULE: You CANNOT read, write, edit, or run ANYTHING without using <gaby_tool> tags.',
        'If you claim to have changed a file, read code, or run a command WITHOUT using a <gaby_tool> tag, you are HALLUCINATING.',
        'You have ZERO direct access to files. The ONLY way to do anything is through <gaby_tool> tags.',
        '',
        '=== HOW TO ACTUALLY DO THINGS (with EXACT examples) ===',
        '',
        'Read a file — use this EXACT format:',
        '<gaby_tool name="read_file" path="src/main.py" />',
        '',
        'Write a file — put COMPLETE content between tags:',
        '<gaby_tool name="write_file" path="src/main.py">',
        'print("hello world")',
        '</gaby_tool>',
        '',
        'Run a command:',
        '<gaby_tool name="shell" command="npm test" />',
        '',
        'List files:',
        '<gaby_tool name="list_dir" path="." />',
        '',
        'Read multiple files:',
        '<gaby_tool name="read_multiple" paths="[\"src/a.py\",\"src/b.py\"]" />',
        '',
        '=== MANDATORY WORKFLOW ===',
        '- If the user is making casual conversation (greetings, questions, chat) — just reply naturally. Do NOT use any tools.',
        '- If the user asks you to do something with code/files — your FIRST response MUST use <gaby_tool> tags to READ the relevant files first.',
        '   Do NOT explain what you "will" do. READ the files NOW with tool tags.',
        '- After seeing file contents, use <gaby_tool> tags to MAKE the changes.',
        '- After changes succeed, explain what you did in ONE brief sentence.',
        '',
        'NEVER say "Let me read the files" — instead, use <gaby_tool name="read_file"> RIGHT NOW.',
        'NEVER say "I\'ve updated the file" — unless you just used <gaby_tool name="write_file">.',
        'NEVER describe what you "would" do — use tool tags and DO it.',
        '',
        '=== AVAILABLE TOOLS ===',
        'read_file(path) — Read a file. Content returned to you.',
        'write_file(path) — Write full content between <gaby_tool> and </gaby_tool>.',
        'create_file(path) — Same as write_file.',
        'delete_file(path) — Delete file or directory.',
        'mkdir(path) — Create directory tree.',
        'list_dir(path) — List directory contents.',
        'path_exists(path) — Check if path exists.',
        'read_multiple(paths) — Read multiple files. paths="[\"a.py\",\"b.py\"]"',
        'shell(command, cwd) — Run a shell command.',
        'run_tests(cwd) — Run the project test suite.',
        'start_server(command, cwd) — Start a dev server.',
        '',
        'TAG FORMAT (must follow exactly):',
        '  Self-closing: <gaby_tool name="toolname" param="value" />',
        '  With body:    <gaby_tool name="write_file" path="file.py">content</gaby_tool>',
        '',
        '=== RESPONSE STYLE ===',
        '- Between tool tags, write ONE short sentence explaining what you are doing.',
        '- NEVER show raw code blocks, file paths, or technical markup to the user.',
        '- NEVER ask the user for input, permission, or confirmation. Just act.',
        '- Respond warmly but concisely. One sentence is enough.',
        '',
        '🔍 REALITY CHECK (do this before you finish writing):',
        'Reread the response you are about to send. Did you claim to have READ, WRITTEN, CHANGED, UPDATED, or RUN anything?',
        'If YES, then there MUST be a <gaby_tool> tag, or you will be DETECTED and CORRECTED.',
        'If you said "I\'ve completed the work" or "I\'ve updated the file" without a <gaby_tool> tag — DELETE that lie and use the tool tag instead.',
        'It is BETTER to use a tool tag and let the result speak for itself than to fabricate a response.',
      ];
      if (displayName) {
        systemLines.push(`The user's name is ${displayName}. Address them by name occasionally in a warm, friendly way.`);
      }

      userClientManager.pushToUser(userId, 'gaby:thinking', {});

      // Resolve project path if a project is active
      const projectId = msg.projectId as number | undefined;
      let projectPath: string | undefined;
      if (projectId) {
        const proj = db.prepare('SELECT local_path FROM projects WHERE id = ? AND user_id = ?')
          .get(projectId, userId) as { local_path: string } | undefined;
        projectPath = proj?.local_path;
      }

      // Register the project path with the bridge so the sandbox allows file operations.
      // We attempt registration regardless of `isBridgeConnected()` — the sendToBridge call
      // internally checks WebSocket readyState and gives a clear error if the bridge is down.
      if (projectPath) {
        try {
          console.log(`[index] Registering project path with bridge: ${projectPath}`);
          await registerPathForUser(userId, projectPath);
          console.log(`[index] Project path registered successfully`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          console.warn(`[index] Failed to register project path: ${msg}`);
        }
      }

      // Run the full agent loop (AI ↔ bridge tool calls → AI → ...)
      const result = await runAgentLoop({
        userId,
        mode,
        systemPrompt: systemLines.join('\n'),
        projectId,
        projectPath,
        history,
        userMessage: msg.message as string,
        sessionId,
        signal: currentAbortController.signal,
        onChunk: (chunk) => {
          userClientManager.pushToUser(userId, 'gaby:stream_chunk', { chunk });
        },
      });

      const billing = deductUsage(
        userId, sessionId, mode,
        result.inputTokens, result.outputTokens,
        result.cacheWriteTokens, result.cacheReadTokens,
      );

      const sessStats = db.prepare(
        'SELECT SUM(input_tokens + output_tokens) as total_used FROM usage_log WHERE user_id = ? AND session_id = ?'
      ).get(userId, sessionId) as { total_used: number | null };

      // Signal end of stream with final content + billing info
      userClientManager.pushToUser(userId, 'gaby:stream_end', {
        content: result.content,
        sess_used: sessStats?.total_used ?? 0,
        sess_limit: userRow?.max_tokens_per_session ?? null,
        iterations: result.iterations,
      });
      userClientManager.pushToUser(userId, 'gaby:balance', {
        balance: billing.newBalance,
        wallet_balance: billing.newWalletBalance,
        sess_used: sessStats?.total_used ?? 0,
        sess_limit: userRow?.max_tokens_per_session ?? null,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '';
      const isAbortLike = errMsg.includes('cancelled') || errMsg.includes('abort') || errMsg.includes('AbortError');
      // User-initiated cancel: cancel handler already set currentAbortController = null and sent a "stopped" message
      if (isAbortLike && currentAbortController === null) return;
      // All other errors — always respond so the client never gets stuck in thinking state
      let friendly = 'Hmm, something unexpected happened. Please try again! 💪';
      if (errMsg.includes('No active API key')) friendly = 'The AI service is not available right now. Please contact support.';
      if (errMsg.toLowerCase().includes('insufficient')) friendly = "You're out of credits! Reach out and we'll top you right up 😊";
      userClientManager.pushToUser(userId, 'gaby:narration', { message: friendly });
    } finally {
      isProcessing = false;
      currentAbortController = null;
    }
  });
}

// ── Start ──────────────────────────────────────────────────────────────────────

// Initialize DB on startup
getDb();

server.listen(PORT, () => {
  console.log(`GABy server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
