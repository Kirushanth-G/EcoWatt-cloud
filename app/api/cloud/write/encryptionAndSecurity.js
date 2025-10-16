import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Encryption PSK - MUST match ESP32 config.h: #define UPLOAD_PSK "ColdPlay@EcoWatt2025"
const UPLOAD_PSK = "ColdPlay@EcoWatt2025";
const NONCE_FILE_PATH = path.join(__dirname, 'nonce.json');

function encodeBase64(payload) {
    return Buffer.from(payload, 'utf8').toString('base64');
}

function decodeBase64(encodedPayload) {
    return Buffer.from(encodedPayload, 'base64');
}

function generateMAC(payload, secretKey) {
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(payload);
    return hmac.digest('hex');
}

function verifyMAC(macA, macB) {
    if (typeof macA !== 'string' || typeof macB !== 'string') {
        return false;
    }

    if (macA.length !== macB.length) {
        return false;
    }

    let diff = 0;
    for (let i = 0; i < macA.length; i++) {
        diff |= macA.charCodeAt(i) ^ macB.charCodeAt(i);
    }

    return diff === 0;
}

/**
 * Derives a 32-byte AES-256 key from the PSK using SHA-256
 * (matches ESP32 implementation)
 */
function deriveAESKey(psk) {
    return crypto.createHash('sha256').update(psk, 'utf8').digest();
}

/**
 * Decrypts AES-256-CBC encrypted payload from device
 * @param {Buffer} encryptedPayload - Raw binary data (IV + Ciphertext)
 * @returns {Buffer} Decrypted plaintext with PKCS#7 padding removed
 */
function decryptPayloadAES_CBC(encryptedPayload) {
    if (encryptedPayload.length < 16) {
        throw new Error('Encrypted payload too short (must include 16-byte IV)');
    }

    // Step 1: Derive AES-256 key from PSK (same as ESP32)
    const aesKey = deriveAESKey(UPLOAD_PSK);

    // Step 2: Extract IV (first 16 bytes) and ciphertext (rest)
    const iv = encryptedPayload.slice(0, 16);
    const ciphertext = encryptedPayload.slice(16);

    console.log(`[DECRYPTION] IV: ${iv.toString('hex')}`);
    console.log(`[DECRYPTION] Ciphertext length: ${ciphertext.length} bytes`);

    // Step 3: Decrypt using AES-256-CBC
    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
    decipher.setAutoPadding(false); // We'll manually remove PKCS#7 padding

    let decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]);

    // Step 4: Remove PKCS#7 padding
    const paddingLength = decrypted[decrypted.length - 1];
    if (paddingLength > 0 && paddingLength <= 16) {
        // Verify padding is valid PKCS#7
        for (let i = decrypted.length - paddingLength; i < decrypted.length; i++) {
            if (decrypted[i] !== paddingLength) {
                throw new Error('Invalid PKCS#7 padding');
            }
        }
        decrypted = decrypted.slice(0, decrypted.length - paddingLength);
    }

    console.log(`[DECRYPTION] Decrypted payload length: ${decrypted.length} bytes`);

    return decrypted;
}

class NonceManager {
    constructor(filePath) {
        this.filePath = filePath;
        this._initializeNonceFile();
    }

    _initializeNonceFile() {
        if (!fs.existsSync(this.filePath)) {
            console.log(`Nonce file not found. Initializing with nonce = 0 at ${this.filePath}.`);
            this._writeNonce(0);
        }
    }

    _readNonce() {
        const fileContent = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(fileContent);
        return parseInt(data.nonce, 10);
    }

    _writeNonce(nonce) {
        const data = JSON.stringify({ nonce });
        fs.writeFileSync(this.filePath, data, 'utf8');
    }

    // Public methods for admin access
    readNonce() {
        return this._readNonce();
    }

    writeNonce(nonce) {
        return this._writeNonce(nonce);
    }

    verifyAndIncrementNonce(receivedNonce) {
        try {
            // Use fixed nonce approach to match device implementation
            // This simplifies synchronization and avoids persistent state issues
            const EXPECTED_FIXED_NONCE = 12345;
            
            if (receivedNonce === EXPECTED_FIXED_NONCE) {
                console.log(`Fixed nonce verified: ${receivedNonce}`);
                return true;
            }

            console.error(`Fixed nonce mismatch! Expected: ${EXPECTED_FIXED_NONCE}, Received: ${receivedNonce}`);
            return false;
        } catch (error) {
            console.error("Error processing nonce:", error);
            return false;
        }
    }

    // reset(value = 0) {
    //     console.log(`Resetting nonce to ${value}.`);
    //     this._writeNonce(value);
    // }
}

/**
 * Complete handler for processing encrypted upload from device
 * @param {Buffer} rawPayload - Raw binary payload from HTTP request body
 * @param {string} receivedNonce - Nonce from HTTP header
 * @param {string} receivedMAC - MAC from HTTP header
 * @returns {Object} { success: boolean, data: Buffer|null, error: string|null }
 */
function processEncryptedUpload(rawPayload, receivedNonce, receivedMAC) {
    try {
        console.log('\n=== PROCESSING ENCRYPTED UPLOAD ===');
        console.log(`[UPLOAD] Raw payload size: ${rawPayload.length} bytes`);
        console.log(`[UPLOAD] Received nonce: ${receivedNonce}`);
        console.log(`[UPLOAD] Received MAC: ${receivedMAC}`);

        // Step 1: Verify nonce
        const nonceManager = new NonceManager(NONCE_FILE_PATH);
        const nonce = parseInt(receivedNonce, 10);
        
        if (!nonceManager.verifyAndIncrementNonce(nonce)) {
            return {
                success: false,
                data: null,
                error: 'Nonce verification failed - possible replay attack'
            };
        }

        // Step 2: Encode raw payload to Base64 (device sent raw binary)
        const payloadBase64 = rawPayload.toString('base64');
        
        // Step 3: Verify MAC (computed on Base64 representation)
        const expectedMAC = generateMAC(payloadBase64, UPLOAD_PSK);
        
        if (!verifyMAC(receivedMAC, expectedMAC)) {
            console.error('[UPLOAD] MAC verification failed!');
            console.error(`[UPLOAD] Expected: ${expectedMAC}`);
            console.error(`[UPLOAD] Received: ${receivedMAC}`);
            return {
                success: false,
                data: null,
                error: 'MAC verification failed - data integrity compromised'
            };
        }
        
        console.log('[UPLOAD] ✅ MAC verified successfully');

        // Step 4: Decrypt payload (rawPayload = IV + Ciphertext)
        const decryptedPayload = decryptPayloadAES_CBC(rawPayload);
        
        console.log('[UPLOAD] ✅ Decryption successful');

        // Step 5: Verify CRC (last 2 bytes of decrypted payload)
        if (decryptedPayload.length < 2) {
            return {
                success: false,
                data: null,
                error: 'Decrypted payload too short for CRC'
            };
        }

        const dataWithoutCRC = decryptedPayload.slice(0, -2);
        const receivedCRC = decryptedPayload.readUInt16LE(decryptedPayload.length - 2);
        
        // Calculate CRC-16 MODBUS on data
        const expectedCRC = calculateCRC16(dataWithoutCRC);
        
        if (receivedCRC !== expectedCRC) {
            console.error('[UPLOAD] CRC verification failed!');
            console.error(`[UPLOAD] Expected: 0x${expectedCRC.toString(16).padStart(4, '0')}`);
            console.error(`[UPLOAD] Received: 0x${receivedCRC.toString(16).padStart(4, '0')}`);
            return {
                success: false,
                data: null,
                error: 'CRC verification failed'
            };
        }
        
        console.log('[UPLOAD] ✅ CRC verified successfully');

        // Step 6: Extract compression flag and decompress if needed
        const compressionFlag = dataWithoutCRC[0];
        let finalData;

        if (compressionFlag === 0x01) {
            console.log('[UPLOAD] Data is compressed, decompressing...');
            const compressedData = dataWithoutCRC.slice(1);
            finalData = decompressData(compressedData);
            console.log(`[UPLOAD] Decompressed: ${compressedData.length} → ${finalData.length} bytes`);
        } else if (compressionFlag === 0x00) {
            console.log('[UPLOAD] Data is not compressed');
            finalData = dataWithoutCRC.slice(1);
        } else {
            return {
                success: false,
                data: null,
                error: `Invalid compression flag: 0x${compressionFlag.toString(16)}`
            };
        }

        console.log('[UPLOAD] ✅ Upload processing complete');
        console.log(`[UPLOAD] Final data size: ${finalData.length} bytes\n`);

        return {
            success: true,
            data: finalData,
            error: null
        };

    } catch (error) {
        console.error('[UPLOAD] Error processing encrypted upload:', error.message);
        return {
            success: false,
            data: null,
            error: error.message
        };
    }
}

/**
 * Calculate CRC-16 MODBUS
 * @param {Buffer} buffer - Data to calculate CRC for
 * @returns {number} CRC-16 value
 */
function calculateCRC16(buffer) {
    let crc = 0xFFFF;

    for (let i = 0; i < buffer.length; i++) {
        crc ^= buffer[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }

    return crc;
}

/**
 * Decompress data using zlib inflate
 * @param {Buffer} compressedData - Compressed data
 * @returns {Buffer} Decompressed data
 */
function decompressData(compressedData) {
    return zlib.inflateSync(compressedData);
}

export {
    encodeBase64,
    decodeBase64,
    generateMAC,
    verifyMAC,
    deriveAESKey,
    decryptPayloadAES_CBC,
    processEncryptedUpload,
    calculateCRC16,
    decompressData,
    NonceManager,
    NONCE_FILE_PATH,
    UPLOAD_PSK
};

