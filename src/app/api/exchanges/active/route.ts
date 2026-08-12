import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PUT(req: NextRequest) {
  try {
    const { connectionId } = await req.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 1: Set all connections for this user to is_active = false
    await supabase
      .from("exchange_keys")
      .update({ is_active: false })
      .eq("user_id", user.id);

    // Step 2: If a connectionId is provided, set it to active
    if (connectionId) {
      const { error } = await supabase
        .from("exchange_keys")
        .update({ is_active: true })
        .eq("id", connectionId)
        .eq("user_id", user.id);
        
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
