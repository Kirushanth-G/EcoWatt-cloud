#!/usr/bin/env node

// Test script for EcoWatt API endpoint
// Run with: node test-upload.js

const testData = {
  device_id: "ECO001",
  compressed_payload: {
    timestamp: Date.now(),
    voltage: 220.5,
    current: 1.2,
    power: 264.6,
    energy: 0.88,
    temperature: 25.3,
    humidity: 60.2
  },
  original_size: 150,
  compressed_size: 89
};

async function testUpload() {
  try {
    console.log("🧪 Testing EcoWatt upload API...");
    console.log("📤 Sending test data:", JSON.stringify(testData, null, 2));

    const response = await fetch("http://localhost:3000/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testData),
    });

    const result = await response.json();
    
    console.log("📥 Response status:", response.status);
    console.log("📥 Response data:", JSON.stringify(result, null, 2));

    if (response.ok && result.ack) {
      console.log("✅ Upload test successful!");
      console.log("🔧 Server configs:", result.configs);
    } else {
      console.log("❌ Upload test failed!");
    }

  } catch (error) {
    console.error("❌ Test error:", error.message);
    console.log("💡 Make sure the development server is running: npm run dev");
  }
}

testUpload();