import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

// Supabase client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Default ESP32 endpoint - can be configured via environment variable
const ESP32_ENDPOINT = process.env.ESP32_CONFIG_ENDPOINT || "http://192.168.1.100/config";
const CONFIG_TIMEOUT = parseInt(process.env.CONFIG_TIMEOUT) || 10000; // 10 seconds default

// Validate configuration payload
function validateConfigPayload(config) {
  const errors = [];
  
  if (!config.config_update) {
    errors.push("Missing 'config_update' object");
    return { valid: false, errors };
  }

  const { sampling_interval, upload_interval, registers } = config.config_update;

  // Validate sampling_interval
  if (sampling_interval !== undefined) {
    if (typeof sampling_interval !== 'number' || sampling_interval < 1 || sampling_interval > 3600) {
      errors.push("sampling_interval must be a number between 1 and 3600 seconds");
    }
  }

  // Validate upload_interval
  if (upload_interval !== undefined) {
    if (typeof upload_interval !== 'number' || upload_interval < 1 || upload_interval > 3600) {
      errors.push("upload_interval must be a number between 1 and 3600 seconds");
    }
  }

  // Validate registers
  if (registers !== undefined) {
    if (!Array.isArray(registers)) {
      errors.push("registers must be an array");
    } else {
      const validRegisters = ["voltage", "current", "frequency", "temperature", "power", "vac1", "iac1", "fac1", "vpv1", "vpv2", "ipv1", "ipv2", "export_power", "output_power"];
      const invalidRegisters = registers.filter(reg => !validRegisters.includes(reg));
      if (invalidRegisters.length > 0) {
        errors.push(`Invalid registers: ${invalidRegisters.join(", ")}. Valid registers: ${validRegisters.join(", ")}`);
      }
    }
  }

  // At least one parameter should be provided
  if (sampling_interval === undefined && upload_interval === undefined && registers === undefined) {
    errors.push("At least one configuration parameter (sampling_interval, upload_interval, or registers) must be provided");
  }

  return { valid: errors.length === 0, errors };
}

// Log configuration attempt to database
async function logConfigurationAttempt(configSent, deviceResponse = null, status = "PENDING", errorMessage = null, deviceId = null) {
  try {
    const { data, error } = await supabase
      .from("configuration_logs")
      .insert([{
        device_id: deviceId,
        config_sent: configSent,
        device_response: deviceResponse,
        status: status,
        error_message: errorMessage
      }])
      .select()
      .single();

    if (error) {
      console.error("Failed to log configuration attempt:", error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error("Database logging error:", error);
    return null;
  }
}

// Update configuration log with device response
async function updateConfigurationLog(logId, deviceResponse, status, errorMessage = null) {
  try {
    const { error } = await supabase
      .from("configuration_logs")
      .update({
        device_response: deviceResponse,
        status: status,
        error_message: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq("id", logId);

    if (error) {
      console.error("Failed to update configuration log:", error);
    }
  } catch (error) {
    console.error("Database update error:", error);
  }
}

export async function POST(req) {
  let logId = null;
  
  try {
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({
        success: false,
        error: "Database not configured",
        message: "Supabase environment variables are not set"
      }, { status: 503 });
    }

    // Parse request body
    const body = await req.json();
    const deviceId = req.headers.get('x-device-id') || null; // Optional device identifier

    console.log("Received configuration request:", JSON.stringify(body, null, 2));

    // Validate payload
    const validation = validateConfigPayload(body);
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: "Invalid configuration payload",
        validation_errors: validation.errors
      }, { status: 400 });
    }

    // Log the configuration attempt as PENDING (ESP32 will poll for it)
    logId = await logConfigurationAttempt(body, null, "PENDING", null, deviceId);

    console.log(`Configuration queued for device ${deviceId}, waiting for ESP32 to poll`);

    // Return success response - configuration is queued for ESP32 to pick up
    return NextResponse.json({
      success: true,
      message: "Configuration queued successfully - will be sent during next data upload",
      log_id: logId,
      status: "PENDING",
      info: "ESP32 will receive this configuration during its next data upload cycle",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Configuration API error:", error);

    if (logId) {
      await updateConfigurationLog(logId, null, "FAILED", `Server error: ${error.message}`);
    }

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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-device-id",
    },
  });
}