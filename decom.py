import struct

def decompress_frame(frame: bytes):
    if len(frame) < 6:
        raise ValueError("Frame too small")

    # 1) Aggregation flag
    is_aggregated = frame[0] != 0

    # 2) Parse header
    count = (frame[1] << 8) | frame[2]           # number of samples
    reg_count = frame[3]                         # number of registers
    payload_size = (frame[4] << 8) | frame[5]    # payload size

    if payload_size + 6 > len(frame):
        raise ValueError("Payload size mismatch")

    data = frame[6:6+payload_size]
    idx = 0

    samples = [[0] * reg_count for _ in range(count)]

    # Decode each register stream
    for reg in range(reg_count):
        if idx + 2 > len(data):
            raise ValueError("Truncated initial value")
        prev_val = (data[idx] << 8) | data[idx+1]
        idx += 2
        samples[0][reg] = prev_val
        sample_idx = 1

        while sample_idx < count and idx < len(data):
            flag = data[idx]
            idx += 1
            if flag == 0x00:  # RLE
                if idx >= len(data):
                    raise ValueError("Truncated RLE run")
                run = data[idx]
                idx += 1
                for _ in range(run):
                    if sample_idx >= count:
                        break
                    samples[sample_idx][reg] = prev_val
                    sample_idx += 1
            elif flag == 0x01:  # Delta
                if idx + 2 > len(data):
                    raise ValueError("Truncated delta")
                delta = struct.unpack(">h", data[idx:idx+2])[0]
                idx += 2
                prev_val = (prev_val + delta) & 0xFFFF
                samples[sample_idx][reg] = prev_val
                sample_idx += 1
            else:
                raise ValueError(f"Unknown flag {flag:#x}")

        if sample_idx < count:
            raise ValueError("Not enough data to fill all samples")

    return samples, is_aggregated, count, reg_count


if __name__ == "__main__":
    # Paste compressed frame as space-separated bytes
    raw = input("Paste compressed bytes: ").strip()
    byte_values = [int(x) for x in raw.split()]
    frame = bytes(byte_values)

    samples, is_agg, count, reg_count = decompress_frame(frame)

    print(f"Aggregated: {'YES' if is_agg else 'NO'}")
    print(f"Samples   : {count}")
    print(f"Registers : {reg_count}")
    for row in samples:
        print(" ".join(str(v) for v in row))