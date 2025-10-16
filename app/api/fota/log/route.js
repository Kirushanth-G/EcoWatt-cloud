import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Handle POST requests
export async function POST(request) {
  try {
    // Read the request body as text
    const body = await request.text();

    // Parse the FOTA log response according to specification
    const logData = parseFotaLog(body);

    if (!logData) {
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
    const filename = `log_${Date.now()}.txt`;
    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, body, "utf-8");

    // Find the corresponding FOTA update record
    const fotaUpdate = await prisma.fotaUpdate.findFirst({
      where: {
        firmware_sha256: logData.sha256,
        status: 'SENDING',
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    if (fotaUpdate) {
      // Update FOTA update status based on result
      const newStatus = logData.success ? 'COMPLETED' : 'FAILED';
      await prisma.fotaUpdate.update({
        where: { id: fotaUpdate.id },
        data: { status: newStatus },
      });
    }

    // Store detailed log in fota_logs table
    await prisma.fotaLog.create({
      data: {
        fota_update_id: fotaUpdate ? fotaUpdate.id : null,
        firmware_sha256: logData.sha256,
        download_success: logData.downloadSuccess,
        verification_success: logData.verificationSuccess,
        update_success: logData.updateSuccess,
        overall_success: logData.success,
        error_stage: logData.errorStage,
        error_code: logData.errorCode,
        download_duration_ms: logData.downloadDuration,
        total_duration_ms: logData.totalDuration,
        raw_log: body,
        log_file_path: filename,
      },
    });

    return new Response(JSON.stringify({ 
      success: true, 
      file: filename,
      parsed: logData 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("FOTA log processing error:", err);
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
