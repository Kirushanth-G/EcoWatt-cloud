import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { createClient } from "@supabase/supabase-js";
import path from 'path';

// Force Node.js runtime for file system operations
export const runtime = 'nodejs';

// Check if running on Vercel (serverless)
const isVercel = process.env.VERCEL === '1';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const range = request.headers.get('range');

    if (isVercel) {
      // On Vercel: Download from Supabase Storage
      console.log('Downloading from Supabase Storage (Vercel environment)');

      // Get file size first
      const { data: fileList, error: listError } = await supabase.storage
        .from('firmware')
        .list('', {
          search: 'firmware.bin'
        });

      if (listError || !fileList || fileList.length === 0) {
        return NextResponse.json(
          { error: 'Firmware not found in storage' },
          { status: 404 }
        );
      }

      const fileSize = fileList[0].metadata?.size || 0;

      // Download the file
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('firmware')
        .download('firmware.bin');

      if (downloadError || !fileData) {
        console.error('Supabase storage download error:', downloadError);
        return NextResponse.json(
          { error: 'Failed to download firmware from storage' },
          { status: 500 }
        );
      }

      // Convert Blob to Buffer
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Handle range requests
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1;
        const chunkSize = end - start + 1;

        if (start >= buffer.length || end >= buffer.length) {
          return NextResponse.json(
            { error: 'Range not satisfiable' },
            { status: 416, headers: { 'Content-Range': `bytes */${buffer.length}` } }
          );
        }

        const chunk = buffer.slice(start, end + 1);

        return new NextResponse(chunk, {
          status: 206,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': chunkSize.toString(),
            'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }

      // Send entire file
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': buffer.length.toString(),
          'Accept-Ranges': 'bytes',
        },
      });

    } else {
      // On localhost: Read from local file system
      console.log('Reading from local file system (localhost)');
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

      // Parse Range header
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
        status: 206,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': chunkSize.toString(),
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }

  } catch (error) {
    console.error('Firmware download error:', error);
    return NextResponse.json(
      { error: 'Failed to download firmware', details: error.message },
      { status: 500 }
    );
  }
}
