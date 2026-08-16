import { useEffect, useRef, useState } from 'react';

/**
 * Hook to animate PnL numbers smoothly
 * @param targetValue - The value to animate to
 * @param duration - Animation duration in ms
 * @param decimals - Number of decimal places
 * @returns Animated display value
 */
export function usePnlAnimation(targetValue, duration = 1000, decimals = 2) {
  const [displayValue, setDisplayValue] = useState(targetValue);
  const animationRef = useRef(null);

  useEffect(() => {
    if (animationRef.current) {
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
      if (animationRef.current) {
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
  const [follows, setFollows] = useState([]);
  const [summary, setSummary] = useState({
    total_invested: 0,
    total_current: 0,
    total_pnl: 0,
    total_pnl_percent: 0,
    count: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFollows = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/copy-trades', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch follows');
      const data = await response.json();
      setFollows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await fetch('/api/copy-summary', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch summary');
      const data = await response.json();
      setSummary(data);
    } catch (err) {
      console.error('Summary error:', err);
    }
  };

  const followTrader = async (traderId, allocatedAmount, settings = {}) => {
    try {
      const response = await fetch('/api/copy-trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          trader_id: traderId,
          allocated_amount: allocatedAmount,
          stop_loss_percent: settings.stopLoss || 20,
          take_profit_percent: settings.takeProfit || 200,
          leverage_multiplier: settings.leverage || 1
        })
      });
      if (!response.ok) throw new Error('Failed to follow trader');
      const data = await response.json();
      await fetchFollows();
      await fetchSummary();
      return data;
    } catch (err) {
      throw err;
    }
  };

  const updateFollow = async (followId, settings) => {
    try {
      const response = await fetch(`/api/copy-trades?id=${followId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          stop_loss_percent: settings.stopLoss,
          take_profit_percent: settings.takeProfit,
          leverage_multiplier: settings.leverage
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

  const stopCopying = async (followId) => {
    try {
      const response = await fetch(`/api/copy-trades?id=${followId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to stop copying');
      await fetchFollows();
      await fetchSummary();
      return { ok: true };
    } catch (err) {
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
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/leaderboard');
        if (!response.ok) throw new Error('Failed to fetch leaderboard');
        const data = await response.json();
        setLeaderboard(data);
      } catch (err) {
        setError(err.message);
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
export function useTraderTrades(traderId) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!traderId) return;

    const fetchTrades = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/trader-trades?traderId=${traderId}`);
        if (!response.ok) throw new Error('Failed to fetch trades');
        const data = await response.json();
        setTrades(data);
      } catch (err) {
        setError(err.message);
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
export function useTraders(session = null, asset = null) {
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      } catch (err) {
        setError(err.message);
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
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await fetch('/api/notifications', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });
        if (!response.ok) return;
        const data = await response.json();
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.read).length);
      } catch (err) {
        console.error('Notification fetch error:', err);
      }
    };

    fetchNotifications();

    // Poll every 15 seconds
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (notificationId) => {
    try {
      const response = await fetch(`/api/notifications?id=${notificationId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      if (response.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Mark read error:', err);
    }
  };

  return { notifications, unreadCount, markAsRead };
}
