#!/usr/bin/env python3
"""
Generate test binary frame for EcoWatt Cloud API
Based on the implementation in /app/api/cloud/write/route.js
"""

import struct

def calculate_crc16_modbus(data):
    """Calculate CRC16-MODBUS with polynomial 0xA001"""
    crc = 0xFFFF
    
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x0001:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc = crc >> 1
    
    return crc & 0xFFFF

def create_test_frame():
    """Create a 48-byte test frame matching device implementation: metadata + header + compressed data + CRC"""
    
    # Metadata flag (1 byte) - matches scheduler.cpp line 341
    metadata_flag = 0x00  # Raw compression flag (0x01 would be aggregated)
    
    # Header (5 bytes): count (big-endian), reg_count, compressed_size (big-endian)
    count = 5               # Number of samples
    reg_count = 10          # Number of registers per sample  
    compressed_size = 40    # Size of compressed data
    
    header = struct.pack('>HBH', 
                        count,           # Bytes 0-1: count (big-endian)
                        reg_count,       # Byte 2: reg_count
                        compressed_size) # Bytes 3-4: compressed_size (big-endian)
    # Note: This creates 5 bytes total: 2 + 1 + 2 = 5
    
    # Test sensor values for 5 readings, 10 registers each
    # The API processes data register by register, not reading by reading
    first_values = [
        2300,  # vac1: 230.0V (x10)
        150,   # iac1: 15.0A (x10) 
        5000,  # fac1: 50.00Hz (x100)
        3800,  # vpv1: 380.0V (x10)
        4200,  # vpv2: 420.0V (x10)
        80,    # ipv1: 8.0A (x10)
        95,    # ipv2: 9.5A (x10)
        450,   # temperature: 45.0°C (x10)
        85,    # export_power: 85% (x1)
        3500   # output_power: 3500W (x1)
    ]
    
    compressed_data = b''
    
    # For each register: first_value (big-endian) + compression_data
    for i, first_value in enumerate(first_values):
        # Pack first value (2 bytes, big-endian as per documentation)
        compressed_data += struct.pack('>H', first_value)
        
        # Use RLE to repeat the same value 4 more times (total 5 samples)
        # RLE format: 0x00 + run_length (4 for remaining readings)
        compressed_data += struct.pack('BB', 0x00, 0x04)  # RLE: repeat current value 4 times
    
    # Total: 10 registers × (2 + 2) = 40 bytes
    
    # Combine metadata + header + data (matches scheduler.cpp implementation)
    frame_without_crc = struct.pack('B', metadata_flag) + header + compressed_data
    
    # Calculate CRC (matches calculateCRC function)
    crc = calculate_crc16_modbus(frame_without_crc)
    crc_bytes = struct.pack('<H', crc)  # Little-endian CRC (matches append_crc_to_upload_frame)
    
    # Complete frame: metadata + header + data + crc
    complete_frame = frame_without_crc + crc_bytes
    
    print(f"Frame breakdown (matches device implementation):")
    print(f"  Metadata (1 byte): {struct.pack('B', metadata_flag).hex(' ')}")
    print(f"  Header (5 bytes): {header.hex(' ')}")
    print(f"  Data (40 bytes): {compressed_data.hex(' ')}")
    print(f"  CRC (2 bytes): {crc_bytes.hex(' ')}")
    print(f"  Total: {len(complete_frame)} bytes")
    print(f"  Frame hex: {complete_frame.hex(' ')}")
    
    return complete_frame

if __name__ == "__main__":
    frame = create_test_frame()
    
    # Save to file for curl
    with open('test_frame.bin', 'wb') as f:
        f.write(frame)
    
    print(f"\nTest frame saved to 'test_frame.bin'")
    print(f"\nCurl command (matches device Authorization header):")
    print(f"curl -X POST https://eco-watt-cloud.vercel.app/api/cloud/write \\")
    print(f"  -H 'Content-Type: application/octet-stream' \\")
    print(f"  -H 'Authorization: ColdPlay2025' \\")
    print(f"  --data-binary '@test_frame.bin'")
    
    print(f"\nExpected sensor readings:")
    values = [2300, 150, 5000, 3800, 4200, 80, 95, 450, 85, 3500]
    gains = [10, 10, 100, 10, 10, 10, 10, 10, 1, 1]
    labels = ['vac1 (V)', 'iac1 (A)', 'fac1 (Hz)', 'vpv1 (V)', 'vpv2 (V)', 
              'ipv1 (A)', 'ipv2 (A)', 'temp (°C)', 'export_power (%)', 'output_power (W)']
    
    for i, (val, gain, label) in enumerate(zip(values, gains, labels)):
        actual = val / gain
        print(f"  {label}: {actual}")