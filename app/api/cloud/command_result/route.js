import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Expected API key from ESP32
const EXPECTED_API_KEY = "ColdPlay2025";

export async function POST(req) {
  try {
    console.log('=== Command Result API Request ===');
    
    // Step 1: Check Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || authHeader !== EXPECTED_API_KEY) {
      console.error(`Invalid API key. Expected: "${EXPECTED_API_KEY}", Received: "${authHeader}"`);
      return NextResponse.json(
        { error: "Invalid or missing API key" },
        { status: 401 }
      );
    }

    // Step 2: Get raw body first for debugging
    const rawBody = await req.text();
    console.log('=== ESP32 Command Result Debug ===');
    console.log('Raw Body:', JSON.stringify(rawBody));
    console.log('Raw Body Length:', rawBody.length);
    console.log('Raw Body (first 200 chars):', rawBody.substring(0, 200));
    
    // Clean the raw body by removing null bytes and non-printable characters
    const cleanedBody = rawBody.replace(/\0/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
    console.log('Cleaned Body:', JSON.stringify(cleanedBody));
    console.log('Cleaned Body Length:', cleanedBody.length);

    // Step 2b: Try to parse JSON with error handling
    let body;
    try {
      body = JSON.parse(cleanedBody);
      console.log('✅ Successfully parsed JSON:', JSON.stringify(body, null, 2));
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      console.error('Raw body:', rawBody.substring(0, 300));
      console.error('Cleaned body:', cleanedBody.substring(0, 300));
      console.error('Error position:', parseError.message.match(/position (\d+)/)?.[1]);
      
      // Try to extract just the JSON part if there's extra data
      const jsonStart = cleanedBody.indexOf('{');
      const jsonEnd = cleanedBody.lastIndexOf('}');
      
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const extractedJson = cleanedBody.substring(jsonStart, jsonEnd + 1);
        console.log('Attempting to parse extracted JSON:', extractedJson);
        
        try {
          body = JSON.parse(extractedJson);
          console.log('✅ Successfully parsed extracted JSON:', JSON.stringify(body, null, 2));
        } catch (extractError) {
          console.error('❌ Extracted JSON also failed:', extractError.message);
          return NextResponse.json(
            { 
              error: "Invalid JSON format", 
              details: parseError.message,
              raw_length: rawBody.length,
              cleaned_length: cleanedBody.length,
              extracted_json: extractedJson
            },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { 
            error: "No valid JSON found", 
            details: parseError.message,
            raw_body: rawBody.substring(0, 200),
            cleaned_body: cleanedBody.substring(0, 200)
          },
          { status: 400 }
        );
      }
    }

    // Step 3: Validate command result structure
    if (!body.command_result) {
      console.error('Missing command_result field in request body');
      return NextResponse.json(
        { error: "Missing command_result field" },
        { status: 400 }
      );
    }

    const commandResult = body.command_result;
    const { status, executed_at } = commandResult;

    if (!status) {
      console.error('Missing status field in command_result');
      return NextResponse.json(
        { error: "Missing status field in command_result" },
        { status: 400 }
      );
    }

    console.log(`Command result received: status="${status}", executed_at="${executed_at}"`);

    // Step 4: Check if database is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("Database not configured, command result cannot be processed");
      return NextResponse.json({
        success: false,
        error: "Database not configured"
      }, { status: 500 });
    }

    // Step 5: Find the most recent SENDING write command
    const { data: sendingCommands, error: fetchError } = await supabase
      .from("write_commands")
      .select("*")
      .eq("status", "SENDING")
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error("Database fetch error:", fetchError);
      return NextResponse.json({
        success: false,
        error: "Failed to fetch write commands"
      }, { status: 500 });
    }

    if (!sendingCommands || sendingCommands.length === 0) {
      console.warn("No SENDING write commands found to update with result");
      
      // Check if this might be a duplicate acknowledgment for an already processed command
      const { data: recentCommands, error: recentError } = await supabase
        .from("write_commands")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      
      if (!recentError && recentCommands && recentCommands.length > 0) {
        console.log("Recent commands for reference:");
        recentCommands.forEach(cmd => {
          console.log(`  ID ${cmd.id}: ${cmd.status} (${cmd.value}) - ${cmd.updated_at}`);
        });
        
        return NextResponse.json({
          success: false,
          error: "No pending write commands found",
          info: "This might be a duplicate acknowledgment for an already processed command",
          recent_commands: recentCommands.map(cmd => ({
            id: cmd.id,
            value: cmd.value,
            status: cmd.status,
            updated_at: cmd.updated_at
          }))
        }, { status: 404 });
      }
      
      return NextResponse.json({
        success: false,
        error: "No pending write commands found"
      }, { status: 404 });
    }

    const commandToUpdate = sendingCommands[0];
    console.log(`Updating write command ID ${commandToUpdate.id} with result`);

    // Step 6: Map ESP32 status to database status
    let dbStatus;
    let errorMessage = null;

    switch (status.toLowerCase()) {
      case 'success':
      case 'completed':
      case 'ok':
        dbStatus = 'SUCCESS';
        break;
      case 'failed':
      case 'error':
      case 'timeout':
        dbStatus = 'FAILED';
        // Use ESP32's error message if provided, otherwise use generic message
        errorMessage = commandResult.error_message || `Command execution failed: ${status}`;
        break;
      default:
        dbStatus = 'FAILED';
        errorMessage = commandResult.error_message || `Unknown status: ${status}`;
        break;
    }

    // Step 7: Update write command with result
    const updateData = {
      status: dbStatus,
      device_response: commandResult,
      updated_at: new Date().toISOString()
    };

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { data, error: updateError } = await supabase
      .from("write_commands")
      .update(updateData)
      .eq("id", commandToUpdate.id)
      .select()
      .single();

    if (updateError) {
      console.error("Database update error:", updateError);
      return NextResponse.json({
        success: false,
        error: "Failed to update write command status"
      }, { status: 500 });
    }

    console.log(`✅ Write command updated successfully:`, data);

    // Step 8: Return success response
    return NextResponse.json({
      success: true,
      message: "Command result processed successfully",
      command_id: data.id,
      status: data.status,
      device_response: data.device_response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Command result API error:", error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS(req) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}