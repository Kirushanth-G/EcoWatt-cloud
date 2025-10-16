#!/usr/bin/env python3
"""
Generate test frames with different configurations to test dynamic frame validation
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

def create_dynamic_test_frame(count, reg_count, test_name):
    """Create a test frame with configurable parameters"""
    print(f"\n=== Creating {test_name} ===")
    
    # Metadata flag (1 byte) - raw compression
    metadata_flag = 0x00
    
    # Simulate compressed data - each register: 2 bytes initial + 2 bytes RLE
    bytes_per_register = 4  # 2 bytes initial value + 2 bytes compression
    compressed_size = reg_count * bytes_per_register
    
    # Header (5 bytes): count (big-endian), reg_count, compressed_size (big-endian)
    header = struct.pack('>HBH', 
                        count,           # Bytes 0-1: count (big-endian)
                        reg_count,       # Byte 2: reg_count
                        compressed_size) # Bytes 3-4: compressed_size (big-endian)
    
    # Create test compressed data
    compressed_data = b''
    for reg in range(reg_count):
        # Initial value (varies by register)
        initial_value = 1000 + reg * 100
        compressed_data += struct.pack('>H', initial_value)
        # RLE: repeat current value (count-1) times
        compressed_data += struct.pack('BB', 0x00, count-1)
    
    # Combine metadata + header + data
    frame_without_crc = struct.pack('B', metadata_flag) + header + compressed_data
    
    # Calculate CRC
    crc = calculate_crc16_modbus(frame_without_crc)
    crc_bytes = struct.pack('<H', crc)  # Little-endian CRC
    
    # Complete frame
    complete_frame = frame_without_crc + crc_bytes
    
    print(f"  Configuration: {count} samples, {reg_count} registers")
    print(f"  Frame size: {len(complete_frame)} bytes")
    print(f"  Compressed data: {len(compressed_data)} bytes")
    print(f"  Frame structure: metadata(1) + header(5) + data({len(compressed_data)}) + crc(2)")
    
    return complete_frame

def main():
    """Test different configurations that could result from remote config changes"""
    
    # Test cases simulating different timing configurations
    test_cases = [
        # (count, reg_count, test_name)
        (5, 10, "Default Config"),           # Current default: 15s upload / 3s poll = 5 samples
        (10, 10, "Faster Uploads"),          # 30s upload / 3s poll = 10 samples  
        (20, 10, "Slower Polling"),          # 60s upload / 3s poll = 20 samples
        (3, 8, "Fewer Registers"),           # Different register configuration
        (50, 10, "Long Interval"),           # 150s upload / 3s poll = 50 samples
    ]
    
    for count, reg_count, test_name in test_cases:
        frame = create_dynamic_test_frame(count, reg_count, test_name)
        
        # Save to file
        filename = f"test_frame_{count}x{reg_count}.bin"
        with open(filename, 'wb') as f:
            f.write(frame)
        
        print(f"  Saved to: {filename}")
        print(f"  Test command: curl -X POST http://localhost:3000/api/cloud/write -H 'Content-Type: application/octet-stream' -H 'Authorization: ColdPlay2025' --data-binary '@{filename}'")

if __name__ == "__main__":
    main()