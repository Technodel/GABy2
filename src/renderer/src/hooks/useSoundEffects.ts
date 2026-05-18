import { useRef, useEffect } from 'react';

function soundsEnabled(): boolean {
  try { return localStorage.getItem('suny_sounds_enabled') !== 'false'; } catch { return true; }
}

export function useSoundEffects() {
  const sharedCtxRef = useRef<AudioContext | null>(null);
  const ctxResumedRef = useRef(false);

  function getAudioContext(): AudioContext {
    if (!sharedCtxRef.current) {
      sharedCtxRef.current = new AudioContext();
    }
    if (!ctxResumedRef.current && sharedCtxRef.current.state === 'suspended') {
      sharedCtxRef.current.resume().then(() => { ctxResumedRef.current = true; }).catch(() => {});
    }
    return sharedCtxRef.current;
  }

  useEffect(() => {
    function onUserGesture() {
      if (sharedCtxRef.current && sharedCtxRef.current.state === 'suspended') {
        sharedCtxRef.current.resume().then(() => { ctxResumedRef.current = true; }).catch(() => {});
      }
    }
    window.addEventListener('keydown', onUserGesture, { once: true });
    window.addEventListener('mousedown', onUserGesture, { once: true });
    return () => {
      window.removeEventListener('keydown', onUserGesture);
      window.removeEventListener('mousedown', onUserGesture);
    };
  }, []);

  function playSound(type: 'send' | 'receive' | 'tool' | 'success' | 'error') {
    if (!soundsEnabled()) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.type = 'square';
      switch (type) {
        case 'send':
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(1320, now + 0.06);
          gain.gain.setValueAtTime(0.04, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc.start(now); osc.stop(now + 0.12);
          break;
        case 'receive':
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.linearRampToValueAtTime(660, now + 0.07);
          osc.frequency.linearRampToValueAtTime(550, now + 0.14);
          gain.gain.setValueAtTime(0.04, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.start(now); osc.stop(now + 0.2);
          break;
        case 'tool':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.setValueAtTime(800, now + 0.05);
          gain.gain.setValueAtTime(0.03, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.start(now); osc.stop(now + 0.1);
          break;
        case 'success':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, now);
          osc.frequency.setValueAtTime(659, now + 0.08);
          osc.frequency.setValueAtTime(784, now + 0.16);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
          osc.start(now); osc.stop(now + 0.28);
          break;
        case 'error':
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          osc.start(now); osc.stop(now + 0.18);
          break;
      }
    } catch { /* AudioContext may be unavailable */ }
  }

  return { playSound };
}
