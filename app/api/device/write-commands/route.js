import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  try {
    // Check if database is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({
        success: false,
        error: "Database not configured"
      }, { status: 500 });
    }

    // Get all write commands ordered by most recent
    const { data: writeCommands, error } = await supabase
      .from("write_commands")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Database fetch error:", error);
      return NextResponse.json({
        success: false,
        error: "Failed to fetch write commands"
      }, { status: 500 });
    }

    // Get counts by status
    const statusCounts = {};
    writeCommands.forEach(cmd => {
      statusCounts[cmd.status] = (statusCounts[cmd.status] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      write_commands: writeCommands,
      status_summary: statusCounts,
      total_commands: writeCommands.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Write commands API error:", error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}