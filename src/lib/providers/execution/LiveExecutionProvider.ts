import { TradingAnalysis } from "@/lib/types";
import { ExecutionProvider } from "./ExecutionProvider";
import ccxt, { Exchange } from 'ccxt';

export class LiveExecutionProvider implements ExecutionProvider {
  private client: Exchange;

  constructor(exchangeId: string, apiKey: string, secret: string, passphrase?: string) {
    if (!(ccxt as any)[exchangeId]) {
      throw new Error(`Unsupported exchange: ${exchangeId}`);
    }

    const ExchangeClass = (ccxt as any)[exchangeId];
    
    this.client = new ExchangeClass({
      apiKey,
      secret,
      password: passphrase,
      enableRateLimit: true,
      options: {
        defaultType: 'future', // Default to perpetual futures for shorting capability
      }
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.checkRequiredCredentials();
      // Optional: ping the API or check balance to ensure keys are fully valid
      const balance = await this.client.fetchBalance();
      console.log(`[LiveExecution] Successfully connected. Account Balance: ${Object.keys(balance.total).length} assets.`);
    } catch (e: any) {
      throw new Error(`Failed to connect to live exchange: ${e.message}`);
    }
  }

  async executeTrade(symbol: string, analysis: TradingAnalysis, positionSize: number) {
    if (!analysis.entryPrice || !analysis.takeProfit || !analysis.stopLoss) {
      throw new Error("Missing trade parameters (Entry, TP, or SL).");
    }

    const side = analysis.signal === "BUY" ? "buy" : "sell";
    
    try {
      // 1. Enter the position (Market order for immediate entry)
      const entryOrder = await this.client.createOrder(
        symbol,
        'market',
        side,
        positionSize
      );

      console.log(`[LiveExecution] Market ${side} executed. Order ID: ${entryOrder.id}`);

      // 2. Place Take Profit / Stop Loss Bracket Orders
      // Note: Implementation details vary wildly between exchanges. 
      // This is a generic OCO (One Cancels Other) structure or Stop-Limit structure.
      
      let slOrder, tpOrder;
      const exitSide = side === "buy" ? "sell" : "buy";

      // Bybit / Binance Futures often support placing TP/SL attached to the market order directly via params.
      // We will attempt the unified CCXT param structure.
      const params = {
        stopLossPrice: analysis.stopLoss,
        takeProfitPrice: analysis.takeProfit,
        reduceOnly: true
      };

      try {
         // Attempt to update the position with TP/SL or place trigger orders.
         // CCXT's unified createOrder handles this for advanced exchanges if passed in params.
         console.log("[LiveExecution] Sending TP/SL orders...");
         // A simplified approach for CCXT is to create a STOP_MARKET and TAKE_PROFIT_MARKET order.
         
         slOrder = await this.client.createOrder(symbol, 'stop_market', exitSide, positionSize, undefined, {
           stopPrice: analysis.stopLoss,
           reduceOnly: true
         });
         
         tpOrder = await this.client.createOrder(symbol, 'take_profit_market', exitSide, positionSize, undefined, {
           stopPrice: analysis.takeProfit,
           reduceOnly: true
         });

      } catch (err: any) {
         console.warn("[LiveExecution] Advanced Bracket Orders failed or unsupported by exchange API limits. Fallback required.", err.message);
         // You might need a background polling mechanism in TradeTracker to manually close them if the exchange rejects advanced orders.
      }

      return {
        orderId: entryOrder.id || '',
        status: "OPEN",
        executedPrice: entryOrder.price || analysis.entryPrice || 0,
        slippage: entryOrder.price && analysis.entryPrice ? Math.abs(entryOrder.price - analysis.entryPrice) : 0,
        fees: entryOrder.fee ? (entryOrder.fee.cost as number) : 0
      };

    } catch (e: any) {
      console.error(`[LiveExecution] Execution Failed:`, e);
      throw e;
    }
  }
}
