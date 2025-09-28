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

// Decompress Delta + RLE compressed data
function decompressData(compressedPayload, header) {
  const result = [];
  let pos = 0;
  
  console.log(`Decompressing ${compressedPayload.length} bytes using Delta + RLE`);
  
  const count = header.count;
  const regCount = header.regCount;
  
  for (let reg = 0; reg < regCount; reg++) {
    const regValues = [];
    
    // Read first value (2 bytes, big-endian)
    if (pos + 2 > compressedPayload.length) {
      throw new Error(`Insufficient data for register ${reg} first value`);
    }
    
    let currentValue = (compressedPayload[pos] << 8) | compressedPayload[pos + 1];
    pos += 2;
    regValues.push(currentValue);
    
    console.log(`Register ${reg}: First value = ${currentValue}`);
    
    // Process delta sequence until we have 'count' values
    while (regValues.length < count && pos < compressedPayload.length) {
      const marker = compressedPayload[pos++];
      
      if (marker === 0x00) {
        // RLE: Repeat current value
        const runLength = compressedPayload[pos++];
        for (let i = 0; i < runLength && regValues.length < count; i++) {
          regValues.push(currentValue);
        }
        console.log(`Register ${reg}: RLE repeat ${currentValue} x ${runLength}`);
        // 🔥 CRITICAL: Check if we've completed this register
        if (regValues.length >= count) break;
        
      } else if (marker === 0x01) {
        // Delta: Add delta to current value
        const deltaHi = compressedPayload[pos++];
        const deltaLo = compressedPayload[pos++];
        const delta = (deltaHi << 8) | deltaLo;
        
        // Handle signed delta (16-bit two's complement)
        const signedDelta = delta > 32767 ? delta - 65536 : delta;
        currentValue = (currentValue + signedDelta) & 0xFFFF;
        regValues.push(currentValue);
        
        console.log(`Register ${reg}: Delta ${signedDelta} -> ${currentValue}`);
        
      } else {
        throw new Error(`Invalid marker: 0x${marker.toString(16)} at register ${reg}`);
      }
    }
    
    result.push(regValues);
  }
  
  // Convert from register-oriented to flat array (first sample of all regs, then second sample of all regs, etc.)
  const readings = [];
  for (let sample = 0; sample < count; sample++) {
    for (let reg = 0; reg < regCount; reg++) {
      readings.push(result[reg][sample]);
    }
  }
  
  console.log(`Decompressed ${readings.length} total values`);
  return readings;
}

// Store sensor data in database
async function storeSensorData(sensorValues) {
  try {
    // Validate input - expect exactly 10 sensor readings
    if (!Array.isArray(sensorValues) || sensorValues.length !== 10) {
      throw new Error(`Expected 10 sensor values, received ${sensorValues?.length || 0}`);
    }

    // Check if Supabase client is properly configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('Supabase environment variables not configured, skipping database storage');
      return { success: true, message: 'Database storage skipped - environment not configured' };
    }

    // Apply gain factors to convert raw values to actual sensor readings
    const gainFactors = [10, 10, 100, 10, 10, 10, 10, 10, 1, 1]; // As per specification
    
    const dataRecord = {
      vac1: sensorValues[0] / gainFactors[0],        // L1 Phase voltage (V)
      iac1: sensorValues[1] / gainFactors[1],        // L1 Phase current (A)
      fac1: sensorValues[2] / gainFactors[2],        // L1 Phase frequency (Hz)
      vpv1: sensorValues[3] / gainFactors[3],        // PV1 input voltage (V)
      vpv2: sensorValues[4] / gainFactors[4],        // PV2 input voltage (V)
      ipv1: sensorValues[5] / gainFactors[5],        // PV1 input current (A)
      ipv2: sensorValues[6] / gainFactors[6],        // PV2 input current (A)
      temperature: sensorValues[7] / gainFactors[7], // Inverter temperature (°C)
      export_power: sensorValues[8] / gainFactors[8], // Export power percentage (%)
      output_power: sensorValues[9] / gainFactors[9]  // Output power (W)
    };
    
    console.log('Storing sensor readings:', {
      vac1: dataRecord.vac1,
      iac1: dataRecord.iac1,
      fac1: dataRecord.fac1,
      vpv1: dataRecord.vpv1,
      vpv2: dataRecord.vpv2,
      ipv1: dataRecord.ipv1,
      ipv2: dataRecord.ipv2,
      temperature: dataRecord.temperature,
      export_power: dataRecord.export_power,
      output_power: dataRecord.output_power
    });
    
    const { data, error } = await supabase
      .from("eco_data")
      .insert([dataRecord])
      .select();

    if (error) {
      console.error("Database insert error:", error);
      return { 
        success: false, 
        error: error.message,
        sensor_values: sensorValues
      };
    }
    
    console.log(`✅ Successfully stored sensor readings`);
    
    return { success: true, data: data[0], sensor_values: sensorValues };
    
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
      sensorValues = decompressData(compressedPayload, header);
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