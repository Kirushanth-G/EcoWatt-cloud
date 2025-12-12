import { promises as fs } from "fs";
import path from "path";
import prisma from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Handle POST requests
export async function POST(request) {
  try {
    // Read the request body
    const body = await request.text();
    
    console.log('[FOTA LOG] Received from ESP32:', body);

    // Try to parse as JSON first (new format)
    let logData;
    try {
      const jsonData = JSON.parse(body);
      logData = parseJsonFotaLog(jsonData);
    } catch (e) {
      // Fallback to pipe-delimited format (old format)
      logData = parseFotaLog(body);
    }

    if (!logData) {
      console.error('[FOTA LOG] Invalid log format');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid log format' 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Save raw log to file for debugging
    const uploadsDir = path.join(process.cwd(), "private", "fota_logs");
    await fs.mkdir(uploadsDir, { recursive: true });
    const filename = `log_${logData.jobId || Date.now()}.json`;
    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, body, "utf-8");
    
    console.log('[FOTA LOG] Saved to:', filename);

    console.log('[FOTA LOG] Saved to:', filename);

    // Try to find the corresponding FOTA update record
    let fotaUpdate = null;
    
    try {
      // Try Prisma first
      fotaUpdate = await prisma.fotaUpdate.findFirst({
        where: {
          status: { in: ['SENDING', 'PENDING'] },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    } catch (prismaError) {
      console.error('[FOTA LOG] Prisma failed, using Supabase:', prismaError);
      
      // Fallback to Supabase
      const { data, error } = await supabase
        .from("fota_updates")
        .select("*")
        .in("status", ['SENDING', 'PENDING'])
        .order("created_at", { ascending: false })
        .limit(1);

      if (!error && data?.[0]) {
        fotaUpdate = {
          id: data[0].id,
          firmwareSha256: data[0].firmware_sha256,
          status: data[0].status,
        };
      }
    }

    if (fotaUpdate) {
      console.log('[FOTA LOG] Found FOTA update:', fotaUpdate.id, 'Status:', logData.final_status);
      
      // Update FOTA update status based on result
      const newStatus = logData.final_status === 'SUCCESS' ? 'COMPLETED' : 'FAILED';
      const deviceResponse = JSON.stringify(logData);
      
      try {
        await prisma.fotaUpdate.update({
          where: { id: fotaUpdate.id },
          data: { 
            status: newStatus,
            deviceResponse: deviceResponse,
            errorMessage: logData.final_status === 'FAILURE' ? 'FOTA update failed on device' : null,
            updatedAt: new Date(),
          },
        });
      } catch (dbError) {
        console.error('[FOTA LOG] Prisma update failed, using Supabase:', dbError);
        
        // Fallback to Supabase
        await supabase
          .from("fota_updates")
          .update({
            status: newStatus,
            device_response: deviceResponse,
            error_message: logData.final_status === 'FAILURE' ? 'FOTA update failed on device' : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", fotaUpdate.id);
      }
    }

    return new Response(JSON.stringify({ 
      status: 'success',
      message: 'FOTA log received',
      jobId: logData.jobId,
      final_status: logData.final_status,
      file: filename
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[FOTA LOG] Processing error:", err);
    return new Response(JSON.stringify({ 
      success: false, 
      error: err.message 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Parse new JSON FOTA log format from ESP32
 * Format:
 * {
 *   "jobId": "fota-job-7",
 *   "final_status": "SUCCESS",
 *   "duration_ms": 23299,
 *   "events": [...]
 * }
 */
function parseJsonFotaLog(jsonData) {
  try {
    const { jobId, final_status, duration_ms, events } = jsonData;
    
    if (!jobId || !final_status || !Array.isArray(events)) {
      return null;
    }

    return {
      jobId: jobId,
      final_status: final_status,
      duration_ms: duration_ms,
      events: events,
      success: final_status === 'SUCCESS',
    };
  } catch (error) {
    console.error('[FOTA LOG] JSON parsing error:', error);
    return null;
  }
}

/**
 * Parse FOTA log response according to specification
 * Format:
 * FOTA_LOG|sha256|download_status|verification_status|update_status|error_stage|error_code|download_duration|total_duration
 */
function parseFotaLog(logText) {
  try {
    const lines = logText.trim().split('\n');
    const logLine = lines.find(line => line.startsWith('FOTA_LOG|'));
    
    if (!logLine) {
      return null;
    }

    const parts = logLine.split('|');
    
    if (parts.length !== 9) {
      return null;
    }

    const [
      prefix,
      sha256,
      downloadStatus,
      verificationStatus,
      updateStatus,
      errorStage,
      errorCode,
      downloadDuration,
      totalDuration
    ] = parts;

    return {
      sha256: sha256,
      downloadSuccess: downloadStatus === 'SUCCESS',
      verificationSuccess: verificationStatus === 'SUCCESS',
      updateSuccess: updateStatus === 'SUCCESS',
      success: downloadStatus === 'SUCCESS' && 
               verificationStatus === 'SUCCESS' && 
               updateStatus === 'SUCCESS',
      errorStage: errorStage === 'NONE' ? null : errorStage,
      errorCode: errorCode === 'NONE' ? null : errorCode,
      downloadDuration: parseInt(downloadDuration) || null,
      totalDuration: parseInt(totalDuration) || null,
    };
  } catch (error) {
    console.error('Log parsing error:', error);
    return null;
  }
}
