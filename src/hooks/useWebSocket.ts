import { useEffect, useRef, useCallback } from 'react';

interface WSMessage {
  event: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  onMessage: (msg: WSMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(3000);
  // Incremented on every intentional close. Each connection captures its own
  // generation value — if it differs at close time, the close was intentional
  // (cleanup / StrictMode unmount) and we must NOT reconnect.
  const connectionGen = useRef(0);
  // Always-current options ref — prevents stale closures when state changes
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
    const myGen = connectionGen.current; // captured for this specific connection

    const newWs = new WebSocket(wsUrl);
    ws.current = newWs;

    newWs.onopen = () => {
      reconnectDelay.current = 3000;
      optionsRef.current.onConnect?.();
    };

    newWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WSMessage;
        optionsRef.current.onMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    newWs.onclose = () => {
      optionsRef.current.onDisconnect?.();
      // Generation mismatch means cleanup already ran — do NOT reconnect
      if (connectionGen.current !== myGen) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 1.5, 30000);
        connect();
      }, reconnectDelay.current);
    };

    newWs.onerror = () => {
      newWs.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    connect();
    return () => {
      connectionGen.current++; // invalidate this connection's onclose handler
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send };
}
