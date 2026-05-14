#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bridge_1 = require("./bridge");
const config_1 = require("./config");
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--token' && args[i + 1])
            result.token = args[++i];
        else if (args[i] === '--server' && args[i + 1])
            result.server = args[++i];
        else if (args[i] === '--register' && args[i + 1])
            result.register = args[++i];
    }
    return result;
}
function main() {
    const args = parseArgs();
    const config = (0, config_1.readConfig)();
    // Handle registration of a project directory
    if (args.register) {
        const { registerPath } = require('./config');
        registerPath(args.register);
        console.log(`[GABy Bridge] Registered project directory: ${args.register}`);
        return;
    }
    // Persist token and server if provided
    if (args.token)
        (0, config_1.updateConfig)({ token: args.token });
    if (args.server)
        (0, config_1.updateConfig)({ server: args.server });
    const token = args.token || config.token;
    const server = args.server || config.server || 'wss://gaby.technodel.tech';
    if (!token) {
        console.error('[GABy Bridge] No token provided. Run with --token <JWT>');
        console.error('  Example: gaby-bridge start --token <your_token> --server wss://gaby.technodel.tech');
        process.exit(1);
    }
    const bridge = new bridge_1.GabyBridge(token, server);
    process.on('SIGINT', () => {
        console.log('\n[GABy Bridge] Shutting down...');
        bridge.stop();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        bridge.stop();
        process.exit(0);
    });
    console.log(`[GABy Bridge] Starting — connecting to ${server}`);
    bridge.start();
}
main();
//# sourceMappingURL=index.js.map