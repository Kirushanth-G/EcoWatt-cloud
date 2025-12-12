import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Force Node.js runtime for file system operations
export const runtime = 'nodejs';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req) {
  try {
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.startsWith('localhost') ? 'http' : 'https';
    
    // Use network IP for ESP32 connectivity if localhost
    const baseUrl = host === 'localhost:3000' ? 
      'http://192.168.8.159:3000' : 
      `${protocol}://${host}`;

    let pendingUpdate;
    
    // Try Prisma first, fallback to Supabase
    try {
      pendingUpdate = await prisma.fotaUpdate.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
    } catch (prismaError) {
      console.error('Prisma failed, using Supabase:', prismaError);
      
      const { data, error } = await supabase
        .from("fota_updates")
        .select("*")
        .eq("status", "PENDING")
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      pendingUpdate = data?.[0] ? {
        id: data[0].id,
        firmwareSha256: data[0].firmware_sha256,
        firmwareSize: data[0].firmware_size,
        status: data[0].status,
        createdAt: data[0].created_at,
        updatedAt: data[0].updated_at,
      } : null;
    }

    if (!pendingUpdate) {
      return NextResponse.json(
        { 
          message: 'No firmware update available',
          hasUpdate: false 
        },
        { status: 200 }
      );
    }

    // Get firmware file path
    const firmwareFileName = `firmware_${pendingUpdate.firmwareSha256.substring(0, 8)}.bin`;
    const firmwarePath = path.join(process.cwd(), 'public', firmwareFileName);
    
    // Check if firmware file exists, if not try generic names
    let actualFirmwarePath = firmwarePath;
    if (!fs.existsSync(firmwarePath)) {
      // Try common firmware names
      const commonNames = ['firmware.bin', 'guru_firmware.bin', 'test_firmware.bin'];
      let found = false;
      
      for (const name of commonNames) {
        const testPath = path.join(process.cwd(), 'public', name);
        if (fs.existsSync(testPath)) {
          actualFirmwarePath = testPath;
          found = true;
          break;
        }
      }
      
      if (!found) {
        console.error('Firmware file not found:', firmwarePath);
        
        // Mark as failed in database
        try {
          await prisma.fotaUpdate.update({
            where: { id: pendingUpdate.id },
            data: { 
              status: 'FAILED',
              errorMessage: 'Firmware file not found',
              updatedAt: new Date(),
            },
          });
        } catch (dbError) {
          // Try Supabase fallback
          await supabase
            .from("fota_updates")
            .update({
              status: 'FAILED',
              error_message: 'Firmware file not found',
              updated_at: new Date().toISOString(),
            })
            .eq("id", pendingUpdate.id);
        }
        
        return NextResponse.json(
          { error: 'Firmware file not found' },
          { status: 404 }
        );
      }
    }

    // Generate firmware download URL
    const actualFileName = path.basename(actualFirmwarePath);
    const downloadUrl = `${baseUrl}/api/fota/download?file=${actualFileName}`;

    // Read private key for signing
    const privateKeyPath = path.join(process.cwd(), 'private', 'ecdsa_private.pem');
    let signature = '';
    
    if (fs.existsSync(privateKeyPath)) {
      try {
        const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
        const sign = crypto.createSign('SHA256');
        sign.update(pendingUpdate.firmwareSha256);
        signature = sign.sign(privateKey, 'base64');
      } catch (signError) {
        console.error('Error generating signature:', signError);
      }
    }

    // Mark as SENDING
    try {
      await prisma.fotaUpdate.update({
        where: { id: pendingUpdate.id },
        data: { 
          status: 'SENDING',
          updatedAt: new Date(),
        },
      });
    } catch (dbError) {
      // Try Supabase fallback
      await supabase
        .from("fota_updates")
        .update({
          status: 'SENDING',
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendingUpdate.id);
    }

    // Return manifest for ESP32
    const manifest = {
      hasUpdate: true,
      version: pendingUpdate.firmwareSha256.substring(0, 16),
      sha256: pendingUpdate.firmwareSha256,
      size: pendingUpdate.firmwareSize,
      url: downloadUrl,
      signature: signature,
      timestamp: new Date().toISOString(),
    };

    console.log('FOTA manifest sent to ESP32:', manifest);
    return NextResponse.json(manifest);

  } catch (error) {
    console.error('Error generating FOTA manifest:', error);
    return NextResponse.json(
      { error: 'Failed to generate firmware manifest' },
      { status: 500 }
    );
  }
}