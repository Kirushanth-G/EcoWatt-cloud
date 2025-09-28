"use client";
import { useEffect, useState } from "react";

export default function DataPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/data');
        const result = await response.json();
        
        if (!response.ok || !result.success) {
          setError(result.error || result.message || 'Failed to fetch data');
          return;
        }
        
        setRows(result.data || []);
        console.log(`Loaded ${result.count} records from database`);
        
      } catch (err) {
        console.error("Fetch error:", err);
        setError(`Network error: ${err.message}. Unable to connect to the API.`);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);



  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading EcoWatt data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">Database Connection Issue</h2>
          <p className="text-yellow-700 mb-4">{error}</p>
          
          {error.includes("not configured") ? (
            <div className="bg-yellow-100 p-4 rounded border border-yellow-300">
              <h3 className="font-semibold text-yellow-800 mb-2">Setup Required:</h3>
              <p className="text-yellow-700 text-sm">
                The Supabase database connection is not configured. To view stored data:
              </p>
              <ol className="list-decimal list-inside text-yellow-700 text-sm mt-2 space-y-1">
                <li>Set up your environment variables in <code>.env</code></li>
                <li>Make sure <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are set</li>
                <li>Restart the development server</li>
              </ol>
            </div>
          ) : (
            <div className="bg-yellow-100 p-4 rounded border border-yellow-300">
              <h3 className="font-semibold text-yellow-800 mb-2">Troubleshooting:</h3>
              <ul className="list-disc list-inside text-yellow-700 text-sm space-y-1">
                <li>Check your internet connection</li>
                <li>Verify Supabase service is accessible</li>
                <li>Check if environment variables are correctly set</li>
                <li>Try refreshing the page</li>
              </ul>
            </div>
          )}
          
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">EcoWatt Data Dashboard</h1>
        <p className="text-gray-600">
          Total uploads: {rows.length} | Last updated: {new Date().toLocaleString()}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-gray-500 text-lg">No sensor data available</div>
          <div className="text-gray-400 text-sm mt-2">
            Waiting for EcoWatt devices to send data...
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white shadow-lg rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phase Voltage (V)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phase Current (A)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Frequency (Hz)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PV1 Voltage (V)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PV1 Current (A)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PV2 Voltage (V)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PV2 Current (A)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Temperature (°C)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Export Power (W)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Output Power (W)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map((row, index) => (
                <tr key={row.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.vac1 !== null ? `${(row.vac1 / 10).toFixed(1)}` : "N/A"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.iac1 !== null ? `${(row.iac1 / 10).toFixed(1)}` : "N/A"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.fac1 !== null ? `${(row.fac1 / 100).toFixed(2)}` : "N/A"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.vpv1 !== null ? `${(row.vpv1 / 10).toFixed(1)}` : "N/A"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.ipv1 !== null ? `${(row.ipv1 / 10).toFixed(1)}` : "N/A"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.vpv2 !== null ? `${(row.vpv2 / 10).toFixed(1)}` : "N/A"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.ipv2 !== null ? `${(row.ipv2 / 10).toFixed(1)}` : "N/A"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.temperature !== null ? `${(row.temperature / 10).toFixed(1)}` : "N/A"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.export_power !== null ? `${row.export_power}` : "N/A"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                    {row.output_power !== null ? `${row.output_power}` : "N/A"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 text-center">
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
}