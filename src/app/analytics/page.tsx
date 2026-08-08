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
    .select('*, analyses(symbol, timeframe, signal, confidence)')
    .eq('user_id', user.id)

  if (error || !trades) {
    return <div className="p-8 text-red-500">Failed to load analytics data.</div>
  }

  const wonTrades = trades.filter(t => t.status === 'WON').length
  const lostTrades = trades.filter(t => t.status === 'LOST').length
  const totalClosed = wonTrades + lostTrades
  const winRate = totalClosed > 0 ? ((wonTrades / totalClosed) * 100).toFixed(2) : '0.00'

  return (
    <div className="p-8 flex flex-col gap-6 w-full max-w-6xl mx-auto text-zinc-200">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Performance Analytics</h1>
        <p className="text-sm text-zinc-400">Track your AI-assisted trading performance over time.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-6 bg-black/40 backdrop-blur-md border-zinc-800 flex flex-col gap-1">
          <span className="text-sm text-zinc-400 font-medium">Win Rate</span>
          <span className="text-4xl font-bold text-white">{winRate}%</span>
        </Card>
        <Card className="p-6 bg-black/40 backdrop-blur-md border-zinc-800 flex flex-col gap-1">
          <span className="text-sm text-zinc-400 font-medium">Total Trades</span>
          <span className="text-4xl font-bold text-white">{trades.length}</span>
        </Card>
        <Card className="p-6 bg-black/40 backdrop-blur-md border-zinc-800 flex flex-col gap-1">
          <span className="text-sm text-zinc-400 font-medium">Open Positions</span>
          <span className="text-4xl font-bold text-white">{trades.filter(t => t.status === 'OPEN').length}</span>
        </Card>
      </div>

      <h2 className="text-xl font-bold mt-8 mb-4 border-b border-zinc-800 pb-2">Recent Trade History</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50">
            <tr>
              <th className="px-4 py-3 rounded-tl-lg">Symbol</th>
              <th className="px-4 py-3">Signal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Entry</th>
              <th className="px-4 py-3">TP</th>
              <th className="px-4 py-3">SL</th>
              <th className="px-4 py-3 rounded-tr-lg">R:R</th>
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, 50).map((trade) => (
              <tr key={trade.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                <td className="px-4 py-3 font-medium text-white">{trade.analyses?.symbol} ({trade.analyses?.timeframe})</td>
                <td className="px-4 py-3">
                  <span className={\`px-2 py-1 rounded text-xs font-semibold \${
                    trade.analyses?.signal === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }\`}>
                    {trade.analyses?.signal}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={\`\${
                    trade.status === 'WON' ? 'text-green-400' : trade.status === 'LOST' ? 'text-red-400' : 'text-yellow-400'
                  }\`}>
                    {trade.status}
                  </span>
                </td>
                <td className="px-4 py-3">{trade.entry_price?.toFixed(4)}</td>
                <td className="px-4 py-3">{trade.take_profit?.toFixed(4)}</td>
                <td className="px-4 py-3">{trade.stop_loss?.toFixed(4)}</td>
                <td className="px-4 py-3">1:{(trade.risk_reward_ratio || 0).toFixed(2)}</td>
              </tr>
            ))}
            {trades.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
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
