import Link from "next/link";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <div className="text-center sm:text-left">
          <h1 className="text-4xl font-bold mb-4">EcoWatt Cloud Platform</h1>
          <p className="text-lg text-gray-600 mb-8">
            IoT data collection and visualization for EcoWatt energy monitoring devices
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
          <h2 className="text-xl font-semibold mb-4">API Endpoints</h2>
          <div className="space-y-2 text-sm">
            <div>
              <strong>Upload Data:</strong> <code className="bg-gray-100 px-2 py-1 rounded">POST /api/upload</code>
            </div>
            <div className="text-gray-600">
              For EcoWatt devices to send compressed sensor data
            </div>
          </div>
        </div>

        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <Link
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-blue-600 text-white gap-2 hover:bg-blue-700 font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto"
            href="/data"
          >
            📊 View Data Dashboard
          </Link>
          <a
            className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-auto"
            href="https://github.com/Abithan07/EcoWatt-Device"
            target="_blank"
            rel="noopener noreferrer"
          >
            📁 View Repository
          </a>
        </div>
      </main>
      
    </div>
  );
}
