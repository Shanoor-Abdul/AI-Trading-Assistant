import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CCXTProvider } from "@/lib/providers/market/CCXTProvider";
import { IndicatorEngine } from "@/lib/engines/IndicatorEngine";
import { MarketStructureEngine } from "@/lib/engines/MarketStructureEngine";
import { analyze } from "@/lib/ai";
import { RiskEngine } from "@/lib/engines/RiskEngine";
import { StrategyEngine } from "@/lib/strategy/StrategyEngine";
import { Resend } from "resend";

// Vercel Cron setup: export dynamic
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow up to 5 mins for cron

const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_key");

export async function GET(req: NextRequest) {
  // 1. Authenticate Cron (Vercel Cron standard)
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  // Use service role key to bypass RLS for cron job
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    console.log("[Scanner] Initiating autonomous market scan...");

    // 2. Fetch active watchlist items that need scanning
    // A real implementation would filter by last_scanned_at and timeframe interval.
    // For now, we fetch all active items.
    const { data: watchlist, error: watchErr } = await supabase
      .from('scanner_watchlist')
      .select('*, profiles:user_id(id, email, trading_mode, capital, risk_percent, minimum_risk_reward, max_daily_loss, max_open_positions)')
      .eq('is_active', true);

    if (watchErr || !watchlist) {
      console.error("[Scanner] Failed to fetch watchlist:", watchErr);
      return NextResponse.json({ error: "DB Error" }, { status: 500 });
    }

    const ccxt = new CCXTProvider('binance');
    let scannedCount = 0;
    let alertsSent = 0;

    // 3. Process each item
    for (const item of watchlist) {
      try {
        console.log(`[Scanner] Scanning ${item.symbol} on ${item.timeframe} for User ${item.user_id}`);
        
        const ohlcv = await ccxt.fetchOHLCV(item.symbol, item.timeframe, 200);
        const indData = IndicatorEngine.calculate(ohlcv);
        
        const marketData = {
          lastPrice: (ohlcv[ohlcv.length - 1] as unknown as number[])[4],
          recentCandles: ohlcv.slice(-5),
          indicators: indData?.latest,
          marketRegime: MarketStructureEngine.determineRegime(ohlcv, indData?.latest),
          swings: MarketStructureEngine.findSwings(ohlcv)
        };

        const strategyRules = StrategyEngine.getStrategyRules(item.strategy as any).rules;
        
        let aiResult = await analyze({
          symbol: item.symbol,
          timeframe: item.timeframe,
          provider: "gemini", // Default autonomous provider
          model: "gemini-2.5-flash",
          marketData,
          strategyRules
        } as any);

        const profile = item.profiles;
        const riskConfig = {
          minimumRiskReward: profile?.minimum_risk_reward || 2.0,
          maxDailyLoss: profile?.max_daily_loss || 5.0,
          maxOpenPositions: profile?.max_open_positions || 3,
          maxConsecutiveLosses: 3,
          staleDataThresholdSeconds: 300
        };

        aiResult = RiskEngine.validate(aiResult, riskConfig, { currentDailyLoss: 0, openPositionsCount: 0, consecutiveLosses: 0, inCooldown: false });

        // 4. Update last_scanned_at
        await supabase.from('scanner_watchlist').update({ last_scanned_at: new Date().toISOString() }).eq('id', item.id);
        scannedCount++;

        // 5. If Signal Generated, create trade and send alert
        if (aiResult.signal === "BUY" || aiResult.signal === "SELL") {
          console.log(`[Scanner] Signal found for ${item.symbol}: ${aiResult.signal}`);
          
          // Save Analysis
          const { data: analysis } = await supabase.from('analyses').insert({
            user_id: item.user_id,
            prompt_version: "v4_scanner",
            strategy_version: item.strategy,
            symbol: item.symbol,
            timeframe: item.timeframe,
            signal: aiResult.signal,
            confidence: aiResult.confidence,
            reason: aiResult.explanation,
            exchange: 'binance'
          }).select().single();

          if (analysis) {
            const positionSize = RiskEngine.calculatePositionSize(profile?.capital || 10000, profile?.risk_percent || 1, aiResult.entryPrice || 0, aiResult.stopLoss || 0);
            
            await supabase.from('trades').insert({
              user_id: item.user_id,
              analysis_id: analysis.id,
              entry_price: aiResult.entryPrice,
              stop_loss: aiResult.stopLoss,
              take_profit: aiResult.takeProfit,
              risk_reward_ratio: aiResult.riskReward,
              position_size: positionSize,
              execution_mode: profile?.trading_mode || 'PAPER',
              status: 'OPEN'
            });

            // Trigger Email Alert
            if (profile?.email) {
              await resend.emails.send({
                from: "AI Trading Assistant <alerts@yourdomain.com>", // Update with verified domain
                to: profile.email,
                subject: `🚨 ${aiResult.signal} Signal: ${item.symbol} (${item.timeframe})`,
                html: `
                  <h2>New Trade Signal Generated</h2>
                  <p><strong>Symbol:</strong> ${item.symbol}</p>
                  <p><strong>Signal:</strong> <span style="color: ${aiResult.signal === 'BUY' ? 'green' : 'red'}; font-weight: bold;">${aiResult.signal}</span></p>
                  <p><strong>Confidence:</strong> ${aiResult.confidence}%</p>
                  <p><strong>Entry:</strong> ${aiResult.entryPrice}</p>
                  <p><strong>Take Profit:</strong> ${aiResult.takeProfit}</p>
                  <p><strong>Stop Loss:</strong> ${aiResult.stopLoss}</p>
                  <hr/>
                  <p><strong>AI Reasoning:</strong></p>
                  <p>${aiResult.explanation}</p>
                  <br/>
                  <p><em>Trade executed in ${profile?.trading_mode || 'PAPER'} mode.</em></p>
                `
              });
              alertsSent++;
            }
          }
        }
      } catch (e) {
        console.error(`[Scanner] Error processing ${item.symbol}:`, e);
      }
    }

    return NextResponse.json({ success: true, scannedCount, alertsSent });
  } catch (error: any) {
    console.error("[Scanner] Cron error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
