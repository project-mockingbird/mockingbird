import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WebSocketEvent } from '@/lib/types';

export function useWebSocket() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data: WebSocketEvent = JSON.parse(event.data);
      if (
        data.type === 'item:added' ||
        data.type === 'item:changed' ||
        data.type === 'item:removed' ||
        data.type === 'item:moved'
      ) {
        queryClient.invalidateQueries({ queryKey: ['tree'] });
        // Tree rendering uses useChildren(parentId, database) keyed
        // ['children', parentId, database]. Blanket invalidate the prefix so
        // both old-parent and new-parent children lists refetch on 'moved'.
        queryClient.invalidateQueries({ queryKey: ['children'] });
        // Templates picker (Insert-from-template dialog) caches the full
        // /sitecore/templates listing. A new template item under that root
        // should appear without a manual refresh.
        queryClient.invalidateQueries({ queryKey: ['all-templates'] });
        if (data.id) queryClient.invalidateQueries({ queryKey: ['item', data.id] });
      }
      if (data.type === 'validation:updated') {
        queryClient.invalidateQueries({ queryKey: ['validation'] });
      }
      if (data.type === 'tree:refresh') {
        // Multi-item subtree change (e.g. SXA scaffolding). Invalidate tree
        // and children-by-parent caches so the SPA re-fetches in one round
        // rather than chasing per-item events.
        queryClient.invalidateQueries({ queryKey: ['tree'] });
        queryClient.invalidateQueries({ queryKey: ['children'] });
        queryClient.invalidateQueries({ queryKey: ['all-templates'] });
      }
    };

    ws.onclose = () => { setTimeout(() => { if (wsRef.current === ws) wsRef.current = null; }, 3000); };

    return () => { ws.close(); };
  }, [queryClient]);
}
