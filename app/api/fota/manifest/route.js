import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  try {
    const data = {
      job_id: "0",
      fwUrl: "https://eco-watt-cloud.vercel.app/api/fota/firmware",
      fwSize: "",
      shaExpected: ""
    };
    // Path to the JSON file inside /manifest.json
    const filePath = path.join(process.cwd(), "public", "manifest.json");

    const jsonString = JSON.stringify(data, null, 2); // pretty print with 2 spaces
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
