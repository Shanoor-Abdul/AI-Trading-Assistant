import { useMobileStore } from "@/store/useMobileStore";
import { Card, CardContent } from "@/components/ui/card";
import { MobileScreenShare } from "@/components/mobile/MobileScreenShare";

export function MobileHistory() {
  const { tradeHistory } = useMobileStore();

  return (
    <div className="space-y-4 mt-4">
      <MobileScreenShare />

      {tradeHistory.length === 0 ? (
        <div className="text-center p-8 text-zinc-500 text-sm">
          No recent trades. Run an analysis to see history here.
        </div>
      ) : (
        <>
          <h3 className="font-medium text-sm text-zinc-300 px-1">Recent Analysis</h3>
          {tradeHistory.map((trade) => (
            <Card key={trade.id} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white">{trade.symbol}</span>
                    <span className="text-xs text-zinc-500">{trade.timeframe}</span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div className="text-right">
                  <span className={`px-2 py-1 rounded text-xs font-bold inline-block mb-1 ${
                    trade.signal === 'BUY' ? 'bg-green-500/20 text-green-400' :
                    trade.signal === 'SELL' ? 'bg-red-500/20 text-red-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {trade.signal}
                  </span>
                  <div className={`text-[10px] font-bold uppercase ${
                    trade.status === 'WON' ? 'text-green-400' :
                    trade.status === 'LOST' ? 'text-red-400' :
                    trade.status === 'SKIPPED' ? 'text-zinc-500' : 'text-blue-400'
                  }`}>
                    {trade.status}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
