import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  try {
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({
        success: false,
        error: "Database not configured",
        message: "Supabase environment variables are not set"
      }, { status: 503 });
    }

    console.log('Fetching eco_data from Supabase...');

    // Fetch data from eco_data table
    const { data, error } = await supabase
      .from("eco_data")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50); // Limit to last 50 records

    if (error) {
      console.error("Supabase fetch error:", error);
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code
      }, { status: 400 });
    }

    console.log(`Successfully fetched ${data?.length || 0} records`);

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({
      success: false,
      error: "Internal server error",
      message: error.message
    }, { status: 500 });
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(req) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}