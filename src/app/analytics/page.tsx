import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-400">
        Please sign in to view analytics.
      </div>
    )
  }

  const { data: trades, error } = await supabase
    .from('trades')
    .select('*, analyses(symbol, timeframe, signal, confidence, strategy_version)')
    .eq('user_id', user.id)

  if (error || !trades) {
    return <div className="p-8 text-red-500">Failed to load analytics data.</div>
  }

  const wonTrades = trades.filter(t => t.status === 'WON').length
  const lostTrades = trades.filter(t => t.status === 'LOST').length
  const totalClosed = wonTrades + lostTrades
  const winRate = totalClosed > 0 ? ((wonTrades / totalClosed) * 100).toFixed(2) : '0.00'

  let grossProfit = 0;
  let grossLoss = 0;
  let totalMfe = 0;
  let totalMae = 0;
  let netPnl = 0;
  
  const strategyStats: Record<string, { wins: number, total: number }> = {};

  trades.forEach(t => {
    if (t.pnl) {
       netPnl += t.pnl;
       if (t.pnl > 0) grossProfit += t.pnl;
       else grossLoss += Math.abs(t.pnl);
    }
    if (t.max_favorable_move) totalMfe += Number(t.max_favorable_move);
    if (t.max_adverse_move) totalMae += Number(t.max_adverse_move);
    
    if (t.analyses?.strategy_version) {
       const strat = t.analyses.strategy_version;
       if (!strategyStats[strat]) strategyStats[strat] = { wins: 0, total: 0 };
       strategyStats[strat].total++;
       if (t.status === 'WON') strategyStats[strat].wins++;
    }
  });

  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0.00';
  const avgMfe = trades.length > 0 ? (totalMfe / trades.length).toFixed(4) : '0.00';
  const avgMae = trades.length > 0 ? (totalMae / trades.length).toFixed(4) : '0.00';
  
  let bestStrategy = "N/A";
  let bestStrategyWinRate = -1;
  for (const strat in strategyStats) {
     const rate = strategyStats[strat].wins / strategyStats[strat].total;
     if (rate > bestStrategyWinRate && strategyStats[strat].total >= 1) { 
        bestStrategyWinRate = rate;
        bestStrategy = strat;
     }
  }

  return (
    <div className="p-8 flex flex-col gap-6 w-full max-w-7xl mx-auto text-zinc-200">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Performance Analytics</h1>
        <p className="text-sm text-zinc-400">Track your exact execution data and AI simulation performance.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-6 bg-black/40 backdrop-blur-md border-zinc-800 flex flex-col gap-1">
          <span className="text-sm text-zinc-400 font-medium">Win Rate</span>
          <span className="text-4xl font-bold text-white">{winRate}%</span>
        </Card>
        <Card className="p-6 bg-black/40 backdrop-blur-md border-zinc-800 flex flex-col gap-1">
          <span className="text-sm text-zinc-400 font-medium">Profit Factor</span>
          <span className="text-4xl font-bold text-white">{profitFactor}</span>
        </Card>
        <Card className="p-6 bg-black/40 backdrop-blur-md border-zinc-800 flex flex-col gap-1">
          <span className="text-sm text-zinc-400 font-medium">Net PnL</span>
          <span className={`text-4xl font-bold ${netPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {netPnl >= 0 ? '+' : ''}{netPnl.toFixed(2)}
          </span>
        </Card>
        <Card className="p-6 bg-black/40 backdrop-blur-md border-zinc-800 flex flex-col gap-1">
          <span className="text-sm text-zinc-400 font-medium">Best Strategy</span>
          <span className="text-2xl font-bold text-white truncate" title={bestStrategy}>{bestStrategy}</span>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 bg-zinc-900/50 border-zinc-800 flex justify-between items-center">
           <span className="text-zinc-400 text-sm">Avg Max Favorable Excursion (MFE)</span>
           <span className="text-xl font-mono text-green-400">+{avgMfe}</span>
        </Card>
        <Card className="p-4 bg-zinc-900/50 border-zinc-800 flex justify-between items-center">
           <span className="text-zinc-400 text-sm">Avg Max Adverse Excursion (MAE)</span>
           <span className="text-xl font-mono text-red-400">-{avgMae}</span>
        </Card>
      </div>

      <h2 className="text-xl font-bold mt-8 mb-4 border-b border-zinc-800 pb-2">Recent Trade History</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50">
            <tr>
              <th className="px-4 py-3 rounded-tl-lg">Strategy</th>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Signal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">PnL</th>
              <th className="px-4 py-3">MFE / MAE</th>
              <th className="px-4 py-3 rounded-tr-lg">R:R</th>
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, 50).map((trade) => (
              <tr key={trade.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                <td className="px-4 py-3 text-zinc-300">{trade.analyses?.strategy_version}</td>
                <td className="px-4 py-3 font-medium text-white">{trade.analyses?.symbol} ({trade.analyses?.timeframe})</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    trade.analyses?.signal === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {trade.analyses?.signal}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`${
                    trade.status === 'WON' ? 'text-green-400' : trade.status === 'LOST' ? 'text-red-400' : 'text-zinc-400'
                  }`}>
                    {trade.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                   <span className="text-xs text-zinc-500 border border-zinc-700 px-1 py-0.5 rounded">{trade.execution_mode}</span>
                </td>
                <td className={`px-4 py-3 font-mono ${trade.pnl && trade.pnl > 0 ? 'text-green-400' : trade.pnl && trade.pnl < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                   {trade.pnl ? trade.pnl.toFixed(2) : '-'}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                   <span className="text-green-400">+{Number(trade.max_favorable_move || 0).toFixed(4)}</span>
                   <span className="text-zinc-600 mx-1">/</span>
                   <span className="text-red-400">-{Number(trade.max_adverse_move || 0).toFixed(4)}</span>
                </td>
                <td className="px-4 py-3">1:{(trade.risk_reward_ratio || 0).toFixed(2)}</td>
              </tr>
            ))}
            {trades.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  No trades recorded yet. Run an analysis to generate a signal!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
