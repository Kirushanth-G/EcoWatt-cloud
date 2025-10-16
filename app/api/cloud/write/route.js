import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import { createHash, createSign } from "crypto";
import path from "path";

// Import encryption/decryption utilities
const encryptionModule = await import('./encryptionAndSecurity.js');
const { processEncryptedUpload } = encryptionModule;

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configuration constants
const EXPECTED_API_KEY = "ColdPlay2025";
// Frame size is now dynamic based on device configuration via header information
const EXPECTED_METADATA_SIZE = 1;
const EXPECTED_HEADER_SIZE = 5;
const EXPECTED_DATA_SIZE = 40;
const EXPECTED_CRC_SIZE = 2;

// CRC16-MODBUS calculation with polynomial 0xA001
function calculateCRC16Modbus(data) {
  let crc = 0xFFFF;
  
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  
  return crc & 0xFFFF;
}

// Validate CRC (little-endian format)
function validateCRC(frameWithCRC) {
  if (frameWithCRC.length < EXPECTED_CRC_SIZE) {
    return false;
  }
  
  // Extract data (everything except last 2 bytes)
  const frameData = frameWithCRC.slice(0, -EXPECTED_CRC_SIZE);
  
  // Extract CRC (little-endian: low byte first, high byte second)
  const receivedCRC = frameWithCRC[frameWithCRC.length - 2] | 
                     (frameWithCRC[frameWithCRC.length - 1] << 8);
  
  // Calculate CRC using MODBUS algorithm
  const calculatedCRC = calculateCRC16Modbus(frameData);
  
  console.log(`CRC Debug - Received: 0x${receivedCRC.toString(16).padStart(4, '0')}, Calculated: 0x${calculatedCRC.toString(16).padStart(4, '0')}`);
  
  return receivedCRC === calculatedCRC;
}

// Parse frame header according to specification
function parseFrameHeader(headerData) {
  if (headerData.length < EXPECTED_HEADER_SIZE) {
    throw new Error('Header too short');
  }
  
  const header = {
    count: (headerData[0] << 8) | headerData[1],     // Bytes 0-1: Number of samples (big-endian)
    regCount: headerData[2],                         // Byte 2: Number of registers per sample
    compressedSize: (headerData[3] << 8) | headerData[4] // Bytes 3-4: Compressed data size (big-endian)
  };
  
  // For compatibility with existing validation
  header.numReadings = header.count;
  header.valuesPerReading = header.regCount;  
  header.dataLength = header.compressedSize;
  
  console.log('Header parsed:', header);
  
  // Validate header values dynamically (supports remote config changes)
  if (header.count < 1 || header.count > 1000) {
    throw new Error(`Invalid number of samples: ${header.count} (must be 1-1000)`);
  }
  
  if (header.regCount < 1 || header.regCount > 50) {
    throw new Error(`Invalid register count: ${header.regCount} (must be 1-50)`);
  }

  // Validate compressed size is reasonable (allow variable sizes)
  if (header.compressedSize < 1 || header.compressedSize > 10000) {
    throw new Error(`Invalid compressed size: ${header.compressedSize} (must be 1-10000 bytes)`);
  }
  
  // Note: Removed hardcoded EXPECTED_DATA_SIZE check to support variable frame sizes
  // The actual compressed size depends on data content and compression efficiency
  
  return header;
}

// Decompress Delta + RLE compressed data (matching decom.py logic)
function decompressData(compressedPayload, header) {
  // Match decom.py logic exactly
  const count = header.count;
  const regCount = header.regCount;
  let idx = 0;

  // Initialize samples array: samples[sample][reg]
  const samples = Array.from({ length: count }, () => new Array(regCount).fill(0));

  // Decode each register stream
  for (let reg = 0; reg < regCount; reg++) {
    if (idx + 2 > compressedPayload.length) {
      throw new Error(`Truncated initial value for register ${reg}`);
    }
    let prevVal = (compressedPayload[idx] << 8) | compressedPayload[idx + 1];
    idx += 2;
    samples[0][reg] = prevVal;
    let sampleIdx = 1;

    while (sampleIdx < count && idx < compressedPayload.length) {
      const flag = compressedPayload[idx];
      idx += 1;
      if (flag === 0x00) { // RLE
        if (idx >= compressedPayload.length) {
          throw new Error("Truncated RLE run");
        }
        const run = compressedPayload[idx];
        idx += 1;
        for (let i = 0; i < run; i++) {
          if (sampleIdx >= count) break;
          samples[sampleIdx][reg] = prevVal;
          sampleIdx += 1;
        }
      } else if (flag === 0x01) { // Delta
        if (idx + 2 > compressedPayload.length) {
          throw new Error("Truncated delta");
        }
        // Read signed 16-bit big-endian delta
        const deltaHi = compressedPayload[idx];
        const deltaLo = compressedPayload[idx + 1];
        idx += 2;
        // struct.unpack('>h', ...) equivalent
        let signedDelta = (deltaHi << 8) | deltaLo;
        if (signedDelta & 0x8000) signedDelta = signedDelta - 0x10000;
        prevVal = (prevVal + signedDelta) & 0xFFFF;
        samples[sampleIdx][reg] = prevVal;
        sampleIdx += 1;
      } else {
        throw new Error(`Unknown flag 0x${flag.toString(16)}`);
      }
    }
    if (sampleIdx < count) {
      throw new Error("Not enough data to fill all samples");
    }
  }
  // Return flat array: first sample of all regs, then second sample, etc.
  const readings = [];
  for (let sample = 0; sample < count; sample++) {
    for (let reg = 0; reg < regCount; reg++) {
      readings.push(samples[sample][reg]);
    }
  }
  return readings;
}

// Check for pending configuration updates
async function checkForPendingConfiguration() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return null; // No database configured
    }

    // Look for pending configurations
    const { data: pendingConfigs, error } = await supabase
      .from("configuration_logs")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      console.error("Configuration check error:", error);
      return null;
    }

    if (!pendingConfigs || pendingConfigs.length === 0) {
      return null; // No pending configurations
    }

    const pendingConfig = pendingConfigs[0];
    
    // Update status to SENDING
    await supabase
      .from("configuration_logs")
      .update({ 
        status: "SENDING",
        updated_at: new Date().toISOString()
      })
      .eq("id", pendingConfig.id);

    console.log(`Found pending configuration:`, pendingConfig.config_sent);

    return {
      config_id: pendingConfig.id,
      config_update: pendingConfig.config_sent.config_update
    };

  } catch (error) {
    console.error("Configuration check error:", error);
    return null;
  }
}

// Check for pending write commands
async function checkForPendingWriteCommand() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return null; // No database configured
    }

    // Look for pending write commands
    const { data: pendingCommands, error } = await supabase
      .from("write_commands")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      console.error("Write command check error:", error);
      return null;
    }

    if (!pendingCommands || pendingCommands.length === 0) {
      return null; // No pending commands
    }

    const pendingCommand = pendingCommands[0];
    
    // Update status to SENDING
    await supabase
      .from("write_commands")
      .update({ 
        status: "SENDING",
        updated_at: new Date().toISOString()
      })
      .eq("id", pendingCommand.id);

    console.log(`Found pending write command:`, pendingCommand);

    return {
      action: "write_register",
      target_register: "8",
      value: pendingCommand.value
    };

  } catch (error) {
    console.error("Write command check error:", error);
    return null;
  }
}

// Check for pending FOTA updates
async function checkForPendingFOTA(req) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return null; // No database configured
    }

    // Look for pending FOTA updates
    const { data: pendingUpdates, error } = await supabase
      .from("fota_updates")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      console.error("FOTA check error:", error);
      return null;
    }

    if (!pendingUpdates || pendingUpdates.length === 0) {
      return null; // No pending FOTA
    }

    const pendingUpdate = pendingUpdates[0];
    
    // Read firmware from uploads/firmware.bin
    const filePath = path.join(process.cwd(), "uploads", "firmware.bin");

    // Check if firmware file exists
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      
      // Use SHA-256 and size from database record
      const sha256 = pendingUpdate.firmware_sha256;
      const recordedSize = pendingUpdate.firmware_size;

      // Get base URL - use dynamic host detection for proper ESP32 connectivity
      let baseUrl;
      if (process.env.NODE_ENV === 'production') {
        baseUrl = "https://eco-watt-cloud.vercel.app";
      } else {
        // In development, use the actual host from the request header
        const host = req.headers.get('host');
        if (host) {
          baseUrl = `http://${host}`;
        } else {
          // Fallback to network IP for ESP32 connectivity
          baseUrl = "http://192.168.8.159:3000";
        }
      }

      console.log(`FOTA Base URL: ${baseUrl}`);

      // Create JSON data
      const fotaData = {
        job_id: pendingUpdate.id,
        fwUrl: `${baseUrl}/api/fota/download`,
        fwSize: recordedSize,
        shaExpected: sha256
      };

      // Sign FOTA manifest if private key exists
      try {
        const keyPath = path.join(process.cwd(), "private", "ecdsa_private.pem");
        const privateKey = await fs.readFile(keyPath, "utf-8");
        const signer = createSign("SHA256");
        signer.update(JSON.stringify(fotaData));
        signer.end();
        const signature = signer.sign(privateKey, "base64");
        fotaData.signature = signature;
      } catch (keyError) {
        console.warn("ECDSA private key not found, FOTA manifest unsigned");
      }

      // Update status to SENDING
      await supabase
        .from("fota_updates")
        .update({ 
          status: "SENDING",
          updated_at: new Date().toISOString()
        })
        .eq("id", pendingUpdate.id);

      console.log(`Found pending FOTA update:`, fotaData);

      return fotaData;

    } catch (fileError) {
      console.error("Firmware file not found:", fileError);
      // Update FOTA record to FAILED
      await supabase
        .from("fota_updates")
        .update({ 
          status: "FAILED",
          error_message: "Firmware file not found",
          updated_at: new Date().toISOString()
        })
        .eq("id", pendingUpdate.id);
      return null;
    }

  } catch (error) {
    console.error("FOTA check error:", error);
    return null;
  }
}

// Store sensor data in database
async function storeSensorData(sensorValues) {
  try {
    // Validate input - expect values in multiples of 10 (samples × 10 sensors)
    if (!Array.isArray(sensorValues) || sensorValues.length % 10 !== 0) {
      throw new Error(`Expected sensor values in multiples of 10, received ${sensorValues?.length || 0}`);
    }

    // Check if Supabase client is properly configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('Supabase environment variables not configured, skipping database storage');
      return { success: true, message: 'Database storage skipped - environment not configured' };
    }

    // Calculate number of samples (each sample has 10 sensor values)
    const numSamples = sensorValues.length / 10;
    console.log(`Processing ${numSamples} samples with 10 sensors each`);

    // Store raw values as received, no gain multiplication
    const dataRecords = [];
    for (let sample = 0; sample < numSamples; sample++) {
      const startIndex = sample * 10;
      const sampleValues = sensorValues.slice(startIndex, startIndex + 10);
      const dataRecord = {
        vac1: sampleValues[0],        // L1 Phase voltage (V)
        iac1: sampleValues[1],        // L1 Phase current (A)
        fac1: sampleValues[2],        // L1 Phase frequency (Hz)
        vpv1: sampleValues[3],        // PV1 input voltage (V)
        vpv2: sampleValues[4],        // PV2 input voltage (V)
        ipv1: sampleValues[5],        // PV1 input current (A)
        ipv2: sampleValues[6],        // PV2 input current (A)
        temperature: sampleValues[7], // Inverter temperature (°C)
        export_power: sampleValues[8], // Export power percentage (%)
        output_power: sampleValues[9]  // Output power (W)
      };
      dataRecords.push(dataRecord);
      console.log(`Sample ${sample + 1}:`, dataRecord);
    }
    
    // Insert all samples at once
    const { data, error } = await supabase
      .from("eco_data")
      .insert(dataRecords)
      .select();

    if (error) {
      console.error("Database insert error:", error);
      return { 
        success: false, 
        error: error.message,
        sensor_values: sensorValues
      };
    }
    
    console.log(`✅ Successfully stored ${numSamples} sensor readings`);
    
    return { success: true, data: data, sensor_values: sensorValues, samples_stored: numSamples };
    
  } catch (error) {
    console.error('Storage function error:', error);
    return { 
      success: false, 
      error: error.message,
      sensor_values: sensorValues
    };
  }
}

// Handle configuration acknowledgment from ESP32
async function handleConfigurationAcknowledgment(configAckHeader) {
  try {
    // Parse the config acknowledgment from header (JSON string)
    const configAck = JSON.parse(configAckHeader);
    console.log('📥 Configuration acknowledgment received:', configAck);

    // Validate acknowledgment structure
    if (!configAck.accepted || !configAck.rejected || !configAck.unchanged) {
      console.error('❌ Invalid config acknowledgment format');
      return;
    }

    // Update the most recent pending configuration log
    const { data: recentConfig, error: fetchError } = await supabase
      .from('configuration_logs')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !recentConfig) {
      console.error('❌ No pending configuration found to acknowledge:', fetchError?.message);
      return;
    }

    // Determine overall status
    let newStatus = 'APPLIED';
    if (configAck.rejected.length > 0) {
      newStatus = 'PARTIALLY_APPLIED';
    }
    if (configAck.accepted.length === 0 && configAck.unchanged.length === 0) {
      newStatus = 'REJECTED';
    }

    // Update configuration log with acknowledgment
    const { error: updateError } = await supabase
      .from('configuration_logs')
      .update({
        device_response: configAck,
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', recentConfig.id);

    if (updateError) {
      console.error('❌ Failed to update configuration log:', updateError);
      return;
    }

    console.log(`✅ Configuration acknowledged: ${newStatus}`);
    console.log(`   Accepted: ${configAck.accepted.length} items`);
    console.log(`   Rejected: ${configAck.rejected.length} items`);
    console.log(`   Unchanged: ${configAck.unchanged.length} items`);

  } catch (error) {
    console.error('❌ Error processing config acknowledgment:', error.message);
  }
}

export async function POST(req) {
  try {
    console.log('=== Cloud API Write Request ===');
    
    // Step 1: Check Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || authHeader !== EXPECTED_API_KEY) {
      console.error(`Invalid API key. Expected: "${EXPECTED_API_KEY}", Received: "${authHeader}"`);
      return NextResponse.json(
        { error: "Invalid or missing API key" },
        { status: 401 }
      );
    }

    // Step 2: Check content type
    const contentType = req.headers.get('content-type');
    if (contentType !== 'application/octet-stream') {
      console.error(`Invalid content type. Expected: "application/octet-stream", Received: "${contentType}"`);
      return NextResponse.json(
        { error: "Content-Type must be application/octet-stream" },
        { status: 400 }
      );
    }

    // Step 3: Read binary payload
    const arrayBuffer = await req.arrayBuffer();
    const rawPayload = Buffer.from(arrayBuffer);

    console.log(`Received payload: ${rawPayload.length} bytes`);

    // Step 4: Check for encryption and config acknowledgment headers
    const encryptionHeader = req.headers.get('encryption');
    const nonceHeader = req.headers.get('nonce');
    const macHeader = req.headers.get('mac');
    const configAckHeader = req.headers.get('config-ack');

    let frame;

    // If encryption headers are present, decrypt the payload
    if (encryptionHeader === 'aes-256-cbc' && nonceHeader && macHeader) {
      console.log('🔐 Encrypted payload detected - processing with AES-256-CBC decryption');
      console.log(`   Nonce: ${nonceHeader}`);
      console.log(`   MAC: ${macHeader.substring(0, 16)}...`);

      // Process encrypted upload (decrypt, verify MAC, verify CRC, decompress)
      const decryptionResult = processEncryptedUpload(rawPayload, nonceHeader, macHeader);

      if (!decryptionResult.success) {
        console.error(`❌ Decryption failed: ${decryptionResult.error}`);
        return NextResponse.json(
          { error: decryptionResult.error },
          { status: 400 }
        );
      }

      console.log('✅ Decryption successful');
      frame = new Uint8Array(decryptionResult.data);
      console.log(`Decrypted frame: ${frame.length} bytes`);
      console.log(`Frame hex: ${Array.from(frame).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

    } else {
      // No encryption - process as plain binary frame
      console.log('📤 Plain binary payload (no encryption)');
      frame = new Uint8Array(rawPayload);
      console.log(`Frame: ${frame.length} bytes`);
      console.log(`Frame hex: ${Array.from(frame).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    }

    // Step 5: Handle encrypted vs plain frames differently
    let sensorValues;
    let isEncryptedFrame = (encryptionHeader === 'aes-256-cbc' && nonceHeader && macHeader);

    if (isEncryptedFrame) {
      console.log('🔐 Processing encrypted frame format');
      
      // Encrypted frames are variable size - accommodate large uploads
      const MIN_ENCRYPTED_FRAME_SIZE = 10; // Minimum: flag + header + some data + CRC
      const MAX_ENCRYPTED_FRAME_SIZE = 5000; // Large enough for many samples and low compression
      
      if (frame.length < MIN_ENCRYPTED_FRAME_SIZE || frame.length > MAX_ENCRYPTED_FRAME_SIZE) {
        console.error(`Invalid encrypted frame size: ${frame.length}, expected range: ${MIN_ENCRYPTED_FRAME_SIZE}-${MAX_ENCRYPTED_FRAME_SIZE} bytes`);
        return NextResponse.json(
          { error: `Invalid encrypted frame size: ${frame.length} bytes (range: ${MIN_ENCRYPTED_FRAME_SIZE}-${MAX_ENCRYPTED_FRAME_SIZE})` },
          { status: 400 }
        );
      }
      
      console.log(`✅ Encrypted frame size: ${frame.length} bytes (valid range)`);

      // Validate CRC on the full 48-byte encrypted frame
      if (!validateCRC(frame)) {
        console.error('CRC validation failed on encrypted frame');
        return NextResponse.json(
          { error: "CRC validation failed" },
          { status: 400 }
        );
      }

      // Extract components from encrypted frame format
      const dataWithoutCRC = frame.slice(0, -2); // Remove last 2 bytes (CRC)
      const compressionFlag = dataWithoutCRC[0]; // First byte is compression flag
      
      console.log(`Compression flag: 0x${compressionFlag.toString(16).padStart(2, '0')}`);
      console.log(`Data without CRC: ${dataWithoutCRC.length} bytes`);

      // Validate compression flag
      if (compressionFlag !== 0x00 && compressionFlag !== 0x01) {
        console.error(`Invalid compression flag: 0x${compressionFlag.toString(16)}`);
        return NextResponse.json(
          { error: `Invalid compression flag: 0x${compressionFlag.toString(16)}` },
          { status: 400 }
        );
      }

      // Parse the header from encrypted frame (bytes 1-5 after compression flag)
      if (dataWithoutCRC.length < 6) { // flag(1) + header(5) minimum
        console.error(`Encrypted frame too short for header: ${dataWithoutCRC.length} bytes`);
        return NextResponse.json(
          { error: `Encrypted frame too short: ${dataWithoutCRC.length} bytes` },
          { status: 400 }
        );
      }

      const headerData = dataWithoutCRC.slice(1, 6); // Bytes 1-5: header
      const compressedData = dataWithoutCRC.slice(6); // Bytes 6+: compressed payload

      console.log(`Header data: ${headerData.toString('hex')}`);
      console.log(`Compressed data: ${compressedData.length} bytes`);

      // Parse header to get actual sample count and structure
      let header;
      try {
        header = parseFrameHeader(headerData);
        console.log(`Parsed header - Samples: ${header.count}, Registers: ${header.regCount}, Expected compressed: ${header.compressedSize} bytes`);
      } catch (error) {
        console.error('Encrypted frame header parsing failed:', error.message);
        return NextResponse.json(
          { error: `Header parsing failed: ${error.message}` },
          { status: 400 }
        );
      }

      // Validate header against actual compressed data size
      if (compressedData.length !== header.compressedSize) {
        console.error(`Compressed data size mismatch: header says ${header.compressedSize}, actual ${compressedData.length}`);
        return NextResponse.json(
          { error: `Data size mismatch: expected ${header.compressedSize}, got ${compressedData.length}` },
          { status: 400 }
        );
      }

      // Decompress the data using real header
      try {
        sensorValues = decompressData(compressedData, header);
        console.log(`✅ Encrypted frame decompressed: ${sensorValues.length} readings`);
        console.log(`   Samples: ${header.count}, Registers: ${header.regCount}`);
      } catch (error) {
        console.error('Encrypted frame decompression failed:', error.message);
        return NextResponse.json(
          { error: `Decompression failed: ${error.message}` },
          { status: 400 }
        );
      }

    } else {
      console.log('📤 Processing plain frame format');
      
      // Plain frame validation (existing logic)
      const MIN_FRAME_SIZE = 8;
      const MAX_FRAME_SIZE = 2000;
      
      if (frame.length < MIN_FRAME_SIZE || frame.length > MAX_FRAME_SIZE) {
        console.error(`Invalid frame size: ${frame.length}, expected between ${MIN_FRAME_SIZE} and ${MAX_FRAME_SIZE} bytes`);
        return NextResponse.json(
          { error: `Invalid frame size: ${frame.length} bytes (range: ${MIN_FRAME_SIZE}-${MAX_FRAME_SIZE})` },
          { status: 400 }
        );
      }

      // Validate CRC on plain frame
      if (!validateCRC(frame)) {
        console.error('CRC validation failed on plain frame');
        return NextResponse.json(
          { error: "CRC validation failed" },
          { status: 400 }
        );
      }

      // Plain frame processing (existing logic)
      const dataWithoutCRC = frame.slice(0, -EXPECTED_CRC_SIZE);
      const metadataFlag = dataWithoutCRC[0];

      console.log(`Data length: ${dataWithoutCRC.length} bytes`);
      console.log(`Metadata flag: 0x${metadataFlag.toString(16).padStart(2, '0')}`);

      // Validate metadata flag (0x00 = raw compression, 0x01 = aggregated)
      if (metadataFlag !== 0x00) {
        console.error(`Unsupported metadata flag: 0x${metadataFlag.toString(16)}`);
        return NextResponse.json(
          { error: "Only raw compression data supported" },
          { status: 400 }
        );
      }

      // Extract header and compressed payload
      if (dataWithoutCRC.length < 7) {
        return NextResponse.json(
          { error: "Frame too short to contain header" },
          { status: 400 }
        );
      }

      const headerData = dataWithoutCRC.slice(1, 6);
      const compressedPayload = dataWithoutCRC.slice(6);
      console.log(`Header data: ${headerData.toString('hex')}`);
      console.log(`Compressed payload: ${compressedPayload.length} bytes`);

      // Parse and validate header
      let header;
      try {
        header = parseFrameHeader(headerData);
      } catch (error) {
        console.error('Header parsing failed:', error.message);
        return NextResponse.json(
          { error: `Header parsing failed: ${error.message}` },
          { status: 400 }
        );
      }

      // Cross-validate header with actual payload size
      if (compressedPayload.length !== header.compressedSize) {
        console.error(`Payload size mismatch: header says ${header.compressedSize} bytes, actual payload is ${compressedPayload.length} bytes`);
        return NextResponse.json(
          { error: `Payload size mismatch: expected ${header.compressedSize} bytes, got ${compressedPayload.length} bytes` },
          { status: 400 }
        );
      }

      console.log(`✅ Frame validation passed: ${header.count} samples, ${header.regCount} registers, ${header.compressedSize} bytes compressed data`);

      // Decompress plain frame data
      try {
        sensorValues = decompressData(compressedPayload, header);
        console.log(`✅ Plain frame decompressed: ${sensorValues.length} readings`);
      } catch (error) {
        console.error('Plain frame decompression failed:', error.message);
        return NextResponse.json(
          { error: `Decompression failed: ${error.message}` },
          { status: 400 }
        );
      }
    }

    console.log(`Extracted ${sensorValues.length} sensor values:`, sensorValues);

    // Step 12: Handle configuration acknowledgment if present
    if (configAckHeader) {
      console.log('\n=== Processing Configuration Acknowledgment ===');
      await handleConfigurationAcknowledgment(configAckHeader);
    }

    // Step 13: Store data in database (graceful handling)
    console.log(`\n=== Storing ${sensorValues.length} sensor values ===`);
    const storageResult = await storeSensorData(sensorValues);
    
    // Step 14: Check for pending updates/commands
    console.log(`\n=== Checking for pending updates and commands ===`);
    const pendingConfig = await checkForPendingConfiguration();
    const pendingCommand = await checkForPendingWriteCommand();
    const pendingFOTA = await checkForPendingFOTA(req);
    
    // Step 14: Generate unified response
    const responseData = {
      status: "success"
    };

    // Add write command if available
    if (pendingCommand) {
      responseData.command = pendingCommand;
      console.log('📝 Including write command in response:', pendingCommand);
    }

    // Add configuration update if available
    if (pendingConfig) {
      responseData.config_update = pendingConfig.config_update;
      console.log('⚙️ Including configuration update in response:', pendingConfig.config_update);
      
      // Update status to SENT (waiting for acknowledgment)
      try {
        await supabase
          .from('configuration_logs')
          .update({ 
            status: 'SENT',
            updated_at: new Date().toISOString()
          })
          .eq('id', pendingConfig.config_id);
        console.log('✅ Configuration status updated to SENT');
      } catch (error) {
        console.error('❌ Failed to update config status to SENT:', error);
      }
    }

    // Add FOTA update if available
    if (pendingFOTA) {
      responseData.fota = pendingFOTA;
      console.log('� Including FOTA update in response:', pendingFOTA);
    }

    if (!pendingCommand && !pendingConfig && !pendingFOTA) {
      console.log('✅ No pending updates or commands');
    }

    console.log('=== Success Response ===');
    console.log('✅ Frame processed successfully');
    console.log('✅ Values extracted:', sensorValues);
    console.log('📊 Storage result:', storageResult.success ? 'SUCCESS' : 'SKIPPED');
    
    if (storageResult.success) {
      console.log('💾 Data stored in database');
    } else {
      console.log('⚠️ Storage issue:', storageResult.error || 'Environment not configured');
    }

    return NextResponse.json(responseData, { status: 200 });

  } catch (error) {
    console.error("Cloud API unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}