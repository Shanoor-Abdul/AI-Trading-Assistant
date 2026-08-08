import { TradingAnalysis } from "@/lib/types";

export interface ExecutionProvider {
  /**
   * Initialize or connect to the broker/exchange.
   */
  connect(): Promise<void>;

  /**
   * Execute a trade based on the AI analysis.
   */
  executeTrade(symbol: string, analysis: TradingAnalysis, positionSize: number): Promise<{
    orderId: string;
    status: string;
    executedPrice?: number;
  }>;
}

export class ManualExecutionProvider implements ExecutionProvider {
  async connect(): Promise<void> {
    // Manual execution doesn't require an active broker connection.
    console.log("[ManualExecutionProvider] Initialized.");
  }

  async executeTrade(symbol: string, analysis: TradingAnalysis, positionSize: number) {
    console.log(\`[ManualExecutionProvider] NOTIFY USER TO EXECUTE: \${analysis.signal} \${positionSize} of \${symbol} @ \${analysis.entryPrice}\`);
    
    // In manual mode, we immediately return a pseudo-success 
    // because the "execution" is just saving to the journal.
    return {
      orderId: \`manual-\${Date.now()}\`,
      status: "LOGGED_TO_JOURNAL",
      executedPrice: analysis.entryPrice || 0
    };
  }
}
