import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger before importing mutex
vi.mock('@/logger', () => ({
  default: {
    warn: vi.fn(),
  },
}));

import { Mutex } from '@/utils/mutex';

describe('Mutex', () => {
  let mutex: Mutex;

  beforeEach(() => {
    mutex = new Mutex();
    // Mock setTimeout for faster tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('acquire', () => {
    it('should acquire lock for a resource and return release function', async () => {
      const release = await mutex.acquire('test-resource');
      expect(typeof release).toBe('function');
      expect(mutex.isLocked('test-resource')).toBe(true);
      expect(mutex.getActiveLockCount()).toBe(1);
    });

    it('should allow multiple different resources to be locked simultaneously', async () => {
      const release1 = await mutex.acquire('resource1');
      const release2 = await mutex.acquire('resource2');

      expect(mutex.isLocked('resource1')).toBe(true);
      expect(mutex.isLocked('resource2')).toBe(true);
      expect(mutex.getActiveLockCount()).toBe(2);

      release1();
      release2();
    });

    it('should not allow same resource to be locked twice (queues the second request)', async () => {
      const release1 = await mutex.acquire('test-resource');
      expect(mutex.isLocked('test-resource')).toBe(true);

      let acquired2 = false;
      mutex.acquire('test-resource').then(() => {
        acquired2 = true;
      });

      // Wait a bit, it should still be locked and second request not granted
      await vi.advanceTimersByTimeAsync(50);
      expect(acquired2).toBe(false);
      expect(mutex.getActiveLockCount()).toBe(1);

      // Release first lock
      release1();

      // Second request should now be granted
      await vi.advanceTimersByTimeAsync(20);
      expect(acquired2).toBe(true);
      expect(mutex.getActiveLockCount()).toBe(1);
    });

    it('should throw timeout error when lock cannot be acquired within timeout', async () => {
      const release = await mutex.acquire('test-resource');

      const timeoutPromise = mutex.acquire('test-resource', 100);

      // Advance time past the timeout
      vi.advanceTimersByTime(110);

      await expect(timeoutPromise).rejects.toThrow('Mutex timeout after 100ms waiting for lock: test-resource');

      release();
    });

    it('should use default timeout when not specified', async () => {
      const release = await mutex.acquire('test-resource');

      // Create a timeout promise with default timeout
      const timeoutPromise = mutex.acquire('test-resource');

      // Advance time past the default timeout (30000ms)
      vi.advanceTimersByTime(30001);

      // Capture the error to avoid unhandled rejection
      await expect(timeoutPromise).rejects.toThrow('Mutex timeout after 30000ms waiting for lock: test-resource');

      release();
    });
  });

  describe('withLock', () => {
    it('should execute function with lock and automatically release', async () => {
      const mockFn = vi.fn().mockResolvedValue('test-result');

      const result = await mutex.withLock('test-resource', mockFn);

      expect(result).toBe('test-result');
      expect(mockFn).toHaveBeenCalledOnce();
      expect(mutex.isLocked('test-resource')).toBe(false);
    });

    it('should release lock even if function throws error', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('test error'));

      await expect(mutex.withLock('test-resource', mockFn)).rejects.toThrow('test error');
      expect(mockFn).toHaveBeenCalledOnce();
      expect(mutex.isLocked('test-resource')).toBe(false);
    });

    it('should queue multiple requests for same resource', async () => {
      const results: string[] = [];

      const fn1 = async () => {
        results.push('start1');
        await new Promise((resolve) => setTimeout(resolve, 100));
        results.push('end1');
        return 'result1';
      };

      const fn2 = async () => {
        results.push('start2');
        results.push('end2');
        return 'result2';
      };

      const promise1 = mutex.withLock('test-resource', fn1);
      const promise2 = mutex.withLock('test-resource', fn2);

      // Initially, only fn1 should have started because it holds the lock
      // Note: acquire is async, so we need to wait a tick
      await vi.advanceTimersByTimeAsync(0);
      expect(results).toEqual(['start1']);

      // Advance time to complete fn1
      await vi.advanceTimersByTimeAsync(100);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(results).toEqual(['start1', 'end1', 'start2', 'end2']);
    });
  });

  describe('isLocked', () => {
    it('should return false for unlocked resource', () => {
      expect(mutex.isLocked('nonexistent-resource')).toBe(false);
    });

    it('should return true for locked resource', async () => {
      const release = await mutex.acquire('test-resource');
      expect(mutex.isLocked('test-resource')).toBe(true);
      release();
      expect(mutex.isLocked('test-resource')).toBe(false);
    });
  });

  describe('getActiveLockCount', () => {
    it('should return 0 for no locks', () => {
      expect(mutex.getActiveLockCount()).toBe(0);
    });

    it('should return correct count for multiple locks', async () => {
      const release1 = await mutex.acquire('resource1');
      expect(mutex.getActiveLockCount()).toBe(1);

      const release2 = await mutex.acquire('resource2');
      expect(mutex.getActiveLockCount()).toBe(2);

      release1();
      expect(mutex.getActiveLockCount()).toBe(1);

      release2();
      expect(mutex.getActiveLockCount()).toBe(0);
    });
  });

  describe('getLockedResources', () => {
    it('should return empty array for no locks', () => {
      expect(mutex.getLockedResources()).toEqual([]);
    });

    it('should return array of locked resource names', async () => {
      const release1 = await mutex.acquire('resource1');
      const release2 = await mutex.acquire('resource2');

      const lockedResources = mutex.getLockedResources();
      expect(lockedResources).toHaveLength(2);
      expect(lockedResources).toContain('resource1');
      expect(lockedResources).toContain('resource2');

      release1();
      expect(mutex.getLockedResources()).toEqual(['resource2']);

      release2();
      expect(mutex.getLockedResources()).toEqual([]);
    });
  });

  describe('releaseAll', () => {
    it('should release all locks and reset counters', async () => {
      await mutex.acquire('resource1');
      await mutex.acquire('resource2');
      expect(mutex.getActiveLockCount()).toBe(2);

      mutex.releaseAll();

      expect(mutex.getActiveLockCount()).toBe(0);
      expect(mutex.getLockedResources()).toEqual([]);
      expect(mutex.isLocked('resource1')).toBe(false);
      expect(mutex.isLocked('resource2')).toBe(false);
    });

    it('should handle releaseAll when no locks exist', () => {
      expect(() => mutex.releaseAll()).not.toThrow();
    });
  });

  describe('convenience functions', () => {
    it('should work with global mutex instance', async () => {
      // Import the global mutex instance
      const { mutex: globalMutex, withLock, acquireLock, isLocked } = await import('@/utils/mutex');

      const release = await acquireLock('test-global-resource');
      expect(isLocked('test-global-resource')).toBe(true);

      const result = await withLock('test-global-resource-2', () => 'test');
      expect(result).toBe('test');

      release();
      expect(isLocked('test-global-resource')).toBe(false);

      // Clean up
      globalMutex.releaseAll();
    });
  });
});
