"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function ConfigPage() {
  const [config, setConfig] = useState({
    sampling_interval: 10,
    upload_interval: 20,
    registers: []
  });
  const [writeCommand, setWriteCommand] = useState({ value: 50 });
  const [latestConfig, setLatestConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingCommand, setSendingCommand] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [commandSuccess, setCommandSuccess] = useState(null);

  // Available registers with descriptions
  const availableRegisters = [
    { id: "vac1", label: "AC Voltage L1 (V)", description: "L1 Phase voltage" },
    { id: "iac1", label: "AC Current L1 (A)", description: "L1 Phase current" },
    { id: "fac1", label: "AC Frequency L1 (Hz)", description: "L1 Phase frequency" },
    { id: "vpv1", label: "PV1 Voltage (V)", description: "PV1 input voltage" },
    { id: "vpv2", label: "PV2 Voltage (V)", description: "PV2 input voltage" },
    { id: "ipv1", label: "PV1 Current (A)", description: "PV1 input current" },
    { id: "ipv2", label: "PV2 Current (A)", description: "PV2 input current" },
    { id: "temperature", label: "Temperature (°C)", description: "Inverter internal temperature" },
    { id: "export_power", label: "Export Power (%)", description: "Export power percentage" },
    { id: "output_power", label: "Output Power (W)", description: "Inverter output power" }
  ];

  // Fetch latest configuration from logs
  useEffect(() => {
    async function fetchLatestConfig() {
      try {
        setLoading(true);
        const response = await fetch('/api/device/config/logs?limit=1&status=SUCCESS');
        const result = await response.json();
        
        if (response.ok && result.success && result.data.length > 0) {
          const latest = result.data[0];
          setLatestConfig(latest);
          
          // Set current config from latest successful configuration
          if (latest.config_sent?.config_update) {
            setConfig({
              sampling_interval: latest.config_sent.config_update.sampling_interval || 10,
              upload_interval: latest.config_sent.config_update.upload_interval || 20,
              registers: latest.config_sent.config_update.registers || []
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch latest config:", err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchLatestConfig();
  }, [success]); // Refresh when configuration is successfully updated

  const handleRegisterChange = (registerId, checked) => {
    setConfig(prev => ({
      ...prev,
      registers: checked 
        ? [...prev.registers, registerId]
        : prev.registers.filter(id => id !== registerId)
    }));
  };

  const handleSamplingIntervalChange = (value) => {
    setConfig(prev => ({
      ...prev,
      sampling_interval: parseInt(value) || 1
    }));
  };

  const handleUploadIntervalChange = (value) => {
    setConfig(prev => ({
      ...prev,
      upload_interval: parseInt(value) || 1
    }));
  };

  const handleWriteCommandChange = (value) => {
    const numValue = parseInt(value) || 0;
    setWriteCommand({ value: Math.max(0, Math.min(100, numValue)) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        config_update: config
      };

      const response = await fetch('/api/device/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': 'ecowatt_dashboard'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSuccess({
          message: "Configuration sent successfully!",
          device_response: result.device_response,
          log_id: result.log_id
        });
      } else {
        setError(result.error || "Failed to send configuration");
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSendWriteCommand = async (e) => {
    e.preventDefault();
    setSendingCommand(true);
    setCommandSuccess(null);
    setError(null);

    try {
      const response = await fetch('/api/device/write-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: writeCommand.value })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setCommandSuccess("Write command queued successfully!");
      } else {
        setError(result.error || "Failed to send write command");
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setSendingCommand(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading configuration...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900">Device Configuration</h1>
          <div className="flex gap-4">
            <Link
              href="/config/logs"
              className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              View Configuration Logs
            </Link>
            <Link
              href="/"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
        <p className="text-gray-600">
          Configure your EcoWatt device sampling interval and register monitoring
        </p>
      </div>

      {/* Latest Configuration Info */}
      {latestConfig && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">Latest Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-blue-700">Last Updated:</span>
              <span className="ml-2 text-blue-600">
                {new Date(latestConfig.created_at).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="font-medium text-blue-700">Status:</span>
              <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                latestConfig.status === 'SUCCESS' 
                  ? 'bg-green-100 text-green-800' 
                  : latestConfig.status === 'FAILED'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {latestConfig.status}
              </span>
            </div>
          </div>
          {latestConfig.device_response?.config_ack && (
            <div className="mt-4 p-3 bg-white rounded border">
              <div className="text-sm font-medium text-gray-700 mb-2">Device Response:</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="font-medium text-green-700">Accepted:</span>
                  <div className="text-green-600">
                    {latestConfig.device_response.config_ack.accepted?.join(", ") || "None"}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-red-700">Rejected:</span>
                  <div className="text-red-600">
                    {latestConfig.device_response.config_ack.rejected?.join(", ") || "None"}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Unchanged:</span>
                  <div className="text-gray-600">
                    {latestConfig.device_response.config_ack.unchanged?.join(", ") || "None"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <h3 className="text-green-800 font-semibold mb-2">{success.message}</h3>
          {success.device_response?.config_ack && (
            <div className="text-sm text-green-700">
              <div>Accepted: {success.device_response.config_ack.accepted?.join(", ") || "None"}</div>
              <div>Rejected: {success.device_response.config_ack.rejected?.join(", ") || "None"}</div>
              <div>Unchanged: {success.device_response.config_ack.unchanged?.join(", ") || "None"}</div>
            </div>
          )}
          <div className="text-xs text-green-600 mt-2">Log ID: {success.log_id}</div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="text-red-800 font-semibold mb-2">Configuration Error</h3>
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Configuration Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Sampling Interval */}
        <div className="bg-white shadow-lg rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Timing Configuration</h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sampling Interval (seconds)
              </label>
              <input
                type="number"
                min="1"
                max="3600"
                value={config.sampling_interval}
                onChange={(e) => handleSamplingIntervalChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter sampling interval (1-3600)"
              />
              <p className="text-sm text-gray-500 mt-1">
                How often the device should sample sensor data (1-3600 seconds)
              </p>
            </div>
            
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <button
                type="button"
                onClick={() => handleSamplingIntervalChange(5)}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
              >
                5s (High frequency)
              </button>
              <button
                type="button"
                onClick={() => handleSamplingIntervalChange(10)}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
              >
                10s (Normal)
              </button>
              <button
                type="button"
                onClick={() => handleSamplingIntervalChange(30)}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
              >
                30s (Low frequency)
              </button>
            </div>

            {/* Upload Interval */}
            <div className="pt-4 border-t">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Interval (seconds)
              </label>
              <input
                type="number"
                min="1"
                max="3600"
                value={config.upload_interval}
                onChange={(e) => handleUploadIntervalChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter upload interval (1-3600)"
              />
              <p className="text-sm text-gray-500 mt-1">
                How often the device should upload collected data to cloud (1-3600 seconds)
              </p>
            </div>

            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <button
                type="button"
                onClick={() => handleUploadIntervalChange(10)}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
              >
                10s (Frequent)
              </button>
              <button
                type="button"
                onClick={() => handleUploadIntervalChange(20)}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
              >
                20s (Normal)
              </button>
              <button
                type="button"
                onClick={() => handleUploadIntervalChange(60)}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
              >
                60s (Infrequent)
              </button>
            </div>
          </div>
        </div>

        {/* Register Selection */}
        <div className="bg-white shadow-lg rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Register Selection</h2>
          <p className="text-sm text-gray-600 mb-4">
            Select which sensor registers to monitor (at least one required)
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableRegisters.map((register) => (
              <div key={register.id} className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                <input
                  type="checkbox"
                  id={register.id}
                  checked={config.registers.includes(register.id)}
                  onChange={(e) => handleRegisterChange(register.id, e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <div className="flex-1">
                  <label htmlFor={register.id} className="text-sm font-medium text-gray-900 cursor-pointer">
                    {register.label}
                  </label>
                  <p className="text-xs text-gray-500">{register.description}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Selected: {config.registers.length} register{config.registers.length !== 1 ? 's' : ''}
            </div>
            <div className="space-x-2">
              <button
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, registers: [] }))}
                className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setConfig(prev => ({ 
                  ...prev, 
                  registers: availableRegisters.map(r => r.id) 
                }))}
                className="text-sm px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
              >
                Select All
              </button>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-center">
          <button
            type="submit"
            disabled={saving || config.registers.length === 0}
            className={`px-8 py-3 rounded-lg font-medium text-lg transition-colors ${
              saving || config.registers.length === 0
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {saving ? 'Sending Configuration...' : 'Send Configuration to Device'}
          </button>
        </div>
        
        {config.registers.length === 0 && (
          <p className="text-center text-sm text-red-600">
            Please select at least one register to monitor
          </p>
        )}
      </form>

      {/* Write Command Section */}
      <div className="mt-8 bg-white shadow-lg rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Write Command</h2>
        <p className="text-sm text-gray-600 mb-4">
          Send a write command to register 8 (value: 0-100)
        </p>

        {/* Command Success Message */}
        {commandSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <p className="text-green-800 font-semibold">{commandSuccess}</p>
          </div>
        )}

        <form onSubmit={handleSendWriteCommand} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Value (0-100)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={writeCommand.value}
              onChange={(e) => handleWriteCommandChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter value (0-100)"
            />
            <p className="text-sm text-gray-500 mt-1">
              Write a value between 0 and 100 to register 8
            </p>
          </div>

          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <button
              type="button"
              onClick={() => handleWriteCommandChange(0)}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
            >
              0 (Min)
            </button>
            <button
              type="button"
              onClick={() => handleWriteCommandChange(50)}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
            >
              50 (Mid)
            </button>
            <button
              type="button"
              onClick={() => handleWriteCommandChange(100)}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded"
            >
              100 (Max)
            </button>
          </div>

          <div className="flex justify-center pt-2">
            <button
              type="submit"
              disabled={sendingCommand}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                sendingCommand
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              {sendingCommand ? 'Sending Command...' : 'Send Write Command'}
            </button>
          </div>

          {/* Command Preview */}
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded p-3">
            <p className="text-xs font-medium text-gray-700 mb-1">Command Preview:</p>
            <pre className="text-xs text-gray-600">
{JSON.stringify({
  action: "write_register",
  target_register: "8",
  value: writeCommand.value
}, null, 2)}
            </pre>
          </div>
        </form>
      </div>

      {/* Configuration Preview */}
      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Configuration Preview</h3>
        <pre className="bg-white p-4 rounded border text-sm overflow-x-auto">
{JSON.stringify({
  config_update: config
}, null, 2)}
        </pre>
      </div>
    </div>
  );
}