import { NextResponse } from "next/server";
import { NonceManager, NONCE_FILE_PATH } from '../../cloud/write/encryptionAndSecurity.js';

// Admin endpoint to reset nonce for debugging/recovery
export async function POST(req) {
    try {
        // Get the admin key from headers for security
        const adminKey = req.headers.get('admin-key');
        if (adminKey !== 'ColdPlay@Admin2025') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { nonce } = body;

        if (typeof nonce !== 'number' || nonce < 0) {
            return NextResponse.json(
                { error: "Invalid nonce value" },
                { status: 400 }
            );
        }

        // Reset the nonce
        const nonceManager = new NonceManager(NONCE_FILE_PATH);
        nonceManager.writeNonce(nonce);

        console.log(`Admin reset nonce to: ${nonce}`);

        return NextResponse.json({
            status: "success",
            message: `Nonce reset to ${nonce}`,
            nonce: nonce
        });

    } catch (error) {
        console.error("Admin nonce reset error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// Get current nonce value
export async function GET(req) {
    try {
        // Get the admin key from headers for security
        const adminKey = req.headers.get('admin-key');
        if (adminKey !== 'ColdPlay@Admin2025') {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const nonceManager = new NonceManager(NONCE_FILE_PATH);
        const currentNonce = nonceManager.readNonce();

        return NextResponse.json({
            status: "success",
            nonce: currentNonce
        });

    } catch (error) {
        console.error("Admin nonce get error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}