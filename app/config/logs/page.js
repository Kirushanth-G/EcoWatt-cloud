"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function ConfigLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    device_id: '',
    limit: 20
  });
  const [summary, setSummary] = useState(null);

  const statusColors = {
    SUCCESS: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    TIMEOUT: 'bg-yellow-100 text-yellow-800',
    SENDING: 'bg-blue-100 text-blue-800'
  };

  useEffect(() => {
    fetchLogs();
  }, [filters]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.device_id) params.append('device_id', filters.device_id);
      params.append('limit', filters.limit.toString());

      const response = await fetch(`/api/device/config/logs?${params}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || result.message || 'Failed to fetch logs');
        return;
      }

      setLogs(result.data || []);
      setSummary(result.summary || null);
      console.log(`Loaded ${result.data?.length || 0} configuration logs`);

    } catch (err) {
      console.error("Fetch error:", err);
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const formatDuration = (duration) => {
    if (!duration) return 'N/A';
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  const formatConfigSent = (configSent) => {
    if (!configSent?.config_update) return 'Invalid format';
    
    const { sampling_interval, registers } = configSent.config_update;
    const parts = [];
    
    if (sampling_interval !== undefined) {
      parts.push(`Interval: ${sampling_interval}s`);
    }
    if (registers && registers.length > 0) {
      parts.push(`Registers: ${registers.join(', ')}`);
    }
    
    return parts.join(' | ') || 'No parameters';
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading configuration logs...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Logs</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <button 
            onClick={() => fetchLogs()} 
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900">Configuration Logs</h1>
          <div className="flex gap-4">
            <Link
              href="/config"
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Back to Configuration
            </Link>
            <Link
              href="/"
              className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Home
            </Link>
          </div>
        </div>
        <p className="text-gray-600">
          View and filter configuration change history and device responses
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="text-2xl font-bold text-gray-900">{summary.total_records}</div>
            <div className="text-sm text-gray-600">Total Configurations</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="text-2xl font-bold text-green-600">
              {summary.status_breakdown.SUCCESS || 0}
            </div>
            <div className="text-sm text-gray-600">Successful</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="text-2xl font-bold text-blue-600">{summary.recent_activity.last_24h}</div>
            <div className="text-sm text-gray-600">Last 24 Hours</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="text-2xl font-bold text-purple-600">{summary.recent_activity.last_week}</div>
            <div className="text-sm text-gray-600">Last Week</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white shadow-lg rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
              <option value="TIMEOUT">Timeout</option>
              <option value="SENDING">Sending</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Device ID</label>
            <input
              type="text"
              value={filters.device_id}
              onChange={(e) => handleFilterChange('device_id', e.target.value)}
              placeholder="Filter by device ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Limit</label>
            <select
              value={filters.limit}
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={10}>10 records</option>
              <option value={20}>20 records</option>
              <option value={50}>50 records</option>
              <option value={100}>100 records</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => setFilters({ status: '', device_id: '', limit: 20 })}
              className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-gray-500 text-lg">No configuration logs found</div>
          <div className="text-gray-400 text-sm mt-2">
            {filters.status || filters.device_id 
              ? "Try adjusting your filters or clearing them"
              : "Configuration logs will appear here after device configurations are sent"}
          </div>
        </div>
      ) : (
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Device ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Configuration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Device Response
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log, index) => (
                  <tr key={log.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.device_id || 'N/A'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900 max-w-xs">
                      <div className="truncate" title={formatConfigSent(log.config_sent)}>
                        {formatConfigSent(log.config_sent)}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        statusColors[log.status] || 'bg-gray-100 text-gray-800'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDuration(log.duration)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900 max-w-xs">
                      {log.device_response?.config_ack ? (
                        <div className="space-y-1">
                          {log.device_response.config_ack.accepted?.length > 0 && (
                            <div className="text-xs">
                              <span className="font-medium text-green-700">✓ </span>
                              {log.device_response.config_ack.accepted.join(', ')}
                            </div>
                          )}
                          {log.device_response.config_ack.rejected?.length > 0 && (
                            <div className="text-xs">
                              <span className="font-medium text-red-700">✗ </span>
                              {log.device_response.config_ack.rejected.join(', ')}
                            </div>
                          )}
                          {log.device_response.config_ack.unchanged?.length > 0 && (
                            <div className="text-xs">
                              <span className="font-medium text-gray-700">~ </span>
                              {log.device_response.config_ack.unchanged.join(', ')}
                            </div>
                          )}
                        </div>
                      ) : log.error_message ? (
                        <div className="text-xs text-red-600" title={log.error_message}>
                          {log.error_message.length > 50 
                            ? `${log.error_message.substring(0, 50)}...` 
                            : log.error_message}
                        </div>
                      ) : (
                        <span className="text-gray-400">No response</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Refresh Button */}
      <div className="mt-6 text-center">
        <button
          onClick={() => fetchLogs()}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          Refresh Logs
        </button>
      </div>

      {/* Status Legend */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Status Legend</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
              SUCCESS
            </span>
            <span className="text-gray-600">Device accepted configuration</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
              FAILED
            </span>
            <span className="text-gray-600">Device rejected or error occurred</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
              TIMEOUT
            </span>
            <span className="text-gray-600">Device did not respond in time</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
              SENDING
            </span>
            <span className="text-gray-600">Configuration being sent</span>
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-2">Device Response Symbols:</h4>
          <div className="flex space-x-6 text-sm">
            <div className="flex items-center space-x-1">
              <span className="font-medium text-green-700">✓</span>
              <span className="text-gray-600">Accepted</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="font-medium text-red-700">✗</span>
              <span className="text-gray-600">Rejected</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="font-medium text-gray-700">~</span>
              <span className="text-gray-600">Unchanged</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}