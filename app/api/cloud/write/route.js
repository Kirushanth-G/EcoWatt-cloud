import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configuration constants
const EXPECTED_API_KEY = "ColdPlay2025";
const EXPECTED_FRAME_SIZE = 47; // 5 bytes header + 40 bytes data + 2 bytes CRC
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
    compressionMethod: headerData[0],      // Byte 0: Should be 0
    numReadings: headerData[1],            // Byte 1: Should be 5
    valuesPerReading: headerData[2],       // Byte 2: Should be 10
    dataLengthLow: headerData[3],          // Byte 3: Low byte of data length
    dataLengthHigh: headerData[4]          // Byte 4: High byte of data length
  };
  
  header.dataLength = header.dataLengthLow | (header.dataLengthHigh << 8);
  
  console.log('Header parsed:', header);
  
  // Validate header values
  if (header.compressionMethod !== 0) {
    throw new Error(`Invalid compression method: ${header.compressionMethod}`);
  }
  
  if (header.numReadings !== 5) {
    throw new Error(`Invalid number of readings: ${header.numReadings}`);
  }
  
  if (header.valuesPerReading !== 10) {
    throw new Error(`Invalid values per reading: ${header.valuesPerReading}`);
  }
  
  if (header.dataLength !== EXPECTED_DATA_SIZE) {
    throw new Error(`Invalid data length: ${header.dataLength}, expected: ${EXPECTED_DATA_SIZE}`);
  }
  
  return header;
}

// Decompress data according to the specific format: [low_byte, high_byte, 0, 4] per value
function decompressData(compressedPayload) {
  const readings = [];
  
  console.log(`Decompressing ${compressedPayload.length} bytes of compressed data`);
  
  // Each value is 4 bytes: [low_byte, high_byte, 0, 4]
  // Total values = 40 bytes / 4 bytes per value = 10 values
  const expectedValues = 10;
  const bytesPerValue = 4;
  
  if (compressedPayload.length !== expectedValues * bytesPerValue) {
    throw new Error(`Invalid compressed data length: ${compressedPayload.length}, expected: ${expectedValues * bytesPerValue}`);
  }
  
  for (let i = 0; i < compressedPayload.length; i += bytesPerValue) {
    const lowByte = compressedPayload[i];
    const highByte = compressedPayload[i + 1];
    const padding1 = compressedPayload[i + 2]; // Should be 0
    const padding2 = compressedPayload[i + 3]; // Should be 4
    
    // Reconstruct the original 16-bit value
    const value = lowByte | (highByte << 8);
    readings.push(value);
    
    console.log(`Value ${readings.length}: ${value} (bytes: ${lowByte}, ${highByte}, ${padding1}, ${padding2})`);
  }
  
  console.log(`Decompressed ${readings.length} values:`, readings);
  return readings;
}

// Store sensor data in database
async function storeSensorData(sensorValues, deviceId = "ecowatt_device") {
  try {
    // Validate input
    if (!Array.isArray(sensorValues) || sensorValues.length === 0) {
      throw new Error('Invalid sensor values provided');
    }

    // Check if Supabase client is properly configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('Supabase environment variables not configured, skipping database storage');
      return { success: true, message: 'Database storage skipped - environment not configured' };
    }

    const timestamp = new Date().toISOString();
    
    // Structure data according to Prisma schema
    const dataRecord = {
      deviceId: deviceId, // Match Prisma schema field name
      compressedPayload: {
        timestamp: timestamp,
        sensor_values: sensorValues, // Store the 10 sensor values
        frame_info: {
          total_values: sensorValues.length,
          expected_values: 10,
          compression_method: 0,
          frame_size: EXPECTED_FRAME_SIZE,
          data_size: EXPECTED_DATA_SIZE
        },
        processing_info: {
          crc_algorithm: 'CRC16-MODBUS',
          polynomial: '0xA001',
          processing_timestamp: timestamp,
          api_version: '1.0'
        }
      },
      originalSize: sensorValues.length * 2, // 2 bytes per value originally
      compressedSize: EXPECTED_DATA_SIZE // 40 bytes compressed
      // createdAt is auto-generated, don't specify it
    };
    
    console.log('Preparing to store data record:', {
      deviceId: dataRecord.deviceId,
      valuesCount: sensorValues.length,
      values: sensorValues
    });
    
    const { data, error } = await supabase
      .from("eco_data")
      .insert([dataRecord])
      .select();

    if (error) {
      console.error("Database insert error details:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      
      // Don't fail the entire request for database issues in production
      console.warn('Database storage failed, but API processing was successful');
      return { 
        success: false, 
        error: error.message,
        sensor_values: sensorValues // Still return the processed values
      };
    }
    
    console.log(`✅ Successfully stored sensor data for device ${deviceId}:`, {
      id: data[0]?.id,
      deviceId: data[0]?.deviceId,
      valuesStored: sensorValues.length
    });
    
    return { success: true, data: data[0], sensor_values: sensorValues };
    
  } catch (error) {
    console.error('Storage function error:', error);
    return { 
      success: false, 
      error: error.message,
      sensor_values: sensorValues // Still return the processed values
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

    // Step 4: Validate frame size (47 bytes total)
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
    const dataWithoutCRC = frame.slice(0, -EXPECTED_CRC_SIZE); // First 45 bytes
    const headerData = dataWithoutCRC.slice(0, EXPECTED_HEADER_SIZE); // First 5 bytes
    const compressedPayload = dataWithoutCRC.slice(EXPECTED_HEADER_SIZE); // Next 40 bytes

    console.log(`Data without CRC: ${dataWithoutCRC.length} bytes`);
    console.log(`Header: ${headerData.length} bytes`);
    console.log(`Compressed payload: ${compressedPayload.length} bytes`);

    // Step 7: Parse and validate header
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

    // Step 8: Decompress data to extract sensor values
    let sensorValues;
    try {
      sensorValues = decompressData(compressedPayload);
    } catch (error) {
      console.error('Decompression failed:', error.message);
      return NextResponse.json(
        { error: `Decompression failed: ${error.message}` },
        { status: 400 }
      );
    }

    console.log(`Extracted ${sensorValues.length} sensor values:`, sensorValues);

    // Step 9: Store data in database (graceful handling)
    console.log(`\n=== Storing ${sensorValues.length} sensor values ===`);
    const storageResult = await storeSensorData(sensorValues);
    
    // Step 10: Generate success response (always succeed if processing worked)
    const responseData = {
      status: "success",
      frame: "ace5000000000000", // Simple confirmation hex data
      values_processed: sensorValues.length,
      values: sensorValues, // Include the actual sensor values
      timestamp: new Date().toISOString(),
      storage: storageResult.success ? "stored" : "processing_only",
      storage_info: storageResult.success ? "Data stored in database" : `Processing successful, storage skipped: ${storageResult.error || 'Environment not configured'}`
    };

    console.log('=== Success Response ===');
    console.log('✅ Frame processed successfully');
    console.log('✅ Values extracted:', sensorValues);
    console.log('📊 Storage result:', storageResult.success ? 'SUCCESS' : 'SKIPPED');
    
    if (storageResult.success) {
      console.log('💾 Data stored in database with ID:', storageResult.data?.id);
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