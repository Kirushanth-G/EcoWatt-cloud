import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    // Path to the binary file
    const filePath = path.join(process.cwd(), "public", "guru_firmware.bin");
    const fileStat = await fs.stat(filePath);
    const fileSize = fileStat.size;

    // Read the "Range" header
    const range = req.headers.get("Range");
    if (!range) {
      // No Range header — send full file
      const fileBuffer = await fs.readFile(filePath);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": fileSize,
          "Accept-Ranges": "bytes",
        },
      });
    }

    // Parse range header: "bytes=start-end"
    const bytesPrefix = "bytes=";
    if (!range.startsWith(bytesPrefix)) {
      return new NextResponse("Malformed range", { status: 416 });
    }

    const [startStr, endStr] = range.replace(bytesPrefix, "").split("-");
    let start = parseInt(startStr, 10);
    let end = endStr ? parseInt(endStr, 10) : fileSize - 1;

    // Validate range
    if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) {
      return new NextResponse("Range Not Satisfiable", { status: 416 });
    }

    const chunkSize = end - start + 1;

    // Read only the requested chunk
    const fileHandle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(chunkSize);
    await fileHandle.read(buffer, 0, chunkSize, start);
    await fileHandle.close();

    // Return partial content
    return new NextResponse(buffer, {
      status: 206,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": chunkSize,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
      },
    });

  } catch (error) {
    console.error("Error serving binary file:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
