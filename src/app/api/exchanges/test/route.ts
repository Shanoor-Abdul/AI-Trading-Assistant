import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { connectionId } = await req.json();
    if (!connectionId) return NextResponse.json({ error: "Connection ID required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: conn } = await supabase
      .from("exchange_keys")
      .select("*")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .single();

    if (!conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    // Initialize CCXT and test connection
    const { CCXTProvider } = await import("@/lib/providers/market/CCXTProvider");
    const provider = new CCXTProvider(conn.exchange, conn.api_key, conn.api_secret);
    
    // We just need a simple call that requires authentication to verify credentials.
    // Fetching balance is the standard way to verify CCXT API keys.
    await provider.testConnection(); // Need to add testConnection to CCXTProvider, or just fetchBalance

    return NextResponse.json({ success: true, message: "Connection successful" });
  } catch (err: any) {
    console.error("Test connection failed:", err);
    return NextResponse.json({ 
      success: false, 
      error: "Connection failed: invalid credentials / permission / network / unsupported environment"
    }, { status: 400 });
  }
}
