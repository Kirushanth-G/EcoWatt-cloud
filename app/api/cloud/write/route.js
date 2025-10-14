import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configuration constants
const EXPECTED_API_KEY = "ColdPlay2025";
const EXPECTED_FRAME_SIZE = 48; // 1 byte metadata + 5 bytes header + 40 bytes data + 2 bytes CRC
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
  
  // Validate header values
  if (header.count !== 5) {
    throw new Error(`Invalid number of samples: ${header.count}`);
  }
  
  if (header.regCount !== 10) {
    throw new Error(`Invalid register count: ${header.regCount}`);
  }
  
  if (header.compressedSize !== EXPECTED_DATA_SIZE) {
    throw new Error(`Invalid compressed size: ${header.compressedSize}, expected: ${EXPECTED_DATA_SIZE}`);
  }
  
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

    // Step 3: Read binary frame
    const arrayBuffer = await req.arrayBuffer();
    const frame = new Uint8Array(arrayBuffer);

    console.log(`Received frame: ${frame.length} bytes`);
    console.log(`Frame hex: ${Array.from(frame).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

    // Step 4: Validate frame size (48 bytes total)
    if (frame.length !== EXPECTED_FRAME_SIZE) {
      console.error(`Invalid frame size: ${frame.length}, expected: ${EXPECTED_FRAME_SIZE}`);
      return NextResponse.json(
        { error: "Invalid frame size" },
        { status: 400 }
      );
    }

    // Step 5: Validate CRC
    if (!validateCRC(frame)) {
      console.error('CRC validation failed');
      return NextResponse.json(
        { error: "CRC validation failed" },
        { status: 400 }
      );
    }

    // Step 6: Extract components (remove CRC to get data)
    const dataWithoutCRC = frame.slice(0, -EXPECTED_CRC_SIZE); // First 46 bytes
    const metadataFlag = dataWithoutCRC[0]; // First byte
    const headerData = dataWithoutCRC.slice(EXPECTED_METADATA_SIZE, EXPECTED_METADATA_SIZE + EXPECTED_HEADER_SIZE); // Bytes 1-5
    const compressedPayload = dataWithoutCRC.slice(EXPECTED_METADATA_SIZE + EXPECTED_HEADER_SIZE); // Next 40 bytes

    console.log(`Data without CRC: ${dataWithoutCRC.length} bytes`);
    console.log(`Metadata flag: 0x${metadataFlag.toString(16).padStart(2, '0')}`);
    console.log(`Header: ${headerData.length} bytes`);
    console.log(`Compressed payload: ${compressedPayload.length} bytes`);

    // Step 7: Validate metadata flag (0x00 = raw compression, 0x01 = aggregated)
    if (metadataFlag !== 0x00) {
      console.error(`Unsupported metadata flag: 0x${metadataFlag.toString(16)}`);
      return NextResponse.json(
        { error: "Only raw compression data supported" },
        { status: 400 }
      );
    }

    // Step 8: Parse and validate header
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

    // Step 9: Decompress data to extract sensor values
    let sensorValues;
    try {
      sensorValues = decompressData(compressedPayload, header);
    } catch (error) {
      console.error('Decompression failed:', error.message);
      return NextResponse.json(
        { error: `Decompression failed: ${error.message}` },
        { status: 400 }
      );
    }

    console.log(`Extracted ${sensorValues.length} sensor values:`, sensorValues);

    // Step 10: Store data in database (graceful handling)
    console.log(`\n=== Storing ${sensorValues.length} sensor values ===`);
    const storageResult = await storeSensorData(sensorValues);
    
    // Step 11: Check for pending configuration updates
    console.log(`\n=== Checking for configuration updates ===`);
    const pendingConfig = await checkForPendingConfiguration();
    
    // Step 12: Generate response with optional configuration update
    const responseData = {
      status: "ok"
    };

    // Add configuration update if available
    if (pendingConfig) {
      responseData.config_update = pendingConfig.config_update;
      console.log('📡 Including configuration update in response:', pendingConfig.config_update);
    } else {
      console.log('📡 No pending configuration updates');
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