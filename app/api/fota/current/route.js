import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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
      { 
        error: 'Failed to fetch firmware info',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      },
      { status: 500 }
    );
  }
}
