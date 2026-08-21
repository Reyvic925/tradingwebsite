import { useEffect, useRef, useState } from 'react';
import { authHeaders } from './api';

/**
 * Hook to animate PnL numbers smoothly
 * @param targetValue - The value to animate to
 * @param duration - Animation duration in ms
 * @param decimals - Number of decimal places
 * @returns Animated display value
 */
export function usePnlAnimation(targetValue: number, duration: number = 1000, decimals: number = 2): number {
  const [displayValue, setDisplayValue] = useState<number>(targetValue);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    const startValue = displayValue;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out-cubic)
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const currentValue = startValue + (targetValue - startValue) * easeProgress;
      setDisplayValue(parseFloat(currentValue.toFixed(decimals)));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration, decimals]);

  return displayValue;
}

/**
 * Hook to manage user's copy trading positions
 * @returns Object with follows, summary, methods
 */
export function useCopyTrading() {
  const [follows, setFollows] = useState<any[]>([]);
  const [summary, setSummary] = useState<Record<string, any>>({
    total_invested: 0,
    total_current: 0,
    total_pnl: 0,
    total_pnl_percent: 0,
    count: 0
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFollows = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/copy-trades', {
        headers: await authHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch follows');
      const data = await response.json();
      setFollows(data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await fetch('/api/copy-summary', {
        headers: await authHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch summary');
      const data = await response.json();
      setSummary(data);
    } catch (err: unknown) {
      console.error('Summary error:', err);
    }
  };

  const followTrader = async (traderId: string | number, allocatedAmount: number, settings: Record<string, any> = {}) => {
    try {
      const response = await fetch('/api/copy-trades', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          trader_id: traderId,
          allocated_amount: allocatedAmount,
          stop_loss_percent: (settings as any).stopLoss || 20,
          take_profit_percent: (settings as any).takeProfit || 200,
          leverage_multiplier: (settings as any).leverage || 1
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Failed to follow trader (${response.status})`);
      await fetchFollows();
      await fetchSummary();
      return data;
    } catch (err) {
      throw err;
    }
  };

  const updateFollow = async (followId: string, settings: Record<string, any>) => {
    try {
      const response = await fetch(`/api/copy-trades?id=${followId}`, {
        method: 'PUT',
        headers: await authHeaders(),
        body: JSON.stringify({
          stop_loss_percent: (settings as any).stopLoss,
          take_profit_percent: (settings as any).takeProfit,
          leverage_multiplier: (settings as any).leverage
        })
      });
      if (!response.ok) throw new Error('Failed to update follow');
      const data = await response.json();
      await fetchFollows();
      return data;
    } catch (err) {
      throw err;
    }
  };

  const stopCopying = async (followId: string) => {
    try {
      const response = await fetch(`/api/copy-trades?id=${followId}`, {
        method: 'DELETE',
        headers: await authHeaders()
      });
      if (!response.ok) throw new Error('Failed to stop copying');
      await fetchFollows();
      await fetchSummary();
      return { ok: true };
    } catch (err: unknown) {
      throw err;
    }
  };

  useEffect(() => {
    fetchFollows();
    fetchSummary();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchFollows();
      fetchSummary();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    follows,
    summary,
    loading,
    error,
    fetchFollows,
    fetchSummary,
    followTrader,
    updateFollow,
    stopCopying,
    refresh: () => {
      fetchFollows();
      fetchSummary();
    }
  };
}

/**
 * Hook to fetch leaderboard data
 * @returns Array of leaderboard entries
 */
export function useLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/leaderboard');
        if (!response.ok) throw new Error('Failed to fetch leaderboard');
        const data = await response.json();
        setLeaderboard(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();

    // Refresh every minute
    const interval = setInterval(fetchLeaderboard, 60000);
    return () => clearInterval(interval);
  }, []);

  return { leaderboard, loading, error };
}

/**
 * Hook to fetch trader's trade logs
 * @param traderId - Trader ID
 * @returns Array of trade logs
 */
export function useTraderTrades(traderId: string | null) {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traderId) return;

    const fetchTrades = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/trader-trades?traderId=${traderId}`);
        if (!response.ok) throw new Error('Failed to fetch trades');
        const data = await response.json();
        setTrades(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();

    // Refresh every 10 seconds
    const interval = setInterval(fetchTrades, 10000);
    return () => clearInterval(interval);
  }, [traderId]);

  return { trades, loading, error };
}

/**
 * Hook to fetch traders list
 * @param session - Optional session filter
 * @param asset - Optional asset filter
 * @returns Array of traders
 */
export function useTraders(session: string | null = null, asset: string | null = null) {
  const [traders, setTraders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTraders = async () => {
      try {
        setLoading(true);
        let url = '/api/traders';
        const params = new URLSearchParams();
        if (session) params.append('session', session);
        if (asset) params.append('asset', asset);
        if (params.toString()) url += '?' + params.toString();

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch traders');
        const data = await response.json();
        setTraders(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchTraders();

    // Refresh every 30 seconds
    const interval = setInterval(fetchTraders, 30000);
    return () => clearInterval(interval);
  }, [session, asset]);

  return { traders, loading, error };
}

/**
 * Hook to fetch and manage notifications
 * @returns Notifications and methods
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await fetch('/api/notifications', {
          headers: await authHeaders()
        });
        if (!response.ok) return;
        const data = await response.json();
        setNotifications(data);
        setUnreadCount(data.filter((n: any) => !n.read).length);
      } catch (err) {
        console.error('Notification fetch error:', err);
      }
    };

    fetchNotifications();

    // Poll every 15 seconds
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications?id=${notificationId}`, {
        method: 'PUT',
        headers: await authHeaders()
      });
      if (response.ok) {
        setNotifications((prev: any[]) =>
          prev.map((n: any) => n.id === notificationId ? { ...n, read: true } : n)
        );
        setUnreadCount((prev: number) => Math.max(0, prev - 1));
      }
    } catch (err: unknown) {
      console.error('Mark read error:', err);
    }
  }

  return { notifications, unreadCount, markAsRead };
}
