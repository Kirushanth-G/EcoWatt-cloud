import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  try {
    // Path to the JSON file inside /manifest.json
    const filePath = path.join(process.cwd(), "public", "manifest.json");

    // Read the JSON file contents
    const fileContents = await fs.readFile(filePath, "utf-8");
    const jsonData = JSON.parse(fileContents);

    // Return it as a JSON response
    return NextResponse.json(jsonData, { status: 200 });
  } catch (error) {
    console.error("Error reading manifest.json:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
