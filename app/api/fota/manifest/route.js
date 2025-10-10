import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { createHash } from "crypto";
import path from "path";

export async function GET() {
  try {

    const filePath = path.join(process.cwd(), "public", "firmware.bin");
    const stats = await fs.stat(filePath);
    const fileSize = stats.size; // size in bytes
    const fileBuffer = await fs.readFile(filePath);
    const hash = createHash("sha256");
    hash.update(fileBuffer);
    const sha256 = hash.digest("hex");

    const data = {
      job_id: "0",
      fwUrl: "https://eco-watt-cloud.vercel.app/api/fota/firmware",
      fwSize: fileSize,
      shaExpected: sha256
    };

    const jsonString = JSON.stringify(data, null, 2); // pretty print with 2 spaces

    // // Path to the JSON file inside /manifest.json
    // const filePath = path.join(process.cwd(), "public", "manifest.json");
    // Write the file
    // await fs.writeFile(filePath, jsonString, "utf-8");

    // // Read the JSON file contents
    // const fileContents = await fs.readFile(filePath, "utf-8");
    // const jsonData = JSON.parse(fileContents);

    const jsonData = JSON.parse(jsonString);
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
