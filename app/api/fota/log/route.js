import { promises as fs } from "fs";
import path from "path";

// Handle POST requests
export async function POST(request) {
  try {
    // Read the request body as text
    const body = await request.text();

    // Define where to save the file
    const uploadsDir = path.join(process.cwd(), "private", "fota_logs");
    // await fs.mkdir(uploadsDir, { recursive: true }); // ensure directory exists

    // Timestamped file name
    const filename = `log_${Date.now()}.txt`;
    const filePath = path.join(uploadsDir, filename);

    // Write file to disk
    await fs.writeFile(filePath, body, "utf-8");

    return new Response(JSON.stringify({ success: true, file: filename }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("File save error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
