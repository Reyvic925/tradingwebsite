import React, { useState, useEffect } from 'react';
import AdminShell from '../../components/AdminShell';
import TraderAvatar from '../../components/TraderAvatar';
import { Plus, Edit2, Save, X, Eye, EyeOff, Trash2 } from 'lucide-react';
import { formatMoney, formatPct } from '../../lib/format';
import { authHeaders } from '../../lib/api';
import type { Trader } from '../../types';
import { PROFILE_METRICS } from '../../../shared/trader-profile-metrics.js';

function createEmptyFormData() {
  return {
    name: '', bio: '', country: '', avatar_url: '', specialty: '', badge: 'Gold',
    asset_focus: ['BTC-USD', 'ETH-USD'], session_type: 'nyc', risk_level: 'Medium',
    current_equity: 10000, total_return: 0, daily_return: 0, monthly_return: 0,
    total_trades: 0, win_rate_trades: 50, max_drawdown: 0, risk_score: 5,
    under_management: 0, profit_for_copiers: 0, copiers_current: 0, copiers_all_time: 0,
    profit_sharing_fee: 20
  };
}

export default function AdminTraders() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [avatarData, setAvatarData] = useState('');
  const [metricValues, setMetricValues] = useState<Record<string, string>>({});
  const [metricPlaceholders, setMetricPlaceholders] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
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
    if (saving) return;
    setSaving(true);
    try {
      const endpoint = editingId ? `/api/traders?id=${editingId}` : '/api/traders';
      const method = editingId ? 'PUT' : 'POST';
      const profileFields = { ...formData };
      const payload = {
        ...profileFields,
        profile_metrics: Object.fromEntries(Object.entries(metricValues)
          .filter(([, value]) => value.trim() !== '')
          .map(([key, value]) => [key, Number(value)])),
        avatar_data: avatarData || undefined
      };
      
      const response = await fetch(endpoint, {
        method,
        headers: await authHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to save trader');
      }

      await fetchTraders();
      setFormData(createEmptyFormData());
      setMetricValues({});
      setMetricPlaceholders({});
      setAvatarData('');
      setShowForm(false);
      setEditingId(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
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

  const handleDelete = async (trader: Trader) => {
    if (!confirm(`Remove ${trader.name} from the trader roster? This keeps its history but hides it from users.`)) return;

    try {
      const response = await fetch(`/api/traders?id=${trader.id}`, {
        method: 'DELETE',
        headers: await authHeaders()
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete trader');
      }
      await fetchTraders();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleEdit = (trader: Trader) => {
    setMetricValues(Object.fromEntries(Object.entries(trader.profile_metrics || {}).map(([key, value]) => [key, String(value)])));
    const calculated: Record<string, number | null | undefined> = {
      current_equity: trader.current_equity,
      total_return: trader.total_return,
      win_rate_trades: trader.win_rate_trades,
      total_trades: trader.total_trades,
      max_drawdown: trader.max_drawdown,
      copiers_current: trader.copiers_current,
      daily_return: trader.daily_return,
      monthly_return: trader.monthly_return,
      under_management: trader.under_management,
      profit_for_copiers: trader.profit_for_copiers,
      risk_score: trader.risk_score,
      closed_trades_analysed: trader.total_trades,
      recorded_trades: trader.total_trades,
    };
    setMetricPlaceholders(Object.fromEntries([
      ...Object.entries(calculated)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => [key, String(value)] as [string, string]),
      ...Object.entries(trader.profile_metrics || {})
        .map(([key, value]) => [key, String(value)] as [string, string]),
    ]));
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
      daily_return: trader.daily_return ?? 0,
      monthly_return: trader.monthly_return ?? 0,
      total_trades: trader.total_trades || 0,
      win_rate_trades: trader.win_rate_trades,
      max_drawdown: trader.max_drawdown || 0,
      risk_score: trader.risk_score || 5,
      under_management: trader.under_management ?? 0,
      profit_for_copiers: trader.profit_for_copiers ?? 0,
      copiers_current: trader.copiers_current ?? 0,
      copiers_all_time: trader.copiers_all_time ?? 0,
      profit_sharing_fee: trader.profit_sharing_fee ?? 20,
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
            setMetricValues({});
            setMetricPlaceholders({});
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
                <select value={formData.specialty} onChange={(e) => setFormData({ ...formData, specialty: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm">
                  <option value="">Select specialty</option>
                  {formData.specialty && !['Futures', 'Stocks', 'Crypto', 'Forex', 'Commodities', 'Indices', 'Multi-asset'].includes(formData.specialty) && (
                    <option value={formData.specialty}>{formData.specialty}</option>
                  )}
                  <option value="Futures">Futures</option>
                  <option value="Stocks">Stocks</option>
                  <option value="Crypto">Crypto</option>
                  <option value="Forex">Forex</option>
                  <option value="Commodities">Commodities</option>
                  <option value="Indices">Indices</option>
                  <option value="Multi-asset">Multi-asset</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Trader image (optional)</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => handleAvatarChange(e.target.files?.[0])}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-500 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white"
                />
                <div className="mt-2 flex items-center gap-3">
                  <TraderAvatar src={avatarData || formData.avatar_url} name={formData.name} className="h-12 w-12 rounded-full object-cover" />
                  <span className="text-xs text-gray-500">Optional. PNG, JPG, WEBP, or GIF. Max 2 MB.</span>
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
                  <option value="sydney">Sydney</option>
                  <option value="tokyo">Tokyo</option>
                  <option value="asia">Asia (legacy)</option>
                  <option value="crypto">Crypto 24/7</option>
                </select>
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

              <div><label className="block text-sm text-gray-300 mb-1">Trader Equity ($)</label><input type="number" step="0.01" min="0" value={formData.current_equity} onChange={(e) => setFormData({ ...formData, current_equity: parseFloat(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Total Return (%)</label><input type="number" step="any" value={formData.total_return} onChange={(e) => setFormData({ ...formData, total_return: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Daily Return (%)</label><input type="number" step="any" value={formData.daily_return} onChange={(e) => setFormData({ ...formData, daily_return: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Monthly Return (%)</label><input type="number" step="any" value={formData.monthly_return} onChange={(e) => setFormData({ ...formData, monthly_return: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Total Trades</label><input type="number" min="0" step="1" value={formData.total_trades} onChange={(e) => setFormData({ ...formData, total_trades: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Win Rate (%)</label><input type="number" min="0" max="100" step="0.01" value={formData.win_rate_trades} onChange={(e) => setFormData({ ...formData, win_rate_trades: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Maximum Drawdown (%)</label><input type="number" min="0" max="100" step="0.01" value={formData.max_drawdown} onChange={(e) => setFormData({ ...formData, max_drawdown: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Capital Following ($)</label><input type="number" min="0" step="0.01" value={formData.under_management} onChange={(e) => setFormData({ ...formData, under_management: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Copier Profit ($)</label><input type="number" step="0.01" value={formData.profit_for_copiers} onChange={(e) => setFormData({ ...formData, profit_for_copiers: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">Current Copiers</label><input type="number" min="0" step="1" value={formData.copiers_current} onChange={(e) => setFormData({ ...formData, copiers_current: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>
              <div><label className="block text-sm text-gray-300 mb-1">All-Time Copiers</label><input type="number" min="0" step="1" value={formData.copiers_all_time} onChange={(e) => setFormData({ ...formData, copiers_all_time: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm" /></div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Strategy Risk Score (1-10)</label>
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
            </div>

            <section className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-4">
              <h3 className="font-semibold text-white">Admin-reported profile metrics</h3>
              <p className="mt-2 text-sm text-gray-400">Entered values appear on the trader profile with an Admin-reported label. Leave a field blank to use its calculated value. Saved values persist across trading updates.</p>
              <button type="button" onClick={() => setMetricValues({})} className="mt-3 text-xs text-amber-200 underline">Use calculated values for all metrics</button>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {PROFILE_METRICS.map(metric => <label key={metric.key} className="block text-xs text-gray-300">
                  {metric.label}
                  <input type="number" step={metric.integer ? 1 : 'any'} min={metric.min} max={metric.max}
                    value={metricValues[metric.key] ?? ''} placeholder={metricPlaceholders[metric.key] || 'Calculated value'}
                    onChange={event => setMetricValues(values => ({ ...values, [metric.key]: event.target.value }))}
                    className="mt-2 w-full rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm text-white" />
                  <span className="mt-1 block font-mono text-[10px] text-gray-500">{metric.key}</span>
                </label>)}
                {Array.from({ length: 12 }, (_, index) => {
                  const date = new Date();
                  const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - index, 1)).toISOString().slice(0, 7);
                  const key = `month_${month.replace('-', '_')}`;
                  return <label key={key} className="block text-xs text-gray-300">{month} return (%)
                    <input type="number" step="any" min={-100} value={metricValues[key] ?? ''} placeholder={metricPlaceholders[key] || 'Calculated value'}
                      onChange={event => setMetricValues(values => ({ ...values, [key]: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm text-white" />
                    <span className="mt-1 block font-mono text-[10px] text-gray-500">{key}</span>
                  </label>;
                })}
              </div>
              <p className="mt-4 text-xs text-gray-400">D1 column <code>traders.profile_metrics</code> stores a JSON object using these field names. Remove a key to restore its calculated value. Changes are recorded in <code>trader_profile_metric_audit</code>.</p>
            </section>
            <label className="block text-sm text-gray-300">Performance fee (%)
              <input type="number" min={0} max={100} step="0.01" value={formData.profit_sharing_fee}
                onChange={event => setFormData({ ...formData, profit_sharing_fee: Number(event.target.value) })}
                className="mt-2 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white" />
              <span className="mt-1 block text-xs text-gray-400">This setting controls the actual performance fee charged to copiers.</span>
            </label>

            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-white hover:bg-emerald-600 transition text-sm"
              >
                <Save size={16} />
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
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
                    <TraderAvatar src={trader.avatar_url} name={trader.name} className="h-8 w-8 rounded-full object-cover" />
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
                    <button
                      onClick={() => handleDelete(trader)}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded transition"
                      title="Delete trader"
                    >
                      <Trash2 size={16} />
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
