// Test script to debug the exact issue with the HTTP 400 error
import { processEncryptedUpload } from './app/api/cloud/write/encryptionAndSecurity.js';

// Simulate a request like the device sends
const testPayload = Buffer.from([
    // Simulate encrypted payload (80 bytes: 16 IV + 64 ciphertext)
    0xEF, 0x03, 0x6E, 0x4D, 0x34, 0x95, 0x4D, 0xD3, 0xC2, 0x48, 0x90, 0x96, 0x7E, 0x86, 0xC8, 0x06,
    // ... rest would be ciphertext
    ...Array(64).fill(0x00)
]);

const testNonce = "12345";
const testMAC = "3a1fd6f1720af006d6698d34ded4d332515569f09961f123c6865085b97f177e";

console.log('Testing encrypted upload processing...');
console.log(`Payload size: ${testPayload.length} bytes`);
console.log(`Nonce: ${testNonce}`);
console.log(`MAC: ${testMAC}`);

const result = processEncryptedUpload(testPayload, testNonce, testMAC);

console.log('Result:', result);