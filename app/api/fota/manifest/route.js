import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { createHash, createSign } from "crypto";
import path from "path";

export async function GET() {
  try {
    // Randomly choose firmware
    let fw = ["normal", "corrupted"];
    fw = fw[Math.floor(Math.random() * fw.length)];
    fw = fw === "normal" ? "firmware" : "corrupted_firmware";

    const filePath = path.join(process.cwd(), "public", fw + ".bin");

    // File size and SHA-256 hash
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    const fileBuffer = await fs.readFile(filePath);
    const hash = createHash("sha256");
    hash.update(fileBuffer);
    const sha256 = hash.digest("hex");

    // Create JSON data
    const jsonData = {
      job_id: "0",
      fwUrl: "https://eco-watt-cloud.vercel.app/api/fota/" + fw,
      fwSize: fileSize,
      shaExpected: sha256
    };

    // Read private key
    const keyPath = path.join(process.cwd(), "private", "ecdsa_private.pem");
    const privateKey = await fs.readFile(keyPath, "utf-8");

    // Sign JSON
    const signer = createSign("SHA256");
    signer.update(JSON.stringify(jsonData)); // must stringify
    signer.end();
    const signature = signer.sign(privateKey, "base64");

    // Add signature to JSON
    jsonData.signature = signature;

    // Return JSON response
    return NextResponse.json(jsonData, { status: 200 });

  } catch (error) {
    console.error("Error generating manifest:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
