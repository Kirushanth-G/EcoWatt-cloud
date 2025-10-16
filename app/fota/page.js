'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function FotaPage() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [currentFirmware, setCurrentFirmware] = useState(null);
  const [history, setHistory] = useState([]);

  // Load current firmware info on mount
  useEffect(() => {
    fetchCurrentFirmware();
    fetchHistory();
  }, []);

  const fetchCurrentFirmware = async () => {
    try {
      const res = await fetch('/api/fota/current');
      if (res.ok) {
        const data = await res.json();
        setCurrentFirmware(data);
      }
    } catch (error) {
      console.error('Failed to fetch current firmware:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/fota/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.name.endsWith('.bin')) {
      setFile(selectedFile);
      setMessage('');
    } else {
      setFile(null);
      setMessage('Please select a .bin firmware file');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a firmware file');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('firmware', file);

      const res = await fetch('/api/fota/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(`✅ Firmware uploaded successfully! SHA-256: ${data.sha256.substring(0, 16)}...`);
        setFile(null);
        // Reset file input
        document.getElementById('firmware-input').value = '';
        // Refresh current firmware and history
        fetchCurrentFirmware();
        fetchHistory();
      } else {
        setMessage(`❌ Upload failed: ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Upload error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link href="/" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">FOTA Update</h1>
          <p className="text-gray-600 mt-2">Upload firmware for over-the-air updates</p>
        </div>

        {/* Current Firmware Info */}
        {currentFirmware && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Current Firmware</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Size:</span>
                <span className="ml-2 font-mono">{(currentFirmware.size / 1024).toFixed(2)} KB</span>
              </div>
              <div>
                <span className="text-gray-600">Uploaded:</span>
                <span className="ml-2">{new Date(currentFirmware.uploaded_at).toLocaleString()}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-600">SHA-256:</span>
                <span className="ml-2 font-mono text-xs break-all">{currentFirmware.sha256}</span>
              </div>
            </div>
          </div>
        )}

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Upload New Firmware</h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="firmware-input" className="block text-sm font-medium text-gray-700 mb-2">
                Select Firmware File (.bin)
              </label>
              <input
                id="firmware-input"
                type="file"
                accept=".bin"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
                disabled={uploading}
              />
              {file && (
                <p className="mt-2 text-sm text-gray-600">
                  Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className={`w-full py-2 px-4 rounded-lg font-medium ${
                !file || uploading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {uploading ? 'Uploading...' : 'Upload Firmware'}
            </button>

            {message && (
              <div className={`p-3 rounded-lg text-sm ${
                message.startsWith('✅') 
                  ? 'bg-green-50 text-green-800' 
                  : 'bg-red-50 text-red-800'
              }`}>
                {message}
              </div>
            )}
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">ℹ️ How it works:</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Upload a .bin firmware file</li>
              <li>Device will receive update notification on next data upload</li>
              <li>Device downloads firmware in chunks and verifies SHA-256</li>
              <li>Update logs are recorded for monitoring</li>
            </ul>
          </div>
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Update History</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">Size</th>
                    <th className="text-left py-2 px-3">SHA-256</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((update) => (
                    <tr key={update.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">
                        {new Date(update.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          update.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                          update.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                          update.status === 'SENDING' ? 'bg-blue-100 text-blue-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {update.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {(update.firmware_size / 1024).toFixed(2)} KB
                      </td>
                      <td className="py-2 px-3 font-mono text-xs">
                        {update.firmware_sha256.substring(0, 16)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
