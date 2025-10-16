import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { writeFile, mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';

const prisma = new PrismaClient();

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('firmware');

    if (!file) {
      return NextResponse.json(
        { error: 'No firmware file provided' },
        { status: 400 }
      );
    }

    // Validate file extension
    if (!file.name.endsWith('.bin')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .bin files are allowed' },
        { status: 400 }
      );
    }

    // Read file content
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Calculate SHA-256
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'uploads');
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Save firmware to /uploads/firmware.bin (overwrites existing)
    const firmwarePath = path.join(uploadsDir, 'firmware.bin');
    await writeFile(firmwarePath, buffer);

    // Update or create firmware_storage record
    await prisma.firmwareStorage.upsert({
      where: { id: 1 },
      update: {
        filename: file.name,
        size: buffer.length,
        sha256: sha256,
        uploaded_at: new Date(),
      },
      create: {
        id: 1,
        filename: file.name,
        size: buffer.length,
        sha256: sha256,
        uploaded_at: new Date(),
      },
    });

    // Create FOTA update record with PENDING status
    await prisma.fotaUpdate.create({
      data: {
        firmware_sha256: sha256,
        firmware_size: buffer.length,
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Firmware uploaded successfully',
      filename: file.name,
      size: buffer.length,
      sha256: sha256,
    });

  } catch (error) {
    console.error('Firmware upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload firmware', details: error.message },
      { status: 500 }
    );
  }
}
