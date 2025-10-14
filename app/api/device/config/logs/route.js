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

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 200); // Max 200 records
    const offset = parseInt(searchParams.get('offset')) || 0;
    const status = searchParams.get('status'); // Filter by status
    const deviceId = searchParams.get('device_id'); // Filter by device ID
    const startDate = searchParams.get('start_date'); // Filter by date range
    const endDate = searchParams.get('end_date');

    console.log('Fetching configuration logs from database...');

    // Build query
    let query = supabase
      .from("configuration_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status) {
      query = query.eq("status", status.toUpperCase());
    }

    if (deviceId) {
      query = query.eq("device_id", deviceId);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      console.error("Supabase fetch error:", error);
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code
      }, { status: 400 });
    }

    // Get total count for pagination
    let totalCount = null;
    if (offset === 0) { // Only get count on first page to improve performance
      const { count: total, error: countError } = await supabase
        .from("configuration_logs")
        .select("*", { count: 'exact', head: true });
      
      if (!countError) {
        totalCount = total;
      }
    }

    console.log(`Successfully fetched ${data?.length || 0} configuration log records`);

    // Transform data for better readability
    const transformedData = data?.map(log => ({
      id: log.id,
      device_id: log.device_id,
      config_sent: log.config_sent,
      device_response: log.device_response,
      status: log.status,
      error_message: log.error_message,
      created_at: log.created_at,
      updated_at: log.updated_at,
      // Add some computed fields for convenience
      duration: log.updated_at && log.created_at ? 
        new Date(log.updated_at).getTime() - new Date(log.created_at).getTime() : null,
      has_response: !!log.device_response,
      config_parameters: log.config_sent?.config_update ? Object.keys(log.config_sent.config_update) : []
    })) || [];

    // Generate summary statistics
    const summary = {
      total_records: data?.length || 0,
      status_breakdown: {},
      recent_activity: {
        last_24h: 0,
        last_week: 0
      }
    };

    if (data && data.length > 0) {
      // Count by status
      data.forEach(log => {
        summary.status_breakdown[log.status] = (summary.status_breakdown[log.status] || 0) + 1;
      });

      // Count recent activity
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      data.forEach(log => {
        const logDate = new Date(log.created_at);
        if (logDate > twentyFourHoursAgo) {
          summary.recent_activity.last_24h++;
        }
        if (logDate > oneWeekAgo) {
          summary.recent_activity.last_week++;
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: transformedData,
      pagination: {
        limit,
        offset,
        returned_count: data?.length || 0,
        total_count: totalCount,
        has_more: data && data.length === limit
      },
      filters: {
        status,
        device_id: deviceId,
        start_date: startDate,
        end_date: endDate
      },
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Configuration logs API error:", error);
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