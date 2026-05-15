import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth, AuthRequest } from './auth';
import { getDb } from './db';
import { hasSufficientBalance, getUserBalance, friendlySessionLimit, deductUsage, transferToWallet } from './billing';
import { isBridgeConnected } from './bridge-manager';
import { userClientManager } from './user-client-manager';

const router = Router();
router.use(requireAuth);

// ── User profile & balance ─────────────────────────────────────────────────────

router.get('/me', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const db = getDb();
  const row = db.prepare(`
    SELECT id, username, display_name, balance, wallet_balance, wallet_auto_spend, selected_mode, max_tokens_per_session, is_active
    FROM users WHERE id = ?
  `).get(user.id) as UserRow | undefined;

  if (!row) { res.status(404).json({ error: 'User not found' }); return; }

  const pricing = db.prepare('SELECT * FROM pricing_modes ORDER BY id').all();
  const settings = getDb().prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[];
  const settingsMap: Record<string, string> = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  res.json({
    id: row.id,
    username: row.username,
    display_name: row.display_name ?? null,
    balance: row.balance,
    wallet_balance: row.wallet_balance,
    wallet_auto_spend: row.wallet_auto_spend === 1,
    selected_mode: row.selected_mode,
    session_limit_label: friendlySessionLimit(row.max_tokens_per_session),
    is_active: row.is_active === 1,
    auto_approve: settingsMap.auto_approve === 'true',
    modes: (pricing as PricingRow[]).map(p => {
      const keyCount = (db.prepare('SELECT COUNT(*) as cnt FROM api_keys WHERE mode = ? AND is_active = 1').get(p.mode) as { cnt: number }).cnt;
      return {
        mode: p.mode,
        display_name: p.display_name,
        description: p.description ?? '',
        // Never expose formula, token costs, or max_tokens as raw numbers
        session_limit_label: friendlySessionLimit(p.global_max_tokens),
        has_active_key: keyCount > 0,
      };
    }),
    bridge_connected: isBridgeConnected(user.id as number),
  });
});

// ── Update display name ────────────────────────────────────────────────────────────────────────

router.patch('/me/name', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const raw = (req.body as { display_name?: unknown }).display_name;
  const name = typeof raw === 'string' ? raw.trim().slice(0, 50) || null : null;
  getDb().prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, user.id);
  res.json({ success: true });
});

router.patch('/me/mode', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const schema = z.object({ mode: z.enum(['free', 'fast', 'pro']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid mode' }); return; }
  getDb().prepare('UPDATE users SET selected_mode = ? WHERE id = ?').run(parsed.data.mode, user.id);
  res.json({ success: true });
});

// ── Projects ───────────────────────────────────────────────────────────────────

router.get('/projects', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const projects = getDb().prepare('SELECT id, name, local_path, created_at FROM projects WHERE user_id = ?').all(user.id);
  res.json(projects);
});

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  local_path: z.string().min(1).max(500),
});

router.post('/projects', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const parsed = CreateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }
  const result = getDb().prepare('INSERT INTO projects (user_id, name, local_path) VALUES (?, ?, ?)').run(
    user.id, parsed.data.name, parsed.data.local_path
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

router.delete('/projects/:id', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  getDb().prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, user.id);
  res.json({ success: true });
});

// ── Memories ───────────────────────────────────────────────────────────────────

router.get('/memories', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const memories = getDb().prepare(`
    SELECT id, content, created_at FROM user_memories WHERE user_id = ? ORDER BY created_at DESC
  `).all(user.id);
  res.json(memories);
});

const AddMemorySchema = z.object({
  content: z.string().min(1).max(500),
});

router.post('/memories', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const parsed = AddMemorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }
  const result = getDb().prepare('INSERT INTO user_memories (user_id, content) VALUES (?, ?)').run(user.id, parsed.data.content);
  res.json({ success: true, id: result.lastInsertRowid });
});

router.delete('/memories/:id', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
  getDb().prepare('DELETE FROM user_memories WHERE id = ? AND user_id = ?').run(id, user.id);
  res.json({ success: true });
});

router.delete('/memories', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  getDb().prepare('DELETE FROM user_memories WHERE user_id = ?').run(user.id);
  res.json({ success: true });
});

// ── User settings ──────────────────────────────────────────────────────────────

const UserSettingsSchema = z.object({
  dark_mode: z.boolean().optional(),
  auto_approve: z.boolean().optional(),
  memory_enabled: z.boolean().optional(),
  auto_backup_enabled: z.boolean().optional(),
  auto_backup_trigger: z.enum(['task', 'tokens', 'minutes']).optional(),
  auto_backup_interval: z.number().int().min(1).optional(),
  max_tokens_per_session: z.number().int().positive().nullable().optional(),
});

router.patch('/settings', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const parsed = UserSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }
  const db = getDb();
  const update = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
  for (const [key, val] of Object.entries(parsed.data)) {
    if (val !== undefined && key !== 'max_tokens_per_session') {
      update.run(`user_${user.id}_${key}`, String(val));
    }
  }
  // max_tokens_per_session lives on the users table
  if (parsed.data.max_tokens_per_session !== undefined) {
    db.prepare('UPDATE users SET max_tokens_per_session = ? WHERE id = ?')
      .run(parsed.data.max_tokens_per_session, user.id);
  }
  res.json({ success: true });
});

// ── Change password ────────────────────────────────────────────────────────────

const ChangePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6).max(100),
});

router.post('/change-password', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'New password must be at least 6 characters.' }); return; }
  const db = getDb();
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string } | undefined;
  if (!row) { res.status(404).json({ error: 'User not found' }); return; }
  if (!bcrypt.compareSync(parsed.data.current_password, row.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' }); return;
  }
  const newHash = bcrypt.hashSync(parsed.data.new_password, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
  res.json({ success: true });
});

// ── Public contact info (for Contact Us page) ──────────────────────────────────

router.get('/contact', (_req: Request, res: Response) => {
  const info = getDb().prepare('SELECT phone, email, website, whatsapp, support_message FROM contact_info WHERE id = 1').get();
  res.json(info || {});
});

// ── Public pricing (for landing page, no auth required) ───────────────────────

router.get('/pricing-public', (_req: Request, res: Response) => {
  const modes = getDb().prepare(
    'SELECT mode, display_name, description, input_token_base_cost, output_token_base_cost FROM pricing_modes ORDER BY id'
  ).all();
  res.json(modes);
});

// ── Balance check ──────────────────────────────────────────────────────────────

router.get('/balance', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const balance = getUserBalance(user.id as number);
  res.json({ balance });
});

interface UserRow {
  id: number;
  username: string;
  display_name: string | null;
  balance: number;
  wallet_balance: number;
  wallet_auto_spend: number;
  selected_mode: string;
  max_tokens_per_session: number | null;
  is_active: number;
}

interface PricingRow {
  mode: string;
  display_name: string;
  description: string;
  global_max_tokens: number | null;
}

// ── Bridge token (for BridgeSetup page) ───────────────────────────────────────
// Returns the same JWT already in the cookie so the bridge CLI can use it.
// Since it's httpOnly, the frontend can't read the cookie directly.
router.get('/bridge-token', (req: Request, res: Response) => {
  const token = req.cookies?.gaby_token;
  if (!token) { res.status(401).json({ error: 'Not authenticated' }); return; }
  res.json({ token });
});

// ── Wallet ─────────────────────────────────────────────────────────────────────

const TransferSchema = z.object({
  amount: z.number().positive(),
});

/** Transfer credits → wallet (bot fuel tank). */
router.post('/wallet/transfer', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const parsed = TransferSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid amount' }); return; }
  try {
    const result = transferToWallet(user.id as number, parsed.data.amount);
    // Push both updated balances to the browser tab
    userClientManager.pushToUser(user.id as number, 'gaby:balance', {
      balance: result.newBalance,
      wallet_balance: result.newWalletBalance,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Transfer failed' });
  }
});

/** Toggle wallet auto-spend (drain main balance when wallet is empty). */
router.patch('/wallet/auto-spend', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }
  getDb().prepare('UPDATE users SET wallet_auto_spend = ? WHERE id = ?')
    .run(parsed.data.enabled ? 1 : 0, user.id);
  res.json({ success: true });
});

export default router;
