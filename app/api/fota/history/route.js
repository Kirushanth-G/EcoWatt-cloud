import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createClient } from "@supabase/supabase-js";

// Fallback to Supabase if Prisma fails
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    // Try Prisma first
    const history = await prisma.fotaUpdate.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 20, // Last 20 updates
    });

    // Convert BigInt to string for JSON serialization
    const serializedHistory = history.map(item => ({
      ...item,
      id: item.id.toString(),
      fotaUpdateId: item.fotaUpdateId?.toString()
    }));

    return NextResponse.json(serializedHistory);

  } catch (prismaError) {
    console.error('Prisma error, trying Supabase:', prismaError);
    
    // Fallback to Supabase
    try {
      const { data: history, error } = await supabase
        .from("fota_updates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      
      return NextResponse.json(history);
      
    } catch (supabaseError) {
      console.error('Both Prisma and Supabase failed:', supabaseError);
      return NextResponse.json(
        { 
          error: 'Failed to fetch update history',
          details: 'Database connection error'
        },
        { status: 500 }
      );
    }
  }
}
