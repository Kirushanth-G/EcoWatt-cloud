# API Cleanup Analysis

## Current Flow (Based on Your System)

### ESP32 → Cloud Communication
1. **ESP32 uploads data**: `POST /api/cloud/write`
   - Handles encrypted/plain binary uploads
   - Decrypts, validates, stores sensor data
   - Responds with unified JSON containing:
     - Configuration updates (from database)
     - Write commands (from database)
     - FOTA manifest (from database)

### Web Interface → API Calls
2. **Data Dashboard**: `GET /api/data`
   - Fetches sensor readings from database
   
3. **Config Page**: 
   - `POST /api/device/config` - Send config to device
   - `POST /api/device/write-command` - Send write command
   - `GET /api/device/config/logs` - View config logs
   
4. **FOTA Page**:
   - `POST /api/fota/upload` - Upload firmware
   - `GET /api/fota/current` - Get current firmware info
   - `GET /api/fota/history` - Get update history
   - `GET /api/fota/download` - ESP32 downloads firmware (called by cloud/write response)
   - `POST /api/fota/log` - ESP32 sends FOTA logs

---

## ✅ USED Endpoints (Keep These)

### Core Communication
- `/api/cloud/write/route.js` - **Main ESP32 endpoint** (unified response)
- `/api/cloud/write/encryptionAndSecurity.js` - Encryption module
- `/api/cloud/write/nonce.json` - Nonce tracking

### Data Display
- `/api/data/route.js` - Dashboard data

### Configuration Management
- `/api/device/config/route.js` - Send config updates
- `/api/device/config/logs/route.js` - Config logs
- `/api/device/write-command/route.js` - Write commands

### FOTA System
- `/api/fota/upload/route.js` - Upload firmware (web interface)
- `/api/fota/download/route.js` - Download firmware (ESP32)
- `/api/fota/current/route.js` - Current firmware info (web interface)
- `/api/fota/history/route.js` - Update history (web interface)
- `/api/fota/log/route.js` - FOTA logs from ESP32

---

## ❌ UNUSED Endpoints (Can Be Deleted)

### 1. `/api/config_ack/route.js`
**Why Remove?**
- Old acknowledgment system
- Now handled directly in `/api/cloud/write` unified response
- ESP32 no longer makes separate acknowledgment calls

### 2. `/api/fota/firmware/route.js`
**Why Remove?**
- Served hardcoded `public/firmware.bin`
- Replaced by `/api/fota/download` which serves from database
- Old system before simplified FOTA

### 3. `/api/fota/garbage_firmware/route.js`
**Why Remove?**
- Test endpoint for corrupted firmware
- Served hardcoded `public/garbage_firmware.bin`
- Not part of production flow
- Testing should be done with actual uploaded firmware

### 4. `/api/fota/guru_firmware/route.js`
**Why Remove?**
- Test endpoint for special firmware variant
- Served hardcoded `public/guru_firmware.bin`
- Not part of production flow
- Only one firmware type needed (uploaded via web interface)

### 5. `/api/fota/manifest/route.js`
**Why Remove?**
- Random firmware selector (randomly picked between normal/garbage/guru)
- Old system before database-driven FOTA
- Now manifest is generated in `/api/cloud/write` from database
- ESP32 no longer calls this endpoint separately

---

## Summary

### Keep (11 endpoints)
```
/api/cloud/write/
/api/data/
/api/device/config/
/api/device/config/logs/
/api/device/write-command/
/api/fota/upload/
/api/fota/download/
/api/fota/current/
/api/fota/history/
/api/fota/log/
```

### Delete (5 endpoints)
```
/api/config_ack/
/api/fota/firmware/
/api/fota/garbage_firmware/
/api/fota/guru_firmware/
/api/fota/manifest/
```

---

## Benefits of Cleanup

1. **Clearer Architecture** - Only one way to do things
2. **Easier Maintenance** - Fewer files to manage
3. **No Confusion** - Developers won't accidentally use old endpoints
4. **Smaller Deployment** - Less code to deploy to Vercel
5. **Better Performance** - Vercel builds faster with fewer routes

---

## Migration Notes

**No Breaking Changes** - The old endpoints were never called by:
- Current ESP32 firmware (uses unified `/api/cloud/write`)
- Current web interface (uses new FOTA system)

These endpoints are remnants from the old architecture before we:
- Unified the response system
- Moved to database-driven FOTA
- Implemented simplified single-firmware upload
