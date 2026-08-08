import { TradingAnalysis } from "@/lib/types";
import { ExecutionProvider } from "./ExecutionProvider";

export class PaperExecutionProvider implements ExecutionProvider {
  private simulatedBalance: number;

  constructor(initialBalance: number = 10000) {
    this.simulatedBalance = initialBalance;
  }

  async connect(): Promise<void> {
    console.log("[PaperExecutionProvider] Initialized Paper Trading Simulation.");
  }

  async executeTrade(symbol: string, analysis: TradingAnalysis, positionSize: number) {
    console.log(`[PaperExecutionProvider] SIMULATING EXECUTON: ${analysis.signal} ${positionSize.toFixed(4)} of ${symbol} @ ${analysis.entryPrice}`);
    
    // Simulate slippage (e.g. 0.05%)
    const slippageRate = 0.0005;
    const slippageAmount = (analysis.entryPrice || 0) * slippageRate;
    const executedPrice = analysis.signal === "BUY" 
      ? (analysis.entryPrice || 0) + slippageAmount 
      : (analysis.entryPrice || 0) - slippageAmount;

    // Simulate exchange fees (e.g. 0.1% taker fee)
    const feeRate = 0.001;
    const estimatedFees = (executedPrice * positionSize) * feeRate;

    return {
      orderId: `paper-${Date.now()}`,
      status: "OPEN", // Moves to OPEN in Paper mode immediately
      executedPrice,
      slippage: slippageAmount,
      fees: estimatedFees
    };
  }

  getSimulatedBalance() {
    return this.simulatedBalance;
  }
}
