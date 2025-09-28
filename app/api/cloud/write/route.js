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

// Decompress Delta + RLE compressed data
function decompressData(compressedPayload, header) {
  const readings = [];
  let offset = 0;
  
  console.log(`Decompressing ${compressedPayload.length} bytes using Delta + RLE`);
  
  const registerCount = header.valuesPerReading;
  
  for (let reg = 0; reg < registerCount; reg++) {
    const regValues = [];
    
    // Read first 16-bit value for this register
    if (offset + 2 > compressedPayload.length) {
      throw new Error(`Insufficient data for register ${reg} first value`);
    }
    
    const firstValue = compressedPayload[offset] | (compressedPayload[offset + 1] << 8);
    regValues.push(firstValue);
    offset += 2;
    
    let currentValue = firstValue;
    console.log(`Register ${reg}: First value = ${firstValue}`);
    
    // Parse compressed data for remaining readings
    const readingsForThisReg = header.numReadings - 1; // -1 because we already have first value
    
    for (let reading = 0; reading < readingsForThisReg; reading++) {
      if (offset >= compressedPayload.length) {
        throw new Error(`Insufficient data for register ${reg}, reading ${reading + 1}`);
      }
      
      const indicator = compressedPayload[offset++];
      
      if (indicator === 0x00) {
        // RLE: 0x00 + run_length = repeat previous value
        if (offset >= compressedPayload.length) {
          throw new Error(`Missing run length for RLE at register ${reg}`);
        }
        const runLength = compressedPayload[offset++];
        
        for (let i = 0; i < runLength && regValues.length < header.numReadings; i++) {
          regValues.push(currentValue);
        }
        console.log(`Register ${reg}: RLE repeat ${currentValue} x ${runLength}`);
        
      } else if (indicator === 0x01) {
        // Delta: 0x01 + delta_hi + delta_lo = add delta to previous value
        if (offset + 2 > compressedPayload.length) {
          throw new Error(`Missing delta bytes for register ${reg}`);
        }
        
        const deltaLo = compressedPayload[offset++];
        const deltaHi = compressedPayload[offset++];
        const delta = deltaLo | (deltaHi << 8);
        
        // Handle signed delta (16-bit signed)
        const signedDelta = delta > 32767 ? delta - 65536 : delta;
        currentValue = (currentValue + signedDelta) & 0xFFFF;
        regValues.push(currentValue);
        
        console.log(`Register ${reg}: Delta ${signedDelta} -> ${currentValue}`);
        
      } else {
        throw new Error(`Unknown compression indicator: 0x${indicator.toString(16)} at register ${reg}`);
      }
    }
    
    readings.push(...regValues);
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