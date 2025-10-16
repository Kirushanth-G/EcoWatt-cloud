import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const body = await req.json();
    const { value } = body;

    console.log("=== Write Command Request ===");
    console.log("Value:", value);

    // Validate value
    if (value === undefined || value === null) {
      return NextResponse.json({
        success: false,
        error: "Missing 'value' field"
      }, { status: 400 });
    }

    const numValue = parseInt(value);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
      return NextResponse.json({
        success: false,
        error: "Value must be between 0 and 100"
      }, { status: 400 });
    }

    // Check if database is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("Database not configured, write command cannot be queued");
      return NextResponse.json({
        success: false,
        error: "Database not configured"
      }, { status: 500 });
    }

    // Create write command in database
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("write_commands")
      .insert({
        value: numValue,
        status: "PENDING",
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json({
        success: false,
        error: "Failed to queue write command"
      }, { status: 500 });
    }

    console.log("Write command queued:", data);

    return NextResponse.json({
      success: true,
      message: "Write command queued successfully - will be sent during next data upload",
      command_id: data.id,
      status: data.status,
      info: "ESP32 will receive this command during its next data upload cycle"
    });

  } catch (error) {
    console.error("Write command error:", error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
