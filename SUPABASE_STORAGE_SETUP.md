# Supabase Storage Setup for FOTA Firmware

## Required for Vercel Deployment

Since Vercel serverless functions don't have persistent file systems, firmware files must be stored in Supabase Storage.

## Setup Steps

### 1. Create Storage Bucket

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Storage** in the left sidebar
4. Click **New Bucket**
5. Configure the bucket:
   - **Name**: `firmware`
   - **Public bucket**: ✅ Check this (files need to be downloadable by ESP32)
   - Click **Create bucket**

### 2. Configure Bucket Policies (Optional)

If you want to restrict uploads to only authenticated API calls:

1. Click on the `firmware` bucket
2. Go to **Policies** tab
3. Add custom policies as needed

### 3. Verify Environment Variables

Make sure these are set in your Vercel environment:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## How It Works

### On Localhost (Development)
- Firmware files are saved to `/uploads/firmware.bin` (local file system)
- Downloads read from local file system

### On Vercel (Production)
- Firmware files are uploaded to Supabase Storage bucket `firmware`
- Downloads fetch from Supabase Storage
- Supports HTTP range requests for chunked downloads

## API Endpoints

### Upload Firmware
```bash
POST /api/fota/upload
Content-Type: multipart/form-data

# Automatically detects environment and uses appropriate storage
```

### Download Firmware
```bash
GET /api/fota/download
# Supports Range header for chunked downloads
# Automatically fetches from Supabase on Vercel, local FS on localhost
```

### Get Manifest
```bash
GET /api/fota/manifest
# Returns firmware metadata and download URL
# Verifies file exists in appropriate storage
```

## Testing

1. **Test Upload**:
   - Navigate to `/fota` in your deployed Vercel app
   - Upload a `.bin` firmware file
   - Check Supabase Storage dashboard to verify file appears

2. **Test Download**:
   - After upload, the manifest endpoint should return the download URL
   - ESP32 devices will use this URL to download firmware

## Troubleshooting

### Upload fails on Vercel
- Verify Supabase credentials in Vercel environment variables
- Check the `firmware` bucket exists and is public
- Check Vercel function logs for errors

### Download returns 404
- Verify firmware file exists in Supabase Storage
- Check bucket permissions (should be public for reads)
- Test the download endpoint directly: `https://your-app.vercel.app/api/fota/download`
