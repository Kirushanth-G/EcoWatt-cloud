import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const history = await prisma.fotaUpdate.findMany({
      orderBy: {
        created_at: 'desc',
      },
      take: 20, // Last 20 updates
    });

    return NextResponse.json(history);

  } catch (error) {
    console.error('Error fetching FOTA history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch update history' },
      { status: 500 }
    );
  }
}
