import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const currentFirmware = await prisma.firmwareStorage.findUnique({
      where: { id: 1 },
    });

    if (!currentFirmware) {
      return NextResponse.json(
        { error: 'No firmware uploaded yet' },
        { status: 404 }
      );
    }

    return NextResponse.json(currentFirmware);

  } catch (error) {
    console.error('Error fetching current firmware:', error);
    return NextResponse.json(
      { error: 'Failed to fetch firmware info' },
      { status: 500 }
    );
  }
}
