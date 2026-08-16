import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  TrendingUp,
  Calendar,
  Activity,
  LogOut,
  Sparkles,
  Image as ImageIcon,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AdminDashboardProps {
  onLogout: () => void;
}

interface Stats {
  totalUsers: number;
  totalEnhancements: number;
  todayUsers: number;
  todayEnhancements: number;
  weekUsers: number;
  weekEnhancements: number;
  monthUsers: number;
  monthEnhancements: number;
  yearUsers: number;
  yearEnhancements: number;
  typeBreakdown: { '2k': number; '4k': number; '8k': number };
  dailyTrend: { date: string; enhancements: number; users: number }[];
}

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('daily');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();

      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

      const [
        totalEnhancements,
        totalUsers,
        todayEnhancements,
        todayUsers,
        weekEnhancements,
        weekUsers,
        monthEnhancements,
        monthUsers,
        yearEnhancements,
        yearUsers,
        type2k,
        type4k,
        type8k,
        dailyData,
      ] = await Promise.all([
        supabase.from('enhancement_logs').select('*', { count: 'exact', head: true }),
        supabase.from('enhancement_logs').select('session_id').then((r) => {
          const ids = new Set(r.data?.map((d) => d.session_id) || []);
          return ids.size;
        }),
        supabase.from('enhancement_logs').select('*', { count: 'exact', head: true }).gte('created_at', startOfDay),
        supabase.from('enhancement_logs').select('session_id').gte('created_at', startOfDay).then((r) => {
          const ids = new Set(r.data?.map((d) => d.session_id) || []);
          return ids.size;
        }),
        supabase.from('enhancement_logs').select('*', { count: 'exact', head: true }).gte('created_at', startOfWeek),
        supabase.from('enhancement_logs').select('session_id').gte('created_at', startOfWeek).then((r) => {
          const ids = new Set(r.data?.map((d) => d.session_id) || []);
          return ids.size;
        }),
        supabase.from('enhancement_logs').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
        supabase.from('enhancement_logs').select('session_id').gte('created_at', startOfMonth).then((r) => {
          const ids = new Set(r.data?.map((d) => d.session_id) || []);
          return ids.size;
        }),
        supabase.from('enhancement_logs').select('*', { count: 'exact', head: true }).gte('created_at', startOfYear),
        supabase.from('enhancement_logs').select('session_id').gte('created_at', startOfYear).then((r) => {
          const ids = new Set(r.data?.map((d) => d.session_id) || []);
          return ids.size;
        }),
        supabase.from('enhancement_logs').select('*', { count: 'exact', head: true }).eq('enhancement_type', '2k'),
        supabase.from('enhancement_logs').select('*', { count: 'exact', head: true }).eq('enhancement_type', '4k'),
        supabase.from('enhancement_logs').select('*', { count: 'exact', head: true }).eq('enhancement_type', '8k'),
        supabase.from('enhancement_logs').select('created_at, session_id').order('created_at', { ascending: true }).limit(1000),
      ]);

      const trendMap = new Map<string, { enhancements: number; users: Set<string> }>();
      const allData = dailyData.data || [];
      for (const row of allData) {
        const date = row.created_at.slice(0, 10);
        if (!trendMap.has(date)) {
          trendMap.set(date, { enhancements: 0, users: new Set() });
        }
        const entry = trendMap.get(date)!;
        entry.enhancements += 1;
        entry.users.add(row.session_id);
      }

      const trend = Array.from(trendMap.entries())
        .map(([date, val]) => ({ date, enhancements: val.enhancements, users: val.users.size }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14);

      setStats({
        totalEnhancements: totalEnhancements.count || 0,
        totalUsers,
        todayEnhancements: todayEnhancements.count || 0,
        todayUsers,
        weekEnhancements: weekEnhancements.count || 0,
        weekUsers,
        monthEnhancements: monthEnhancements.count || 0,
        monthUsers,
        yearEnhancements: yearEnhancements.count || 0,
        yearUsers,
        typeBreakdown: {
          '2k': type2k.count || 0,
          '4k': type4k.count || 0,
          '8k': type8k.count || 0,
        },
        dailyTrend: trend,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  const periodData = {
    daily: { users: stats?.todayUsers || 0, enhancements: stats?.todayEnhancements || 0, label: 'Today' },
    weekly: { users: stats?.weekUsers || 0, enhancements: stats?.weekEnhancements || 0, label: 'This Week' },
    monthly: { users: stats?.monthUsers || 0, enhancements: stats?.monthEnhancements || 0, label: 'This Month' },
    yearly: { users: stats?.yearUsers || 0, enhancements: stats?.yearEnhancements || 0, label: 'This Year' },
  };

  const maxTrendEnhancements = Math.max(...(stats?.dailyTrend.map((d) => d.enhancements) || [1]), 1);
  const maxTrendUsers = Math.max(...(stats?.dailyTrend.map((d) => d.users) || [1]), 1);

  return (
    <div className="min-h-screen bg-mesh">
      {/* Top bar */}
      <div className="border-b border-white/5 glass sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass-brand flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h1 className="font-display font-bold text-white text-lg">Image4K Admin</h1>
              <p className="text-xs text-ink-500">Analytics Dashboard</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-4" />
            <p className="text-ink-400">Loading analytics...</p>
          </div>
        ) : (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={<Users className="w-5 h-5" />}
                label="Total Users"
                value={stats?.totalUsers || 0}
                accent="brand"
              />
              <StatCard
                icon={<ImageIcon className="w-5 h-5" />}
                label="Total Enhancements"
                value={stats?.totalEnhancements || 0}
                accent="brand"
              />
              <StatCard
                icon={<Activity className="w-5 h-5" />}
                label="Today's Enhancements"
                value={stats?.todayEnhancements || 0}
                accent="green"
              />
              <StatCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="Today's Users"
                value={stats?.todayUsers || 0}
                accent="green"
              />
            </div>

            {/* Period selector */}
            <div className="glass rounded-2xl p-6 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-white">Usage by Period</h2>
                  <p className="text-sm text-ink-400">Track user activity over time</p>
                </div>
                <div className="flex gap-2 p-1 rounded-xl bg-ink-900/50 border border-white/5">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                        period === p
                          ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                          : 'text-ink-400 hover:text-white'
                      }`}
                    >
                      {p === 'daily' ? 'Daily' : p === 'weekly' ? 'Weekly' : p === 'monthly' ? 'Monthly' : 'Yearly'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-ink-900/50 border border-white/5 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-brand-400" />
                      </div>
                      <span className="text-ink-300 text-sm font-medium">Users</span>
                    </div>
                    <span className="text-xs text-ink-500 uppercase tracking-wider">{periodData[period].label}</span>
                  </div>
                  <p className="text-4xl font-display font-bold text-white mb-1">
                    {periodData[period].users.toLocaleString()}
                  </p>
                  <p className="text-xs text-ink-500">unique visitors</p>
                </div>

                <div className="rounded-2xl bg-ink-900/50 border border-white/5 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-brand-400" />
                      </div>
                      <span className="text-ink-300 text-sm font-medium">Enhancements</span>
                    </div>
                    <span className="text-xs text-ink-500 uppercase tracking-wider">{periodData[period].label}</span>
                  </div>
                  <p className="text-4xl font-display font-bold text-white mb-1">
                    {periodData[period].enhancements.toLocaleString()}
                  </p>
                  <p className="text-xs text-ink-500">images enhanced</p>
                </div>
              </div>
            </div>

            {/* Trend chart + Type breakdown */}
            <div className="grid lg:grid-cols-3 gap-4 mb-8">
              <div className="glass rounded-2xl p-6 lg:col-span-2">
                <div className="flex items-center gap-2 mb-6">
                  <Calendar className="w-5 h-5 text-brand-400" />
                  <h3 className="font-semibold text-white">14-Day Activity Trend</h3>
                </div>
                {stats && stats.dailyTrend.length > 0 ? (
                  <div className="space-y-3">
                    {stats.dailyTrend.map((day) => (
                      <div key={day.date} className="flex items-center gap-3">
                        <span className="text-xs text-ink-500 w-20 shrink-0">
                          {new Date(day.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                        </span>
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 h-7 rounded-lg bg-ink-900/50 overflow-hidden relative">
                            <div
                              className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                              style={{ width: `${(day.enhancements / maxTrendEnhancements) * 100}%` }}
                            >
                              {day.enhancements > 0 && (
                                <span className="text-xs text-white font-medium">{day.enhancements}</span>
                              )}
                            </div>
                          </div>
                          <div className="w-20 h-7 rounded-lg bg-ink-900/50 overflow-hidden relative">
                            <div
                              className="h-full bg-gradient-to-r from-brand-500/60 to-brand-300/60 rounded-lg transition-all duration-500"
                              style={{ width: `${(day.users / maxTrendUsers) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-ink-400 w-8 shrink-0 text-right">{day.users}u</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-ink-500">
                    <Clock className="w-8 h-8 mb-2" />
                    <p className="text-sm">No activity data yet</p>
                  </div>
                )}
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-gradient-to-r from-brand-600 to-brand-400" />
                    <span className="text-xs text-ink-400">Enhancements</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-brand-500/40" />
                    <span className="text-xs text-ink-400">Users</span>
                  </div>
                </div>
              </div>

              <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="w-5 h-5 text-brand-400" />
                  <h3 className="font-semibold text-white">Quality Breakdown</h3>
                </div>
                <div className="space-y-4">
                  {(['2k', '4k', '8k'] as const).map((type) => {
                    const count = stats?.typeBreakdown[type] || 0;
                    const total = stats?.totalEnhancements || 1;
                    const pct = (count / total) * 100;
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-white">{type.toUpperCase()}</span>
                          <span className="text-xs text-ink-400">{count} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-ink-900/50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Period comparison */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="w-5 h-5 text-brand-400" />
                <h3 className="font-semibold text-white">Period Comparison</h3>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <PeriodCard label="Today" users={stats?.todayUsers || 0} enhancements={stats?.todayEnhancements || 0} />
                <PeriodCard label="This Week" users={stats?.weekUsers || 0} enhancements={stats?.weekEnhancements || 0} />
                <PeriodCard label="This Month" users={stats?.monthUsers || 0} enhancements={stats?.monthEnhancements || 0} />
                <PeriodCard label="This Year" users={stats?.yearUsers || 0} enhancements={stats?.yearEnhancements || 0} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: 'brand' | 'green';
}) {
  return (
    <div className="glass rounded-2xl p-5 hover:border-brand-500/20 transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            accent === 'brand' ? 'bg-brand-500/10 text-brand-400' : 'bg-green-500/10 text-green-400'
          }`}
        >
          {icon}
        </div>
      </div>
      <p className="text-3xl font-display font-bold text-white mb-1">{value.toLocaleString()}</p>
      <p className="text-xs text-ink-400">{label}</p>
    </div>
  );
}

function PeriodCard({ label, users, enhancements }: { label: string; users: number; enhancements: number }) {
  return (
    <div className="rounded-2xl bg-ink-900/50 border border-white/5 p-5">
      <p className="text-xs text-ink-400 uppercase tracking-wider mb-3">{label}</p>
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-3.5 h-3.5 text-brand-400" />
            <span className="text-xs text-ink-400">Users</span>
          </div>
          <p className="text-2xl font-display font-bold text-white">{users.toLocaleString()}</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <ImageIcon className="w-3.5 h-3.5 text-brand-400" />
            <span className="text-xs text-ink-400">Enhancements</span>
          </div>
          <p className="text-2xl font-display font-bold text-white">{enhancements.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
