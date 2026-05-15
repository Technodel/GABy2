/**
 * GABy Agent Loop — Orchestrates AI ↔ Bridge iteration.
 *
 * Flow:
 *   1. Call AI with user message + system prompt (streaming)
 *   2. Parse AI response for <gaby_tool> tags
 *   3. If tool calls found, execute them sequentially via bridge
 *   4. Feed results back to AI as system context
 *   5. Repeat until AI responds without tool calls or max iterations reached
 *   6. Return final content
 *
 * Narrator messages are sent to the user during bridge operations.
 */

import path from 'path';
import { callAgentStream, AgentMessage, StreamCallback } from './agent';
import { sendToBridgeWithNarration } from './bridge-manager';
import { parseToolCalls, hasToolCalls, buildToolResultBlock, ToolCallResult } from './tool-parser';
import { userClientManager } from './user-client-manager';
import { narrateMessage } from './narrator';

const MAX_ITERATIONS = 8;        // Max tool-use cycles per user request
const MAX_ITERATION_TOKENS = 2048; // Max tokens per iteration response

export interface AgentLoopRequest {
  userId: number;
  mode: string;
  systemPrompt: string;
  projectId?: number;
  projectPath?: string;
  history: AgentMessage[];
  userMessage: string;
  sessionId: string;
  signal?: AbortSignal;
  onChunk?: StreamCallback;  // Stream text to user in real-time
}

export interface AgentLoopResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  iterations: number;
}

/**
 * Run the agent loop: AI → tool execution → AI → ... → final response.
 */
export async function runAgentLoop(req: AgentLoopRequest): Promise<AgentLoopResult> {
  const { userId, mode, systemPrompt, projectPath, history, userMessage, sessionId, signal, onChunk } = req;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheWrite = 0;
  let totalCacheRead = 0;
  let iterationMessages: AgentMessage[] = [];
  let lastCleanContent = ''; // Track last real AI response across all iterations

  // Build conversation history: system already handled by caller, plus user msg
  let currentHistory = [...history];
  let currentUserMsg = userMessage;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Check for cancellation
    if (signal?.aborted) throw new Error('Request cancelled by user');

    // Build file/project context for this iteration
    const projectContext = projectPath
      ? `You are working in the project at: ${projectPath}\nTo read or write files, use the tool tags described above.`
      : '';

    // Narrator: show iteration status
    if (iter > 0) {
      const statusMsg = iter === 1
        ? '🔧 Working through the steps...'
        : `🔄 Still going (step ${iter + 1})...`;
      userClientManager.pushToUser(userId, 'gaby:narration', { message: statusMsg });
    }

    // Narrator: notify user that AI is responding (first iteration only)
    if (iter === 0) {
      userClientManager.pushToUser(userId, 'gaby:stream_start', {});
    }

    // Call AI (streaming) — filter tool tags from live chunks so user never sees raw XML
    let accumulatedContent = '';
    let lastCleanLen = 0;
    let lastHeartbeat = Date.now();
    const HEARTBEAT_INTERVAL = 5000; // Send "working..." update every 5s if no clean text

    const result = await callAgentStream(
      {
        mode,
        systemPrompt,
        projectContext,
        history: currentHistory,
        userMessage: currentUserMsg,
        maxTokens: MAX_ITERATION_TOKENS,
        signal,
      },
      (chunk) => {
        accumulatedContent += chunk;
        // Hold back from the last '<gaby' that hasn't received its closing '>' yet.
        // This covers all partial splits: '<gaby', '<gaby_', '<gaby_tool', '<gaby_tool name=...'
        let safeContent = accumulatedContent;
        const lastTagStart = accumulatedContent.lastIndexOf('<gaby');
        if (lastTagStart !== -1 && !accumulatedContent.slice(lastTagStart).includes('>')) {
          safeContent = accumulatedContent.slice(0, lastTagStart);
        }
        // Re-parse the safe content to filter completed tool tags
        const { cleanContent } = parseToolCalls(safeContent);
        // Send only the new clean text (difference from last known clean length)
        if (cleanContent.length > lastCleanLen) {
          const newText = cleanContent.slice(lastCleanLen);
          lastCleanLen = cleanContent.length;
          if (newText && onChunk) onChunk(newText);
          lastHeartbeat = Date.now(); // Reset heartbeat since we sent visible text
        } else if (onChunk && Date.now() - lastHeartbeat > HEARTBEAT_INTERVAL) {
          // No visible text sent for a while (AI is only producing tool tags) — send a subtle beat
          onChunk('▸');
          lastHeartbeat = Date.now();
        }
      }
    );

    // If no streaming happened (non-streaming provider like Anthropic),
    // feed the AI response content through onChunk so the user sees feedback.
    // Must filter tool tags first to avoid showing raw XML to the user.
    if (!accumulatedContent && result.content && onChunk) {
      const { cleanContent } = parseToolCalls(result.content);
      if (cleanContent) onChunk(cleanContent);
      accumulatedContent = result.content; // Keep raw content for tool call parsing
    }

    totalInputTokens += result.usage.inputTokens;
    totalOutputTokens += result.usage.outputTokens;
    totalCacheWrite += result.usage.cacheWriteTokens;
    totalCacheRead += result.usage.cacheReadTokens;

    // Parse the accumulated content for tool calls.
    // For non-streaming providers (Anthropic), accumulatedContent is set above from
    // the raw result.content, so this check is a safety net.
    const fullContent = accumulatedContent || result.content || '';
    const { cleanContent, toolCalls } = parseToolCalls(fullContent);

    if (toolCalls.length === 0) {
      // Hallucination guard — only trigger when the user clearly asked for a code/file action
      // and the AI claimed to have done it without any tool tags.
      // NEVER trigger for conversational messages (greetings, questions, short messages).
      const actionVerbs = /\b(change|update|add|create|delete|remove|fix|modify|run|start|build|write|edit|rename|move|implement|test|install|refactor|debug|deploy)\b/i;
      const isConversational = currentUserMsg.trim().length < 20 || /^(hi|hello|hey|thanks|ok|okay|sure|yes|no|what|who|why|how|when|where)\b/i.test(currentUserMsg.trim());
      const userWantsAction = !isConversational && actionVerbs.test(currentUserMsg) && currentUserMsg.length > 20;
      // Detect action claims in AI response: "I've completed", "I've updated", "has been changed"
      const actionClaimRegex = /\b(I'?ve\s+(completed|updated|changed|made|done|applied|renamed|created|fixed|added|run|started)|(work|task|changes?)\s+(is|has been|are|have been)\s+(done|complete|completed|applied|made|updated))\b/i;
      const aiClaimsWork = !isConversational && actionClaimRegex.test(fullContent);
      const isFirstIteration = iter === 0;

      if (isFirstIteration && (userWantsAction || aiClaimsWork)) {
        console.log('[agent-loop] ⚠️ Hallucination detected — AI responded without tool calls. Retrying with corrective prompt.');
        console.log(`  userWantsAction=${userWantsAction} aiClaimsWork=${aiClaimsWork}`);
        userClientManager.pushToUser(userId, 'gaby:narration', { message: '⚠️ Detected hallucination — retrying...' });
        // Reset accumulated content and feed a corrective message for the next iteration
        accumulatedContent = '';
        lastCleanLen = 0;
        currentUserMsg = `You responded without using any <gaby_tool> tags. This means you FABRICATED your answer — you did not actually read or change any files.\n\nYou MUST use <gaby_tool> tags to perform actions. To do the task, start by reading the relevant files with:\n<gaby_tool name="read_file" path="the-file-path" />\n\nThen after reading, make changes with:\n<gaby_tool name="write_file" path="the-file-path">\n...complete file content...\n</gaby_tool>\n\nDO NOT write any explanatory text — just use the tool tags NOW.`;
        continue; // Retry iteration
      }

      // No more tool calls — this is the final response.
      // Use the best available content: cleanContent from streaming (tool tags stripped),
      // or the raw AI response for non-streaming providers.
      const finalContent = cleanContent || result.content || lastCleanContent || '';
      return {
        content: finalContent,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheWriteTokens: totalCacheWrite,
        cacheReadTokens: totalCacheRead,
        iterations: iter + 1,
      };
    }

    // Execute tool calls via bridge
    const results: Array<{ call: (typeof toolCalls)[0]; result: ToolCallResult }> = [];

    for (const call of toolCalls) {
      if (signal?.aborted) throw new Error('Request cancelled by user');

      const toolDesc = `${call.name}(${JSON.stringify(call.params)})`;
      try {
        console.log(`[agent-loop] Executing tool call: ${toolDesc}`);
        const resultData = await executeToolCall(userId, call, projectPath);
        console.log(`[agent-loop] Tool call succeeded: ${toolDesc}`);
        results.push({ call, result: { success: true, data: resultData } });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[agent-loop] Tool call FAILED: ${toolDesc} — ${errMsg}`);
        results.push({ call, result: { success: false, error: errMsg } });
      }
    }

    // Build tool result block to feed back to AI
    const toolResultBlock = buildToolResultBlock(results);

    // Add the AI's clean response (without tool tags) and the tool results to history
    if (cleanContent.trim()) {
      lastCleanContent = cleanContent;
      iterationMessages.push({ role: 'assistant', content: cleanContent });
    }

    // Set up next iteration: results as a user message
    currentHistory = [...currentHistory, ...iterationMessages];
    currentUserMsg = toolResultBlock;
    iterationMessages = [];
  }

  // Max iterations reached — return the last real AI response, or a neutral fallback
  return {
    content: lastCleanContent || '',
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheWriteTokens: totalCacheWrite,
    cacheReadTokens: totalCacheRead,
    iterations: MAX_ITERATIONS,
  };
}

/**
 * Resolve a potentially relative path against the project directory.
 * Absolute paths pass through unchanged; relative paths are joined with projectPath.
 */
function resolveProjectPath(p: string, projectPath?: string): string {
  if (!p) return p;
  if (path.isAbsolute(p)) return p;
  if (projectPath) return path.join(projectPath, p);
  return p; // No project path — let bridge resolve relative to its CWD (may fail)
}

/**
 * Execute a single tool call via the bridge.
 */
async function executeToolCall(
  userId: number,
  call: { name: string; params: Record<string, unknown>; body?: string },
  projectPath?: string
): Promise<unknown> {
  const { name, params, body } = call;
  const cwd = (params.cwd as string) || projectPath || '.';

  switch (name) {
    case 'read_file': {
      const rawPath = params.path as string;
      if (!rawPath) throw new Error('read_file: path is required');
      const resolvedPath = resolveProjectPath(rawPath, projectPath);
      return sendToBridgeWithNarration(userId, 'exec:read_file', { path: resolvedPath }, 'search', { filename: rawPath.split('/').pop() || rawPath });
    }

    case 'write_file':
    case 'create_file': {
      const rawPath = (params.path || params.file) as string;
      if (!rawPath) throw new Error(`${name}: path is required`);
      const content = body || params.content;
      if (content === undefined || content === null) throw new Error(`${name}: content is required`);
      const resolvedPath = resolveProjectPath(rawPath, projectPath);
      return sendToBridgeWithNarration(userId, 'exec:write_file', { path: resolvedPath, content }, 'file_edit', { filename: rawPath.split('/').pop() || rawPath });
    }

    case 'delete_file': {
      const rawPath = params.path as string;
      if (!rawPath) throw new Error('delete_file: path is required');
      const resolvedPath = resolveProjectPath(rawPath, projectPath);
      return sendToBridgeWithNarration(userId, 'exec:delete_file', { path: resolvedPath }, 'file_edit', { filename: rawPath.split('/').pop() || rawPath });
    }

    case 'list_dir': {
      const rawPath = params.path as string;
      if (!rawPath) throw new Error('list_dir: path is required');
      const resolvedPath = resolveProjectPath(rawPath, projectPath);
      return sendToBridgeWithNarration(userId, 'exec:list_dir', { path: resolvedPath }, 'search');
    }

    case 'mkdir': {
      const rawPath = params.path as string;
      if (!rawPath) throw new Error('mkdir: path is required');
      const resolvedPath = resolveProjectPath(rawPath, projectPath);
      return sendToBridgeWithNarration(userId, 'exec:mkdir', { path: resolvedPath }, 'command');
    }

    case 'path_exists': {
      const rawPath = params.path as string;
      if (!rawPath) throw new Error('path_exists: path is required');
      const resolvedPath = resolveProjectPath(rawPath, projectPath);
      return sendToBridgeWithNarration(userId, 'exec:path_exists', { path: resolvedPath }, 'search');
    }

    case 'read_multiple': {
      const paths = params.paths as string[] || (params.path as string)?.split(',') || [];
      if (paths.length === 0) throw new Error('read_multiple: paths is required');
      const results: Record<string, unknown> = {};
      for (const p of paths) {
        const trimmedP = (p as string).trim();
        const resolvedP = resolveProjectPath(trimmedP, projectPath);
        results[trimmedP] = await sendToBridgeWithNarration(
          userId, 'exec:read_file', { path: resolvedP }, 'search',
          { filename: trimmedP.split('/').pop() || trimmedP }
        );
      }
      return results;
    }

    case 'shell': {
      const command = params.command as string;
      if (!command) throw new Error('shell: command is required');
      return sendToBridgeWithNarration(userId, 'exec:shell', { command, cwd, requiresConfirmation: false }, 'command');
    }

    case 'run_tests': {
      const cwdDir = cwd;
      return sendToBridgeWithNarration(userId, 'exec:run_tests', { cwd: cwdDir }, 'test_running');
    }

    case 'start_server': {
      const command = (params.command as string) || 'npm run dev';
      const readySignal = params.readySignal as string;
      const timeoutSeconds = (params.timeoutSeconds as number) || 30;
      const payload: Record<string, unknown> = { command, cwd, timeoutSeconds };
      if (readySignal) payload.readySignal = readySignal;
      return sendToBridgeWithNarration(userId, 'exec:start_dev_server', payload, 'server_starting');
    }

    default:
      throw new Error(`Unknown tool: ${name}. Supported: read_file, write_file, create_file, delete_file, list_dir, mkdir, shell, run_tests, start_server, read_multiple, path_exists`);
  }
}
