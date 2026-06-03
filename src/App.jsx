import React, { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import { parseCSV, parseCsvText } from './utils/csvProcessor';
import { Package, Download, Upload, Clock } from 'lucide-react';

const STORAGE_CSV  = 'lastCsvText';
const STORAGE_META = 'lastCsvMeta';

function formatDate(isoString) {
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return isoString; }
}

function App() {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [savedMeta, setSavedMeta] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_META) || 'null'); }
    catch { return null; }
  });

  // ── Save CSV text + meta to localStorage ───────────────────────────────────
  const persistCsv = (text, name) => {
    const meta = { name, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_CSV,  text);
    localStorage.setItem(STORAGE_META, JSON.stringify(meta));
    setSavedMeta(meta);
  };

  // ── Upload a new CSV file ──────────────────────────────────────────────────
  const handleFileUpload = async (file) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv')) {
      setError(name.endsWith('.zip')
        ? 'That looks like a ZIP file. Open the Files app, tap the ZIP to unzip it, then upload the CSV file inside.'
        : `Unexpected file type: "${file.name}". Please upload the CSV packing list.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });
      const parsedData = await parseCsvText(text);
      if (!parsedData?.length) {
        setError('The file appears to be empty or not a valid packing list CSV.');
        return;
      }
      persistCsv(text, file.name);
      setData(parsedData);
    } catch (err) {
      setError('Failed to parse CSV file. Please check the format.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Resume last saved session ──────────────────────────────────────────────
  const handleResume = async () => {
    setLoading(true);
    setError(null);
    try {
      const text = localStorage.getItem(STORAGE_CSV);
      if (!text) throw new Error('No saved data found.');
      const parsedData = await parseCsvText(text);
      if (!parsedData?.length) throw new Error('Saved data appears empty.');
      setData(parsedData);
    } catch (err) {
      setError(err.message || 'Could not load saved data. Please upload a new CSV.');
      setSavedMeta(null);
      localStorage.removeItem(STORAGE_CSV);
      localStorage.removeItem(STORAGE_META);
    } finally {
      setLoading(false);
    }
  };

  // ── Save session file (for cross-device transfer) ─────────────────────────
  const handleSaveSession = () => {
    const text = localStorage.getItem(STORAGE_CSV);
    if (!text) return;
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = savedMeta?.name || 'delivery-session.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => { setData(null); setError(null); };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 p-2 rounded-lg text-white">
                <Package size={22} />
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                Delivery Coordinator
              </h1>
            </div>

            {/* Save session button — shown when data is loaded */}
            {data && savedMeta && (
              <button
                onClick={handleSaveSession}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors print:hidden"
                title="Download session file to transfer to another device"
              >
                <Download size={14} />
                Save Session
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-grow py-10 px-4 sm:px-6 lg:px-8 print:p-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
            <p className="text-gray-500">Processing file…</p>
          </div>
        ) : !data ? (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-3">Upload Delivery Schedule</h2>
              <p className="text-gray-500">Upload your Barn2Door packing list CSV to generate labels and plan routes.</p>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Resume last session */}
            {savedMeta && (
              <div className="bg-white border border-blue-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div>
                  <div className="flex items-center gap-2 text-blue-700 font-semibold mb-0.5">
                    <Clock size={16} />
                    Resume last session
                  </div>
                  <div className="text-sm text-gray-600">{savedMeta.name}</div>
                  <div className="text-xs text-gray-400">Saved {formatDate(savedMeta.savedAt)}</div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={handleResume}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Resume
                  </button>
                  <button
                    onClick={() => { setSavedMeta(null); localStorage.removeItem(STORAGE_CSV); localStorage.removeItem(STORAGE_META); }}
                    className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Load session file (cross-device) */}
            <div className="relative">
              {savedMeta && (
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-medium">or upload a new file</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}
              <FileUpload onFileUpload={handleFileUpload} />
            </div>

            {/* Cross-device hint */}
            <p className="text-center text-xs text-gray-400">
              On another device? Use <strong>Save Session</strong> (navbar) on this device to download a file,
              then upload it here.
            </p>
          </div>
        ) : (
          <Dashboard data={data} onReset={handleReset} />
        )}
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto py-6 print:hidden">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} Delivery Coordinator
        </div>
      </footer>
    </div>
  );
}

export default App;
