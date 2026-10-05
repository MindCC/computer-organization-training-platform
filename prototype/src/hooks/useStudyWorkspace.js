import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../apiClient.js';
import { createRandomId } from '../shared/randomId.js';
import { useVisibilityInterval } from './useVisibilityInterval.js';

const BASE = '/api/student/study-workspace';
export function useStudyWorkspace() {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [, tick] = useState(0);
  const mounted = useRef(true), sequence = useRef(0), inFlight = useRef(false), stamp = useRef(0), nonce = useRef(null);
  function accept(result) { stamp.current = performance.now(); if (result.active?.clientId === nonce.current || result.history.some(t => t.clientId === nonce.current)) nonce.current = null; setData(result); }
  async function refresh() {
    if (inFlight.current) return;
    const seq = ++sequence.current; inFlight.current = seq;
    try { const result = await apiRequest(BASE); if (mounted.current && seq === sequence.current) { accept(result); setError(''); } }
    catch (failure) { if (mounted.current && seq === sequence.current) setError(failure.message); }
    finally { if (inFlight.current === seq) inFlight.current = false; if (mounted.current && seq === sequence.current) setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true; refresh();
    const visible = () => { if (document.visibilityState === 'visible') { tick(v => v + 1); refresh(); } };
    document.addEventListener('visibilitychange', visible);
    return () => { mounted.current = false; sequence.current++; inFlight.current = false; document.removeEventListener('visibilitychange', visible); };
  }, []);
  useVisibilityInterval(() => tick(v => v + 1), 1000, data?.active?.status === 'running');
  useVisibilityInterval(refresh, 15000, Boolean(data?.active));
  const active = data?.active ?? null;
  const remainingMs = active ? Math.max(0, active.remainingMs - (active.status === 'running' ? performance.now() - stamp.current : 0)) : 0;
  async function mutate(path, body, method = 'POST') {
    if (inFlight.current) return false;
    const seq = ++sequence.current; inFlight.current = seq; setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest(BASE + path, { method, body: JSON.stringify(body) });
      if (path === '/timer') nonce.current = null;
      const result = await apiRequest(BASE);
      if (!mounted.current || seq !== sequence.current) return false;
      accept(result); setNotice(path.includes('/plans') ? '学习计划已保存。' : path.endsWith('/finish') ? '本轮学习记录已保存。' : '计时状态已保存。'); return true;
    } catch (failure) { if (mounted.current && seq === sequence.current) setError(`${failure.message}；可刷新读取服务器记录后重试。`); return false; }
    finally { if (inFlight.current === seq) inFlight.current = false; if (mounted.current && seq === sequence.current) setBusy(false); }
  }
  const start = input => { nonce.current ??= createRandomId(); return mutate('/timer', { ...input, clientId: nonce.current }); };
  const timerAction = (action, body = {}) => mutate(`/timer/${active.id}/${action}`, { revision: active.revision, ...body });
  return { data, active, remainingMs, loading, busy, error, notice, refresh, mutate, start, timerAction };
}
