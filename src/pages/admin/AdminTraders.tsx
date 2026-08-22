import React, { useState, useEffect } from 'react';
import AdminShell from '../../components/AdminShell';
import { Plus, Edit2, Save, X, Eye, EyeOff } from 'lucide-react';
import { formatMoney, formatPct } from '../../lib/format';
import { authHeaders } from '../../lib/api';
import type { Trader } from '../../types';

function createEmptyFormData() {
  return {
    name: '', bio: '', country: '', avatar_url: '', specialty: '', badge: 'Gold',
    asset_focus: ['BTC-USD', 'ETH-USD'], session_type: 'nyc', risk_level: 'Medium',
    current_equity: 10000, total_return: 0, daily_return: 0, monthly_return: 0,
    total_trades: 0, win_rate_trades: 50, max_drawdown: 0, followers: 0,
    copiers_current: 0, copiers_all_time: 0, profit_for_copiers: 0,
    profit_sharing_fee: 20, under_management: 0, drift: 0.001, volatility: 0.005,
    risk_score: 5, session_start: '', session_end: ''
  };
}

export default function AdminTraders() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [avatarData, setAvatarData] = useState('');
  const [formData, setFormData] = useState(createEmptyFormData());

  const fetchTraders = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/traders?include_inactive=1', {
        headers: await authHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch traders');
      const data = await response.json();
      setTraders(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadTraders = async () => {
      await fetchTraders();
    };

    void loadTraders();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const endpoint = editingId ? `/api/traders?id=${editingId}` : '/api/traders';
      const method = editingId ? 'PUT' : 'POST';
      
      const response = await fetch(endpoint, {
        method,
        headers: await authHeaders(),
        body: JSON.stringify({ ...formData, avatar_data: avatarData || undefined })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to save trader');
      }

      await fetchTraders();
      setFormData(createEmptyFormData());
      setAvatarData('');
      setShowForm(false);
      setEditingId(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleVisibility = async (trader: Trader) => {
    const nextIsActive = !trader.is_active;
    if (!confirm(nextIsActive ? 'Add this trader to the leaderboard?' : 'Remove this trader from the leaderboard?')) return;
    
    try {
      const response = await fetch(`/api/traders?id=${trader.id}`, {
        method: 'PUT',
        headers: await authHeaders(),
        body: JSON.stringify({ is_active: nextIsActive })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update trader visibility');
      }
      await fetchTraders();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleEdit = (trader: Trader) => {
    setFormData({
      name: trader.name,
      bio: trader.bio || '',
      country: trader.country || '',
      avatar_url: trader.avatar_url,
      specialty: trader.specialty || '',
      badge: trader.badge || 'Gold',
      asset_focus: trader.asset_focus || ['BTC-USD', 'ETH-USD'],
      session_type: trader.session_type,
      risk_level: trader.risk_level || 'Medium',
      current_equity: trader.current_equity || 10000,
      total_return: trader.total_return,
      daily_return: trader.daily_return || 0,
      monthly_return: trader.monthly_return || 0,
      total_trades: trader.total_trades || 0,
      win_rate_trades: trader.win_rate_trades,
      max_drawdown: trader.max_drawdown || 0,
      followers: trader.followers || 0,
      copiers_current: trader.copiers_current || trader.followers || 0,
      copiers_all_time: trader.copiers_all_time || trader.followers || 0,
      profit_for_copiers: trader.profit_for_copiers || 0,
      profit_sharing_fee: trader.profit_sharing_fee ?? 20,
      under_management: trader.under_management || 0,
      drift: trader.drift,
      volatility: trader.volatility,
      risk_score: trader.risk_score,
      session_start: trader.session_start || '',
      session_end: trader.session_end || ''
    });
    setAvatarData('');
    setEditingId(trader.id);
    setShowForm(true);
  };

  const handleAvatarChange = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Avatar images must be smaller than 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarData(typeof reader.result === 'string' ? reader.result : '');
      setError('');
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <AdminShell title="Traders management">
        <div className="flex h-96 items-center justify-center">
          <div className="text-gray-400">Loading traders...</div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Traders management">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Traders Management</h1>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setFormData(createEmptyFormData());
            setAvatarData('');
          }}
          className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600 transition"
        >
          <Plus size={18} />
          New Trader
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">
            {editingId ? 'Edit Trader' : 'Create New Trader'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Bio</label>
                <input
                  type="text"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                  placeholder="e.g., Professional day trader"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Country</label>
                <input type="text" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Avatar URL</label>
                <input type="url" value={formData.avatar_url} onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" placeholder="https://..." />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Specialty</label>
                <input type="text" value={formData.specialty} onChange={(e) => setFormData({ ...formData, specialty: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" placeholder="e.g., Crypto trends" />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Trader image *</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  required={!editingId && !formData.avatar_url}
                  onChange={(e) => handleAvatarChange(e.target.files?.[0])}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-500 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white"
                />
                <div className="mt-2 flex items-center gap-3">
                  {(avatarData || formData.avatar_url) && (
                    <img src={avatarData || formData.avatar_url} alt="Trader preview" className="h-12 w-12 rounded-full object-cover" />
                  )}
                  <span className="text-xs text-gray-500">PNG, JPG, WEBP, or GIF. Max 2 MB.</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Session Type</label>
                <select
                  value={formData.session_type}
                  onChange={(e) => setFormData({ ...formData, session_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                >
                  <option value="nyc">NYC</option>
                  <option value="london">London</option>
                  <option value="asia">Asia</option>
                  <option value="crypto">Crypto 24/7</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Total Return (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.total_return}
                  onChange={(e) => setFormData({ ...formData, total_return: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Badge</label>
                <select value={formData.badge} onChange={(e) => setFormData({ ...formData, badge: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm">
                  <option value="Diamond">Diamond</option><option value="Platinum">Platinum</option><option value="Gold">Gold</option><option value="Silver">Silver</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Risk Level</label>
                <select value={formData.risk_level} onChange={(e) => setFormData({ ...formData, risk_level: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm">
                  <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Win Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.win_rate_trades}
                  onChange={(e) => setFormData({ ...formData, win_rate_trades: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                />
              </div>
              <div><label className="block text-sm text-gray-300 mb-1">Trader Equity ($)</label><input type="number" step="0.01" min="0" value={formData.current_equity} onChange={(e) => setFormData({ ...formData, current_equity: parseFloat(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Daily Return (%)</label><input type="number" step="0.01" value={formData.daily_return} onChange={(e) => setFormData({ ...formData, daily_return: parseFloat(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Monthly Return (%)</label><input type="number" step="0.01" value={formData.monthly_return} onChange={(e) => setFormData({ ...formData, monthly_return: parseFloat(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Total Trades</label><input type="number" min="0" step="1" value={formData.total_trades} onChange={(e) => setFormData({ ...formData, total_trades: parseInt(e.target.value, 10) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Max Drawdown (%)</label><input type="number" min="0" step="0.01" value={formData.max_drawdown} onChange={(e) => setFormData({ ...formData, max_drawdown: parseFloat(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Followers</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.followers}
                  onChange={(e) => setFormData({ ...formData, followers: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                />
              </div>
              <div><label className="block text-sm text-gray-300 mb-1">Current Copiers</label><input type="number" min="0" step="1" value={formData.copiers_current} onChange={(e) => setFormData({ ...formData, copiers_current: parseInt(e.target.value, 10) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">All-time Copiers</label><input type="number" min="0" step="1" value={formData.copiers_all_time} onChange={(e) => setFormData({ ...formData, copiers_all_time: parseInt(e.target.value, 10) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Profit for Copiers ($)</label><input type="number" min="0" step="0.01" value={formData.profit_for_copiers} onChange={(e) => setFormData({ ...formData, profit_for_copiers: parseFloat(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Profit Sharing Fee (%)</label><input type="number" min="0" max="100" step="0.01" value={formData.profit_sharing_fee} onChange={(e) => setFormData({ ...formData, profit_sharing_fee: parseFloat(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Under Management ($)</label><input type="number" min="0" step="0.01" value={formData.under_management} onChange={(e) => setFormData({ ...formData, under_management: parseFloat(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Volatility (0-1)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  value={formData.volatility}
                  onChange={(e) => setFormData({ ...formData, volatility: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Drift (0-1)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  value={formData.drift}
                  onChange={(e) => setFormData({ ...formData, drift: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Risk Score (1-10)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.risk_score}
                  onChange={(e) => setFormData({ ...formData, risk_score: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Assets (comma-separated)</label>
                <input
                  type="text"
                  value={formData.asset_focus.join(', ')}
                  onChange={(e) => setFormData({
                    ...formData,
                    asset_focus: e.target.value.split(',').map(s => s.trim())
                  })}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                  placeholder="e.g., BTC-USD, ETH-USD, AAPL"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Session Start</label>
                <input type="date" value={formData.session_start} onChange={(e) => setFormData({ ...formData, session_start: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Session End</label>
                <input type="date" value={formData.session_end} onChange={(e) => setFormData({ ...formData, session_end: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600 transition text-sm"
              >
                <Save size={16} />
                {editingId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="flex items-center gap-2 rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700 transition text-sm"
              >
                <X size={16} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-4 py-3 text-left text-gray-300">Name</th>
              <th className="px-4 py-3 text-left text-gray-300">Equity</th>
              <th className="px-4 py-3 text-left text-gray-300">Return</th>
              <th className="px-4 py-3 text-left text-gray-300">Session</th>
              <th className="px-4 py-3 text-left text-gray-300">Risk Score</th>
              <th className="px-4 py-3 text-left text-gray-300">Status</th>
              <th className="px-4 py-3 text-right text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {traders.map((trader) => (
              <tr key={trader.id} className="hover:bg-white/[0.02] transition">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={trader.avatar_url}
                      alt={trader.name}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                    <div>
                      <div className="font-semibold text-white">{trader.name}</div>
                      <div className="text-xs text-gray-500">{trader.bio}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-300">{formatMoney(trader.current_equity)}</td>
                <td className={`px-4 py-3 font-semibold ${trader.total_return >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatPct(trader.total_return)}
                </td>
                <td className="px-4 py-3 text-gray-300 capitalize">{trader.session_type}</td>
                <td className="px-4 py-3">
                  <span className="inline-block rounded-full bg-yellow-500/20 px-2 py-1 text-xs text-yellow-300">
                    {trader.risk_score}/10
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-1 text-xs ${trader.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'}`}>
                    {trader.is_active ? 'On leaderboard' : 'Removed'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleEdit(trader)}
                      className="p-2 text-blue-400 hover:bg-blue-500/10 rounded transition"
                      title="Edit"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleVisibility(trader)}
                      className={`p-2 rounded transition ${trader.is_active ? 'text-red-400 hover:bg-red-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'}`}
                      title={trader.is_active ? 'Remove from leaderboard' : 'Add to leaderboard'}
                    >
                      {trader.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {traders.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="mb-4">No traders yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-emerald-400 hover:text-emerald-300 transition"
          >
            Create the first trader
          </button>
        </div>
      )}
    </AdminShell>
  );
}
