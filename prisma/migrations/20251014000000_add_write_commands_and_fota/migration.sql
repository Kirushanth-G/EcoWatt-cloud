-- Create write_commands table
CREATE TABLE IF NOT EXISTS write_commands (
  id BIGSERIAL PRIMARY KEY,
  value INTEGER NOT NULL CHECK (value >= 0 AND value <= 100),
  status TEXT NOT NULL DEFAULT 'PENDING',
  device_response JSONB,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create fota_updates table
CREATE TABLE IF NOT EXISTS fota_updates (
  id BIGSERIAL PRIMARY KEY,
  firmware_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  device_response JSONB,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_write_commands_status ON write_commands(status);
CREATE INDEX IF NOT EXISTS idx_write_commands_created_at ON write_commands(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fota_updates_status ON fota_updates(status);
CREATE INDEX IF NOT EXISTS idx_fota_updates_created_at ON fota_updates(created_at DESC);
