import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    console.log("=== Configuration Acknowledgment ===");

    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({
        success: false,
        error: "Database not configured"
      }, { status: 503 });
    }

    // Parse request body
    const body = await req.json();
    const deviceId = req.headers.get('x-device-id') || 'ecowatt_dashboard';

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
        message: "Invalid config_ack format. Expected arrays for accepted, rejected, unchanged"
      }, { status: 400 });
    }

    // Find the most recent pending/sent configuration
    const { data: recentConfig, error: fetchError } = await supabase
      .from('configuration_logs')
      .select('*')
      .in('status', ['PENDING', 'SENDING', 'SENT'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !recentConfig) {
      console.error('No pending configuration found:', fetchError?.message);
      return NextResponse.json({
        status: "error",
        message: "No pending configuration found to acknowledge"
      }, { status: 404 });
    }

    // Determine overall status based on acknowledgment
    let newStatus = 'APPLIED';
    if (rejected.length > 0) {
      newStatus = 'PARTIALLY_APPLIED';
    }
    if (accepted.length === 0 && unchanged.length === 0) {
      newStatus = 'REJECTED';
    }

    // Update configuration log with acknowledgment
    const { error: updateError } = await supabase
      .from('configuration_logs')
      .update({
        device_response: body.config_ack,
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', recentConfig.id);

    if (updateError) {
      console.error('Failed to update configuration log:', updateError);
      return NextResponse.json({
        status: "error",
        message: "Failed to update configuration log"
      }, { status: 500 });
    }

    console.log(`✅ Configuration acknowledged: ${newStatus}`);
    console.log(`   Accepted: ${accepted.length} items:`, accepted);
    console.log(`   Rejected: ${rejected.length} items:`, rejected);
    console.log(`   Unchanged: ${unchanged.length} items:`, unchanged);

    return NextResponse.json({
      status: "success",
      message: "Configuration acknowledgment processed",
      ack_status: newStatus,
      accepted: accepted.length,
      rejected: rejected.length,
      unchanged: unchanged.length
    });

  } catch (error) {
    console.error("Config acknowledgment error:", error);
    return NextResponse.json({
      status: "error",
      message: "Internal server error",
      error: error.message
    }, { status: 500 });
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(req) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-device-id",
    },
  });
}