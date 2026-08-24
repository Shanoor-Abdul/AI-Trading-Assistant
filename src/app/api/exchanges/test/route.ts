import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { connectionId } = await req.json();
    if (!connectionId) {
      return NextResponse.json({ error: "Connection ID required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: conn, error: connectionError } = await supabase
      .from("exchange_keys")
      .select("*")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .single();

    if (connectionError || !conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const exchange = String(conn.exchange).toLowerCase();

    if (exchange === "alpaca") {
      const { AlpacaProvider } = await import("@/lib/providers/market/AlpacaProvider");
      const provider = new AlpacaProvider(conn.api_key, conn.api_secret);
      await provider.testConnection();

      return NextResponse.json({
        success: true,
        connected: true,
        exchange: "alpaca",
        environment: "paper",
        message: "Alpaca Paper Trading connection successful",
      });
    }

    if (exchange === "coindcx" || exchange === "coincdx") {
      const { CoinDCXProvider } = await import("@/lib/providers/market/CoinDCXProvider");
      const provider = new CoinDCXProvider(conn.api_key, conn.api_secret);
      await provider.testConnection();

      return NextResponse.json({
        success: true,
        connected: true,
        exchange: "coindcx",
        environment: conn.environment || "live",
        message: "CoinDCX API connection successful",
      });
    }

    // Existing CCXT validation for all other exchanges.
    const { CCXTProvider } = await import("@/lib/providers/market/CCXTProvider");
    const provider = new CCXTProvider(
      conn.exchange,
      conn.api_key,
      conn.api_secret,
      conn.passphrase,
      conn.environment
    );

    await provider.testConnection();

    return NextResponse.json({
      success: true,
      connected: true,
      exchange: exchange,
      environment: conn.environment,
      message: "Connection successful",
    });
  } catch (err: any) {
    console.error("Connection test error:", err);
    return NextResponse.json({
      success: false,
      connected: false,
      error: `Connection failed: ${err.message || "invalid credentials / permission / network / unsupported environment"}`,
    }, { status: 400 });
  }
}
