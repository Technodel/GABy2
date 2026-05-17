/**
 * SUNy Stage Manager — Staged Execution Pipeline + Capability Gate + Mode Flags
 *
 * Transforms SUNy from one-pass behavior into fixed, predictable stages:
 *   1. INTENT_PARSE  — Understand the user's goal, read context
 *   2. PLAN          — Form internal plan, list files to touch
 *   3. EXECUTION     — Only write/edit files (no discovery)
 *   4. VERIFICATION  — Lint + test + validate
 *   5. FINALIZE      — Git commit, summary, session replay log
 *
 * Each stage gates which tools the AI can access:
 *   - INTENT_PARSE:  read_file, list_dir, find_files, search_code only
 *   - PLAN:          read_file + plan-specific tools (no write/delete/shell)
 *   - EXECUTION:     write_file, edit_file, delete_file, bash (full power)
 *   - VERIFICATION:  bash (lint/test only), read_file
 *   - FINALIZE:      git tools, narration only
 *
 * Mode flags further restrict behavior within each stage:
 *   - strict-edit:    Only modify exactly what was planned. No exploratory edits.
 *   - exploratory-read: Read-only mode. No writes at all.
 *   - refactor-safe:   Never delete files. Prefer append over overwrite.
 *   - debug-only:      Only diagnostic reads + bash. No production writes.
 */

import type { LanguageModel } from 'ai';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export enum ExecutionStage {
  INTENT_PARSE = 'intent_parse',
  PLAN = 'plan',
  EXECUTION = 'execution',
  VERIFICATION = 'verification',
  FINALIZE = 'finalize',
}

export enum TaskMode {
  NORMAL = 'normal',
  STRICT_EDIT = 'strict-edit',
  EXPLORATORY_READ = 'exploratory-read',
  REFACTOR_SAFE = 'refactor-safe',
  DEBUG_ONLY = 'debug-only',
}

export type ToolCategory = 'read' | 'write' | 'delete' | 'shell' | 'search' | 'git' | 'memory' | 'web';

/**
 * Which tool categories are allowed per stage + mode combination.
 */
const STAGE_TOOL_ALLOWLIST: Record<ExecutionStage, ToolCategory[]> = {
  [ExecutionStage.INTENT_PARSE]: ['read', 'search', 'memory'],
  [ExecutionStage.PLAN]: ['read', 'search', 'memory'],
  [ExecutionStage.EXECUTION]: ['read', 'write', 'delete', 'shell', 'search', 'git'],
  [ExecutionStage.VERIFICATION]: ['read', 'shell'],
  [ExecutionStage.FINALIZE]: ['read', 'git'],
};

/**
 * Mode-specific restrictions applied on top of stage allowlist.
 */
const MODE_RESTRICTIONS: Record<TaskMode, { blockedCategories?: ToolCategory[]; notes: string }> = {
  [TaskMode.NORMAL]: { notes: 'Full capabilities per stage.' },
  [TaskMode.STRICT_EDIT]: { notes: 'Only modify planned files. No exploratory edits.' },
  [TaskMode.EXPLORATORY_READ]: { blockedCategories: ['write', 'delete', 'shell', 'git'], notes: 'Read-only. No file modifications.' },
  [TaskMode.REFACTOR_SAFE]: { blockedCategories: ['delete'], notes: 'Never delete files. Prefer append over overwrite.' },
  [TaskMode.DEBUG_ONLY]: { blockedCategories: ['write', 'delete', 'git'], notes: 'Diagnostic reads + shell only. No production writes.' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Stage Manager
// ─────────────────────────────────────────────────────────────────────────────

export interface StageContext {
  userId: number;
  projectPath: string;
  userMessage: string;
  model: LanguageModel;
  signal?: AbortSignal;
}

export interface StagePlan {
  goal: string;
  filesInvolved: string[];
  steps: string[];
  risks: string[];
  testCommand: string;
  mode: TaskMode;
}

export class StageManager {
  private currentStage: ExecutionStage = ExecutionStage.INTENT_PARSE;
  private mode: TaskMode = TaskMode.NORMAL;
  private plan: StagePlan | null = null;
  private stageLog: Array<{ stage: ExecutionStage; startedAt: number; completedAt: number; success: boolean }> = [];

  constructor(private ctx: StageContext) {}

  /** Resolve the appropriate mode from the user's message content. */
  resolveMode(message: string): TaskMode {
    const t = message.toLowerCase();
    if (t.includes('just read') || t.includes('don\'t edit') || t.includes('read only') || t.includes('show me')) {
      return TaskMode.EXPLORATORY_READ;
    }
    if (t.includes('debug') || t.includes('what\'s wrong') || t.includes('why is') || t.includes('not working')) {
      return TaskMode.DEBUG_ONLY;
    }
    if (t.includes('refactor') && (t.includes('safe') || t.includes('careful') || t.includes('minimal'))) {
      return TaskMode.REFACTOR_SAFE;
    }
    if (t.includes('exactly') || t.includes('precise') || t.includes('strict')) {
      return TaskMode.STRICT_EDIT;
    }
    return TaskMode.NORMAL;
  }

  getStage(): ExecutionStage { return this.currentStage; }
  getMode(): TaskMode { return this.mode; }
  getPlan(): StagePlan | null { return this.plan; }

  setPlan(plan: StagePlan) {
    this.plan = plan;
  }

  /** Advance to the next stage. Returns false if already at final. */
  advanceStage(): boolean {
    const stages = Object.values(ExecutionStage);
    const idx = stages.indexOf(this.currentStage);
    if (idx >= stages.length - 1) return false;

    this.stageLog.push({
      stage: this.currentStage,
      startedAt: 0,
      completedAt: Date.now(),
      success: true,
    });

    this.currentStage = stages[idx + 1];
    return true;
  }

  /** Get the allowed tool categories for the current stage + mode. */
  getAllowedCategories(): Set<ToolCategory> {
    const allowed = new Set(STAGE_TOOL_ALLOWLIST[this.currentStage]);
    const modeRestriction = MODE_RESTRICTIONS[this.mode];
    if (modeRestriction.blockedCategories) {
      for (const cat of modeRestriction.blockedCategories) {
        allowed.delete(cat);
      }
    }
    return allowed;
  }

  /** Check if a tool name is allowed in current stage. */
  isToolAllowed(toolName: string): boolean {
    const cat = this.categorizeTool(toolName);
    if (!cat) return true; // unknown tools pass through
    return this.getAllowedCategories().has(cat);
  }

  /** Instrument tool execution — run before each tool call. */
  guardTool(toolName: string): { allowed: boolean; message?: string } {
    if (!this.isToolAllowed(toolName)) {
      const stage = this.currentStage;
      return {
        allowed: false,
        message: `Tool "${toolName}" is not allowed in stage "${stage}" with mode "${this.mode}". ` +
          `Allowed categories: ${Array.from(this.getAllowedCategories()).join(', ')}`,
      };
    }
    return { allowed: true };
  }

  /** Get the system prompt injection for the current stage (tells the AI what to do). */
  getStageInstruction(): string {
    const instructions: Record<ExecutionStage, string> = {
      [ExecutionStage.INTENT_PARSE]:
        `<stage name="intent_parse">\n` +
        `  <purpose>Understand the user's goal. Read project context. Identify relevant files.</purpose>\n` +
        `  <allowed_tools>read_file, list_dir, find_files, search_code, project_map</allowed_tools>\n` +
        `  <forbidden_tools>write_file, edit_file, delete_file, bash</forbidden_tools>\n` +
        `  <behavior>Do NOT modify any files. Do NOT run shell commands. Only read and explore.</behavior>\n` +
        `</stage>`,

      [ExecutionStage.PLAN]:
        `<stage name="plan">\n` +
        `  <purpose>Form an internal plan. List files you'll touch. Identify risks.</purpose>\n` +
        `  <allowed_tools>read_file, list_dir, find_files, search_code, project_map</allowed_tools>\n` +
        `  <forbidden_tools>write_file, edit_file, delete_file, bash</forbidden_tools>\n` +
        `  <behavior>Write your plan in a <suni_plan> block (never shown to user). ` +
        `Include: goal restatement, files involved, numbered steps, risks, test command. ` +
        `Do NOT modify any files yet.</behavior>\n` +
        `</stage>`,

      [ExecutionStage.EXECUTION]:
        `<stage name="execution">\n` +
        `  <purpose>Execute the plan. Write/edit files. Run setup commands.</purpose>\n` +
        `  <allowed_tools>All tools available</allowed_tools>\n` +
        `  <constraints>\n` +
        `    1. Only modify files listed in your plan. No scope creep.\n` +
        `    2. After every write: immediately read the file back and verify key changes are present.\n` +
        `    3. One change at a time. Verify each before moving to the next.\n` +
        `    4. If you hit an unexpected error, classify it (see error taxonomy) before retrying.\n` +
        `  </constraints>\n` +
        `</stage>`,

      [ExecutionStage.VERIFICATION]:
        `<stage name="verification">\n` +
        `  <purpose>Lint, test, and validate that changes work correctly.</purpose>\n` +
        `  <allowed_tools>bash (lint/test only), read_file</allowed_tools>\n` +
        `  <forbidden_tools>write_file, edit_file, delete_file</forbidden_tools>\n` +
        `  <behavior>1. Run linter. Fix all errors. 2. Run tests. Fix all failures. ` +
        `3. Verify all planned changes are present. ` +
        `Task is complete only when: all planned edits are confirmed present, ` +
        `all tests pass, and lint returns clean.</behavior>\n` +
        `</stage>`,

      [ExecutionStage.FINALIZE]:
        `<stage name="finalize">\n` +
        `  <purpose>Summarize what was done. Ensure git commit exists. Report results.</purpose>\n` +
        `  <allowed_tools>narration only (git handles itself)</allowed_tools>\n` +
        `  <behavior>Give a one-sentence plain-English summary of what changed and the outcome. ` +
        `Do NOT show file lists, diffs, or technical details.</behavior>\n` +
        `</stage>`,
    };

    const modeNote = MODE_RESTRICTIONS[this.mode].notes;
    return `<current_mode>${this.mode}</current_mode>\n` + instructions[this.currentStage] +
      (this.mode !== TaskMode.NORMAL ? `\n<mode_note>${modeNote}</mode_note>` : '');
  }

  /** Categorize a tool name. */
  private categorizeTool(name: string): ToolCategory | null {
    const READ_TOOLS = ['read_file', 'read_multiple', 'list_dir', 'list_directory', 'file_read', 'repo_map'];
    const WRITE_TOOLS = ['write_file', 'edit_file', 'file_write', 'file_edit', 'apply_diff', 'apply_whole'];
    const DELETE_TOOLS = ['delete_file'];
    const SHELL_TOOLS = ['bash', 'run_shell', 'run_shell_command', 'shell'];
    const SEARCH_TOOLS = ['find_files', 'search_code', 'grep', 'grep_search', 'semantic_search'];
    const GIT_TOOLS = ['git_commit', 'git_diff', 'git_status', 'checkpoint'];
    const MEMORY_TOOLS = ['save_memory', 'recall_memories', 'get_prompt_template', 'summarize_context', 'recall'];
    const WEB_TOOLS = ['web_search', 'fetch_url'];

    if (READ_TOOLS.includes(name)) return 'read';
    if (WRITE_TOOLS.includes(name)) return 'write';
    if (DELETE_TOOLS.includes(name)) return 'delete';
    if (SHELL_TOOLS.includes(name)) return 'shell';
    if (SEARCH_TOOLS.includes(name)) return 'search';
    if (GIT_TOOLS.includes(name)) return 'git';
    if (MEMORY_TOOLS.includes(name)) return 'memory';
    if (WEB_TOOLS.includes(name)) return 'web';
    return null; // unclassified → allowed
  }

  getLog(): Array<{ stage: ExecutionStage; startedAt: number; completedAt: number; success: boolean }> {
    return this.stageLog;
  }

  /** Reset for a new task cycle. */
  reset(message: string) {
    this.currentStage = ExecutionStage.INTENT_PARSE;
    this.mode = this.resolveMode(message);
    this.plan = null;
    this.stageLog = [];
    this.stageLog.push({ stage: this.currentStage, startedAt: Date.now(), completedAt: 0, success: false });
  }

  markStageStarted() {
    if (this.stageLog.length > 0) {
      this.stageLog[this.stageLog.length - 1].startedAt = Date.now();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createStageManager(ctx: StageContext): StageManager {
  return new StageManager(ctx);
}
