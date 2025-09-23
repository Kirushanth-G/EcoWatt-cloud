import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from 'crypto';
import zlib from 'zlib';

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configuration constants from IoT device
const EXPECTED_API_KEY = "ColdPlay2025";
const MAX_COMPRESSION_SIZE = 2048; // Adjust based on device settings

// CRC16-CCITT calculation (matches IoT device implementation)
function calculateCRC16(data, length) {
  let crc = 0xFFFF;
  
  for (let i = 0; i < length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xFFFF;
    }
  }
  
  return crc;
}

// Validate CRC (little-endian format as per IoT device)
function validateCRC(frameWithCRC) {
  if (frameWithCRC.length < 2) {
    return false;
  }
  
  const frameData = frameWithCRC.slice(0, -2);
  // Little-endian: low byte first, high byte second
  const receivedCRC = frameWithCRC[frameWithCRC.length - 2] | 
                     (frameWithCRC[frameWithCRC.length - 1] << 8);
  
  const calculatedCRC = calculateCRC16(frameData, frameData.length);
  
  console.log(`CRC Debug - Received: 0x${receivedCRC.toString(16)}, Calculated: 0x${calculatedCRC.toString(16)}`);
  
  return receivedCRC === calculatedCRC;
}

// No decryption needed - encryption is disabled on IoT device
// Data is sent as plain compressed data with CRC

// Decompress data (reverse of compress_buffer_with_header)
function decompressData(compressedData) {
  try {
    // For now, try standard zlib decompression
    // TODO: Implement exact reverse of compress_buffer_with_header() function
    
    // Check if data has compression header
    if (compressedData.length < 4) {
      throw new Error('Data too short for compression header');
    }
    
    // Try to decompress assuming zlib format
    return zlib.inflateSync(compressedData);
  } catch (error) {
    // If zlib fails, the data might be in a custom format
    // For testing, return the data as-is and log the issue
    console.warn('Decompression failed, returning raw data:', error.message);
    return compressedData;
  }
}

// Parse register readings from decompressed data
function parseRegisterReadings(decompressedData) {
  const readings = [];
  
  try {
    // Parse compression header if present
    let offset = 0;
    
    // Check for potential header containing reading count
    if (decompressedData.length >= 4) {
      const possibleCount = decompressedData.readUInt32LE(offset);
      
      // If this looks like a reasonable count, use it
      if (possibleCount > 0 && possibleCount < 1000) {
        offset += 4;
        console.log(`Found reading count in header: ${possibleCount}`);
      }
    }
    
    // Assume register_reading_t structure:
    // - Each reading contains multiple uint16_t values (READ_REGISTER_COUNT)
    // - May include timestamp or sequence number
    
    const REGISTER_SIZE = 2; // uint16_t = 2 bytes
    const READ_REGISTER_COUNT = 6; // Adjust based on actual count
    const READING_SIZE = READ_REGISTER_COUNT * REGISTER_SIZE; // + timestamp if present
    
    for (let i = offset; i < decompressedData.length; i += READING_SIZE) {
      if (i + READING_SIZE <= decompressedData.length) {
        const reading = {
          timestamp: Date.now(), // Use current time for now
          values: []
        };
        
        // Extract register values
        for (let j = 0; j < READ_REGISTER_COUNT; j++) {
          const value = decompressedData.readUInt16LE(i + (j * REGISTER_SIZE));
          reading.values.push(value);
        }
        
        readings.push(reading);
      }
    }
    
    console.log(`Parsed ${readings.length} readings from ${decompressedData.length} bytes`);
    return readings;
    
  } catch (error) {
    console.warn('Failed to parse readings, returning raw data info:', error.message);
    
    // Fallback: return basic info about the data
    return [{
      timestamp: Date.now(),
      values: Array.from(decompressedData.slice(0, Math.min(12, decompressedData.length))),
      raw_length: decompressedData.length,
      note: 'Raw data - parsing failed'
    }];
  }
}

// Generate response frame (confirmation for IoT device)
function generateResponseFrame(readingCount = 0) {
  // Create a simple acknowledgment frame
  const response = Buffer.alloc(8);
  
  // Write magic number for acknowledgment
  response.writeUInt32LE(0xACE5, 0); // "ACES" in little-endian
  
  // Write number of readings processed
  response.writeUInt16LE(readingCount, 4);
  
  // Write status (0 = success)
  response.writeUInt16LE(0, 6);
  
  return response.toString('hex');
}

export async function POST(req) {
  try {
    // Check Authorization header for API key
    const authHeader = req.headers.get('authorization');
    if (!authHeader || authHeader !== EXPECTED_API_KEY) {
      return NextResponse.json(
        { error: "Invalid or missing API key" },
        { status: 401 }
      );
    }

    // Check content type
    const contentType = req.headers.get('content-type');
    if (contentType !== 'application/octet-stream') {
      return NextResponse.json(
        { error: "Content-Type must be application/octet-stream" },
        { status: 400 }
      );
    }

    // Read binary data
    const arrayBuffer = await req.arrayBuffer();
    const frameWithCRC = new Uint8Array(arrayBuffer);

    // Validate frame size
    if (frameWithCRC.length < 3 || frameWithCRC.length > MAX_COMPRESSION_SIZE + 2) {
      return NextResponse.json(
        { error: "Invalid frame size" },
        { status: 400 }
      );
    }

    // Step 1: Validate CRC
    console.log(`Received frame: ${frameWithCRC.length} bytes`);
    
    if (!validateCRC(frameWithCRC)) {
      console.error('CRC validation failed');
      return NextResponse.json(
        { error: "CRC validation failed" },
        { status: 400 }
      );
    }

    // Step 2: Remove CRC to get compressed data (no decryption needed)
    const compressedData = frameWithCRC.slice(0, -2);
    console.log(`Compressed data: ${compressedData.length} bytes`);

    // Step 3: Decompress the data
    let decompressedData;
    try {
      decompressedData = decompressData(compressedData);
      console.log(`Decompressed data: ${decompressedData.length} bytes`);
    } catch (error) {
      console.error('Decompression error:', error.message);
      return NextResponse.json(
        { error: "Decompression failed" },
        { status: 400 }
      );
    }

    // Step 4: Parse register readings
    let readings;
    try {
      readings = parseRegisterReadings(decompressedData);
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to parse readings" },
        { status: 400 }
      );
    }

    // Step 5: Store data in database
    const deviceId = `device_${Date.now()}`; // Generate device ID for now
    
    const { error: dbError } = await supabase
      .from("eco_data")
      .insert([{
        device_id: deviceId,
        compressed_payload: {
          readings: readings,
          timestamp: new Date().toISOString(),
          reading_count: readings.length,
          processing_notes: 'Processed without encryption'
        },
        original_size: decompressedData.length,
        compressed_size: compressedData.length
      }]);

    if (dbError) {
      console.error("Database insert error:", dbError);
      return NextResponse.json(
        { error: "Database storage failed" },
        { status: 500 }
      );
    }

    console.log(`Successfully stored ${readings.length} readings for device ${deviceId}`);

    // Step 6: Generate response frame
    const responseFrame = generateResponseFrame(readings.length);

    // Return success response with frame (format expected by validate_upload_response)
    return NextResponse.json({
      status: "success",
      frame: responseFrame,
      readings_processed: readings.length
    });

  } catch (error) {
    console.error("Cloud API error:", error);
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