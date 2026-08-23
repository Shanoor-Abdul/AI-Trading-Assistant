import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const connectionId = searchParams.get("connectionId");

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let exchangeName = "binance";
    let apiKey: string | undefined;
    let apiSecret: string | undefined;
    let environment: string | undefined;
    let passphrase: string | undefined;

    if (connectionId && user) {
      const { data: conn } = await supabase
        .from("exchange_keys")
        .select("*")
        .eq("id", connectionId)
        .eq("user_id", user.id)
        .single();

      if (conn) {
        exchangeName = conn.exchange;
        apiKey = conn.api_key;
        apiSecret = conn.api_secret;
        environment = conn.environment;
        passphrase = conn.passphrase;
      }
    }

    const ticker = exchangeName.toLowerCase() === "alpaca"
      ? await (async () => {
          const { AlpacaProvider } = await import("@/lib/providers/market/AlpacaProvider");
          return new AlpacaProvider(apiKey, apiSecret).fetchTicker(symbol);
        })()
      : await (async () => {
          const { CCXTProvider } = await import("@/lib/providers/market/CCXTProvider");
          return new CCXTProvider(exchangeName, apiKey, apiSecret, passphrase, environment).fetchTicker(symbol);
        })();

    return NextResponse.json({ price: ticker.last });
  } catch (error: any) {
    console.error("Ticker fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
