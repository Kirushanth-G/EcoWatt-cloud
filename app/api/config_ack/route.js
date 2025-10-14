import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    // Parse request body
    const body = await req.json();

    console.log("=== Configuration Acknowledgment ===");
    console.log("Acknowledgment:", JSON.stringify(body.config_ack, null, 2));

    // Validate acknowledgment format
    if (!body.config_ack) {
      return NextResponse.json({
        status: "error",
        message: "Missing config_ack"
      }, { status: 400 });
    }

    // Validate config_ack structure
    const { accepted, rejected, unchanged } = body.config_ack;
    if (!Array.isArray(accepted) || !Array.isArray(rejected) || !Array.isArray(unchanged)) {
      return NextResponse.json({
        status: "error",
        message: "Invalid config_ack format"
      }, { status: 400 });
    }

    // Check if database is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("Database not configured, acknowledging without storage");
      return NextResponse.json({ status: "ok" });
    }

    // Find the most recent SENDING configuration
    const { data: sendingConfigs, error: findError } = await supabase
      .from("configuration_logs")
      .select("*")
      .eq("status", "SENDING")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (findError) {
      console.error("Database error:", findError);
      return NextResponse.json({ status: "ok" }); // Still acknowledge to ESP32
    }

    if (!sendingConfigs || sendingConfigs.length === 0) {
      console.log(`No SENDING configuration found for device ${deviceId}`);
      return NextResponse.json({ status: "ok" }); // Still acknowledge to ESP32
    }

    const configToUpdate = sendingConfigs[0];

    // Determine final status
    let finalStatus = "SUCCESS";
    let errorMessage = null;

    if (rejected.length > 0) {
      finalStatus = "FAILED";
      errorMessage = `Device rejected: ${rejected.join(", ")}`;
    } else if (accepted.length === 0 && unchanged.length === 0) {
      finalStatus = "FAILED";
      errorMessage = "No parameters were processed";
    }

    // Update the configuration log
    const { error: updateError } = await supabase
      .from("configuration_logs")
      .update({
        device_response: { config_ack: body.config_ack },
        status: finalStatus,
        error_message: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq("id", configToUpdate.id);

    if (updateError) {
      console.error("Database update error:", updateError);
    } else {
      console.log(`✅ Configuration ${finalStatus} for device ${deviceId}`);
      console.log(`   Accepted: ${accepted.join(", ") || "none"}`);
      console.log(`   Rejected: ${rejected.join(", ") || "none"}`);
      console.log(`   Unchanged: ${unchanged.join(", ") || "none"}`);
    }

    return NextResponse.json({ status: "ok" });

  } catch (error) {
    console.error("Configuration acknowledgment error:", error);
    return NextResponse.json({ status: "ok" }); // Always acknowledge to ESP32
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(req) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}