import { useQuery } from '@tanstack/react-query';

export interface LastSession {
  projectHash: string;
  profileName: string;
}

export function useLastSession() {
  return useQuery<LastSession | null>({
    queryKey: ['last-session'],
    queryFn: async () => {
      const res = await fetch('/api/projects/last-session');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      return body && typeof body === 'object' && body.projectHash ? body : null;
    },
    retry: false,
  });
}
