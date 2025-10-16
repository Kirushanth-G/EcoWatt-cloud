import Link from "next/link";

export default function Home() {
  return (
    <div className="font-sans flex items-center justify-center min-h-screen p-8">
      <main className="flex flex-col items-center text-center max-w-2xl">
        <div className="mb-12">
          <h1 className="text-6xl font-bold mb-6 animate-pulse">
            EcoWatt Cloud Platform
          </h1>
          <p className="text-xl text-gray-600 leading-relaxed">
            IoT data collection and visualization for EcoWatt energy monitoring devices
          </p>
        </div>

        <div className="flex gap-6 flex-col sm:flex-row">
          <Link
            className="rounded-lg border border-solid border-transparent transition-colors flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 font-medium text-lg h-14 px-8"
            href="/data"
          >
            View Data Dashboard
          </Link>
          <Link
            className="rounded-lg border border-solid border-gray-300 transition-colors flex items-center justify-center hover:bg-gray-100 font-medium text-lg h-14 px-8"
            href="/config"
          >
            Change Configurations
          </Link>
          <Link
            className="rounded-lg border border-solid border-transparent transition-colors flex items-center justify-center bg-green-600 text-white hover:bg-green-700 font-medium text-lg h-14 px-8"
            href="/fota"
          >
            FOTA Update
          </Link>
        </div>
      </main>
    </div>
  );
}
