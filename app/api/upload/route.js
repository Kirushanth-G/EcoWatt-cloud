import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // use service key only in server routes
);

export async function POST(req) {
  try {
    const body = await req.json();

    // Validate required fields
    if (!body.device_id) {
      return NextResponse.json(
        { status: "error", message: "device_id is required" },
        { status: 400 }
      );
    }

    if (!body.compressed_payload) {
      return NextResponse.json(
        { status: "error", message: "compressed_payload is required" },
        { status: 400 }
      );
    }

    // Insert into Supabase
    const { error } = await supabase
      .from("eco_data")
      .insert([{
        device_id: body.device_id,
        compressed_payload: body.compressed_payload,
        original_size: body.original_size || null,
        compressed_size: body.compressed_size || null
      }]);

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    // Respond with ACK + configs
    return NextResponse.json({
      status: "ok",
      ack: true,
      configs: {
        upload_interval: 900, // 15 minutes
        sample_rate: 1
      }
    });
  } catch (err) {
    console.error("Upload API error:", err);
    return NextResponse.json(
      { status: "error", message: err.message },
      { status: 500 }
    );
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