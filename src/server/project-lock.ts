/**
 * SUNy Project Lock — session-level lock per project.
 *
 * Prevents concurrent mutations from multiple tabs/sessions on the same project.
 * Uses the project_locks DB table with expiry to handle crashes gracefully.
 */

import { getDb } from './db';

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max lock duration

export interface ProjectLock {
  projectId: number;
  userId: number;
  sessionId: string;
  lockedAt: string;
  expiresAt: string;
}

/**
 * Acquire a lock for a project session.
 * Returns true if lock acquired, false if another session holds it.
 */
export function acquireLock(projectId: number, userId: number, sessionId: string): boolean {
  const db = getDb();

  // Clean expired locks first
  db.prepare('DELETE FROM project_locks WHERE expires_at < datetime(?)').run(new Date().toISOString());

  const existing = db.prepare(
    'SELECT * FROM project_locks WHERE project_id = ?',
  ).get(projectId) as ProjectLock | undefined;

  if (existing) {
    // Same session — refresh the lock
    if (existing.sessionId === sessionId) {
      const expiresAt = new Date(Date.now() + LOCK_TIMEOUT_MS).toISOString();
      db.prepare(
        'UPDATE project_locks SET expires_at = ? WHERE project_id = ?',
      ).run(expiresAt, projectId);
      return true;
    }
    // Different session holds it — deny
    return false;
  }

  // No existing lock — create one
  const expiresAt = new Date(Date.now() + LOCK_TIMEOUT_MS).toISOString();
  try {
    db.prepare(
      `INSERT INTO project_locks (project_id, user_id, session_id, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).run(projectId, userId, sessionId, expiresAt);
    return true;
  } catch {
    return false;
  }
}

/**
 * Release a lock for a project session.
 */
export function releaseLock(projectId: number, sessionId: string): void {
  const db = getDb();
  db.prepare(
    'DELETE FROM project_locks WHERE project_id = ? AND session_id = ?',
  ).run(projectId, sessionId);
}

/**
 * Check if a project is locked by another session.
 */
export function isLockedByOther(projectId: number, sessionId: string): boolean {
  const db = getDb();
  const lock = db.prepare(
    'SELECT * FROM project_locks WHERE project_id = ? AND session_id != ? AND expires_at >= datetime(?)',
  ).get(projectId, sessionId, new Date().toISOString()) as ProjectLock | undefined;
  return !!lock;
}

/**
 * Check if lock is active (for UI status).
 */
export function getLockStatus(projectId: number): { locked: boolean; sessionId?: string } | null {
  const db = getDb();
  db.prepare('DELETE FROM project_locks WHERE expires_at < datetime(?)').run(new Date().toISOString());
  const lock = db.prepare(
    'SELECT * FROM project_locks WHERE project_id = ?',
  ).get(projectId) as ProjectLock | undefined;
  if (!lock) return { locked: false };
  return { locked: true, sessionId: lock.sessionId };
}
