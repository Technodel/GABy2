"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GabyBridge = void 0;
const ws_1 = __importDefault(require("ws"));
const executor_1 = require("./executor");
const config_1 = require("./config");
const HEARTBEAT_INTERVAL = 30000;
const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_DELAY = 60000;
class GabyBridge {
    constructor(token, server) {
        this.ws = null;
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
        this.reconnectDelay = RECONNECT_DELAY;
        this.stopped = false;
        this.token = token;
        this.server = server;
    }
    start() {
        this.stopped = false;
        this.connect();
    }
    stop() {
        this.stopped = true;
        this.clearTimers();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    connect() {
        const url = `${this.server}/bridge?token=${encodeURIComponent(this.token)}`;
        try {
            this.ws = new ws_1.default(url);
        }
        catch (err) {
            console.error('[GABy Bridge] Failed to create connection:', err);
            this.scheduleReconnect();
            return;
        }
        this.ws.on('open', () => {
            console.log('[GABy Bridge] Connected to GABy server ✓');
            this.reconnectDelay = RECONNECT_DELAY;
            this.startHeartbeat();
        });
        this.ws.on('message', (raw) => {
            this.handleMessage(raw.toString());
        });
        this.ws.on('close', (code, reason) => {
            this.clearTimers();
            if (code === 4001) {
                console.error('[GABy Bridge] Authentication failed. Please check your token.');
                if (reason.toString().includes('expired')) {
                    this.openBrowserForReauth();
                }
                // Don't reconnect on auth failure
                return;
            }
            if (!this.stopped) {
                console.log(`[GABy Bridge] Disconnected (code ${code}). Reconnecting in ${this.reconnectDelay / 1000}s...`);
                this.scheduleReconnect();
            }
        });
        this.ws.on('error', (err) => {
            console.error('[GABy Bridge] Connection error:', err.message);
        });
    }
    handleMessage(raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            return;
        }
        const { type, id, payload } = msg;
        if (type === 'bridge:disconnect') {
            console.log('[GABy Bridge] Server requested disconnect:', payload?.reason);
            this.stopped = true;
            this.ws?.close();
            return;
        }
        if (type === 'bridge:token_expired') {
            console.log('[GABy Bridge] Session expired. Please log in again.');
            this.openBrowserForReauth();
            return;
        }
        if (type === 'bridge:ping') {
            this.send({ type: 'bridge:pong' });
            return;
        }
        // Register a project directory path so the sandbox allows file operations
        if (type === 'bridge:register_path' && payload?.path) {
            const targetPath = payload.path;
            (0, config_1.registerPath)(targetPath);
            console.log(`[GABy Bridge] Registered project path: ${targetPath}`);
            if (id) {
                this.send({ type: 'bridge:ack', id, payload: { success: true } });
            }
            return;
        }
        if (type?.startsWith('exec:') && id) {
            (0, executor_1.handleExec)(type, id, (payload || {}), (msg) => this.send(msg));
        }
    }
    send(msg) {
        if (this.ws?.readyState === ws_1.default.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            this.send({ type: 'bridge:ping' });
        }, HEARTBEAT_INTERVAL);
    }
    scheduleReconnect() {
        this.reconnectTimer = setTimeout(() => {
            if (!this.stopped)
                this.connect();
        }, this.reconnectDelay);
        // Exponential backoff with cap
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }
    clearTimers() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    openBrowserForReauth() {
        const { server } = this;
        const loginUrl = server.replace(/^wss?:\/\//, 'https://').replace('/bridge', '/login');
        console.log(`[GABy Bridge] Open this URL to log in again: ${loginUrl}`);
        // Try to open browser
        try {
            const { exec } = require('child_process');
            const cmd = process.platform === 'win32' ? `start "" "${loginUrl}"` :
                process.platform === 'darwin' ? `open "${loginUrl}"` : `xdg-open "${loginUrl}"`;
            exec(cmd);
        }
        catch {
            // ignore if browser open fails
        }
    }
}
exports.GabyBridge = GabyBridge;
//# sourceMappingURL=bridge.js.map