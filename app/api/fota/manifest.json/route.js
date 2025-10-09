import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  try {
    // Path to the JSON file inside /manifest.json
    const filePath = path.join(process.cwd(), "manifest.json");

    // Read the JSON file contents
    const fileContents = await fs.readFile(filePath, "utf-8");

    // Return it as a JSON response
    return new NextResponse(fileContents, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      },
    });

  } catch (error) {
    console.error("Error reading manifest.json:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to read manifest.json",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
