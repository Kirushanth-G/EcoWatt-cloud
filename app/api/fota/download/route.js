import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

// Force Node.js runtime for file system operations
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const firmwarePath = path.join(process.cwd(), 'uploads', 'firmware.bin');

    // Check if file exists
    let fileStats;
    try {
      fileStats = await stat(firmwarePath);
    } catch (error) {
      return NextResponse.json(
        { error: 'Firmware not found' },
        { status: 404 }
      );
    }

    const fileSize = fileStats.size;
    const range = request.headers.get('range');

    // If no Range header, send entire file
    if (!range) {
      const fileBuffer = await readFile(firmwarePath);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes',
        },
      });
    }

    // Parse Range header (e.g., "bytes=0-1023")
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    // Validate range
    if (start >= fileSize || end >= fileSize) {
      return NextResponse.json(
        { error: 'Range not satisfiable' },
        { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } }
      );
    }

    // Read the requested chunk
    const fileHandle = await readFile(firmwarePath);
    const chunk = fileHandle.slice(start, end + 1);

    return new NextResponse(chunk, {
      status: 206, // Partial Content
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': chunkSize.toString(),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
      },
    });

  } catch (error) {
    console.error('Firmware download error:', error);
    return NextResponse.json(
      { error: 'Failed to download firmware', details: error.message },
      { status: 500 }
    );
  }
}
