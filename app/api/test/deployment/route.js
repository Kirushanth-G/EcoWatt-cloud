import { NextResponse } from "next/server";

// Simple test endpoint to verify deployment status
export async function GET(req) {
    try {
        return NextResponse.json({
            status: "success",
            message: "Fixed nonce implementation active",
            expected_nonce: 12345,
            timestamp: new Date().toISOString(),
            deployment_version: "2025-10-16-fixed-nonce"
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}