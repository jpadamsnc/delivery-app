import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Printer, AlertCircle, CheckCircle, Loader, Copy, ClipboardCheck, Truck } from 'lucide-react';
import { geocodeAddress, optimizeRoute, getRoutePolyline } from '../utils/routeService';
import RouteMap from './RouteMap';
import DriverView, { getDriverName } from './DriverView';

const DRIVER_COLORS = ['#2563EB', '#EA580C'];
const DEPOT_STORAGE_KEY = 'deliveryDepotAddress';

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDistance(meters) {
  return (meters / 1609.34).toFixed(1) + ' mi';
}

const RouteOptimizer = ({ labelData, onPrintLabels }) => {
  const [depotAddress, setDepotAddress] = useState(() => localStorage.getItem(DEPOT_STORAGE_KEY) || '');
  const [depotCoords, setDepotCoords] = useState(null);
  const [depotLabel, setDepotLabel] = useState('');
  const [numDrivers, setNumDrivers] = useState(1);
  const [copiedDriverId,   setCopiedDriverId]   = useState(null);
  const [activeDriverView, setActiveDriverView] = useState(null);
  const [driverNames,      setDriverNames]      = useState(() => {
    try { return JSON.parse(localStorage.getItem('deliveryDriverNames') || '[]'); }
    catch { return []; }
  });

  const updateDriverName = (vehicleId, name) => {
    setDriverNames(prev => {
      const next = [...prev];
      next[vehicleId - 1] = name;
      localStorage.setItem('deliveryDriverNames', JSON.stringify(next));
      return next;
    });
  };
  const [geocoding, setGeocoding] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState(null);
  const [routes, setRoutes] = useState(null);
  const [polylines, setPolylines] = useState(null);

  const handleSetDepot = async () => {
    if (!depotAddress.trim()) return;
    setGeocoding(true);
    setError(null);
    setDepotCoords(null);
    try {
      const coords = await geocodeAddress(depotAddress);
      setDepotCoords(coords);
      setDepotLabel(coords.label);
      localStorage.setItem(DEPOT_STORAGE_KEY, depotAddress);
    } catch (e) {
      setError(e.message);
    } finally {
      setGeocoding(false);
    }
  };

  const handleOptimize = async () => {
    if (!depotCoords || !labelData?.length) return;
    setOptimizing(true);
    setError(null);
    setRoutes(null);
    setPolylines(null);

    try {
      const result = await optimizeRoute(depotCoords, labelData, numDrivers);

      // Build processed routes
      const processed = result.routes.map((r) => {
        const jobSteps = r.steps.filter((s) => s.type === 'job');
        const stops = jobSteps
          .map((step) => ({
            order: labelData[step.id - 1],
            stopNum: step.arrival,
          }))
          .filter((stop) => stop.order != null);
        // ORS may return stats directly on the route or nested in summary
        const summary = r.summary ?? {
          duration: r.duration ?? 0,
          distance: r.distance ?? 0,
        };
        return {
          vehicleId: r.vehicle,
          stops,
          summary,
        };
      });

      setRoutes(processed);

      // Fetch road polylines for each route
      const polylineResults = await Promise.all(
        processed.map((route) => {
          const waypoints = [
            [depotCoords.lon, depotCoords.lat],
            ...route.stops.map((s) => [parseFloat(s.order.lon), parseFloat(s.order.lat)]),
            [depotCoords.lon, depotCoords.lat],
          ];
          return getRoutePolyline(waypoints);
        })
      );
      setPolylines(polylineResults);
    } catch (e) {
      setError(e.message);
    } finally {
      setOptimizing(false);
    }
  };

  const handleCopyRoute = (route) => {
    const stops = route.stops;

    // Google Maps URL — origin & destination = depot, waypoints = stops in order
    // GM supports up to 8 intermediate waypoints; if more, use the first 8
    const waypoints = stops
      .slice(0, 8)
      .map((s) => `${s.order.lat},${s.order.lon}`)
      .join('|');
    const mapsUrl =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${depotCoords.lat},${depotCoords.lon}` +
      `&destination=${depotCoords.lat},${depotCoords.lon}` +
      `&waypoints=${waypoints}` +
      `&travelmode=driving`;

    const stopLines = stops
      .map((s, idx) => `${idx + 1}. ${s.order.customerName} — ${s.order.street}, ${s.order.city}`)
      .join('\n');

    const message =
      `Driver ${route.vehicleId} — ${stops.length} stop${stops.length !== 1 ? 's' : ''}` +
      ` (${formatDistance(route.summary.distance)} / ${formatDuration(route.summary.duration)})\n\n` +
      `${stopLines}\n\n` +
      `Navigate all stops:\n${mapsUrl}`;

    navigator.clipboard.writeText(message).then(() => {
      setCopiedDriverId(route.vehicleId);
      setTimeout(() => setCopiedDriverId(null), 2500);
    });
  };

  const handlePrintDriver = (route) => {
    const ordered = route.stops.map((stop, idx) => ({
      ...stop.order,
      driverInfo: {
        driverNum: route.vehicleId,
        stopNum: idx + 1,
        totalStops: route.stops.length,
      },
    }));
    onPrintLabels(ordered);
  };

  const handlePrintAll = () => {
    if (!routes) return;
    const allLabels = routes.flatMap((route) =>
      route.stops.map((stop, idx) => ({
        ...stop.order,
        driverInfo: {
          driverNum: route.vehicleId,
          stopNum: idx + 1,
          totalStops: route.stops.length,
        },
      }))
    );
    onPrintLabels(allLabels);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Left panel: controls + stop lists */}
      <div className="w-full lg:w-96 flex-shrink-0 space-y-4 overflow-y-auto">

        {/* Depot setup */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <MapPin size={16} className="text-gray-500" />
            Start / End Depot
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={depotAddress}
              onChange={(e) => setDepotAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetDepot()}
              placeholder="123 Farm Rd, City, NC 27000"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <button
              onClick={handleSetDepot}
              disabled={!depotAddress.trim() || geocoding}
              className="px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {geocoding ? <Loader size={14} className="animate-spin" /> : 'Set'}
            </button>
          </div>
          {depotCoords && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-green-700">
              <CheckCircle size={13} className="mt-0.5 flex-shrink-0" />
              <span className="truncate">{depotLabel}</span>
            </div>
          )}
        </div>

        {/* Driver count */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Navigation size={16} className="text-gray-500" />
            Number of Drivers
          </h3>
          <div className="flex gap-2">
            {[1, 2].map((n) => (
              <button
                key={n}
                onClick={() => setNumDrivers(n)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                  numDrivers === n
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {n} Driver{n > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Optimize button */}
        <button
          onClick={handleOptimize}
          disabled={!depotCoords || !labelData?.length || optimizing}
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm transition-all"
        >
          {optimizing ? (
            <>
              <Loader size={18} className="animate-spin" />
              Optimizing…
            </>
          ) : (
            <>
              <Navigation size={18} />
              Optimize Route{numDrivers > 1 ? 's' : ''}
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Route results */}
        {routes && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-700">Optimized Routes</span>
              {routes.length > 1 && (
                <button
                  onClick={handlePrintAll}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
                >
                  <Printer size={13} />
                  Print All
                </button>
              )}
            </div>

            {routes.map((route) => {
              const color = DRIVER_COLORS[(route.vehicleId - 1) % DRIVER_COLORS.length];
              return (
                <div key={route.vehicleId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Driver header */}
                  <div
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderLeft: `4px solid ${color}` }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        value={driverNames[route.vehicleId - 1] || ''}
                        onChange={e => updateDriverName(route.vehicleId, e.target.value)}
                        placeholder={`Driver ${route.vehicleId} name`}
                        className="text-sm font-semibold bg-transparent border-b border-dashed focus:outline-none focus:border-solid w-28"
                        style={{ color, borderColor: color }}
                      />
                      <span className="text-gray-500 text-xs">
                        {route.stops.length} stops ·{' '}
                        {formatDistance(route.summary.distance)} ·{' '}
                        {formatDuration(route.summary.duration)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCopyRoute(route)}
                        className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg transition-all ${
                          copiedDriverId === route.vehicleId
                            ? 'border-green-400 bg-green-50 text-green-700'
                            : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                        }`}
                      >
                        {copiedDriverId === route.vehicleId
                          ? <><ClipboardCheck size={12} /> Copied!</>
                          : <><Copy size={12} /> Copy</>}
                      </button>
                      <button
                        onClick={() => handlePrintDriver(route)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                      >
                        <Printer size={12} />
                        Labels
                      </button>
                      <button
                        onClick={() => setActiveDriverView(route.vehicleId)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg text-white font-medium"
                        style={{ background: color, borderColor: color }}
                      >
                        <Truck size={12} />
                        Drive
                      </button>
                    </div>
                  </div>

                  {/* Stop list */}
                  <ol className="divide-y divide-gray-50">
                    {route.stops.map((stop, idx) => (
                      <li key={stop.order.orderId} className="flex items-start gap-2 px-4 py-2">
                        <span
                          className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                          style={{ background: color }}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-800 truncate">
                            {stop.order.customerName}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">
                            {stop.order.street}, {stop.order.city}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right panel: map */}
      <div className="flex-1" style={{ minHeight: '500px' }}>
        <RouteMap depot={depotCoords} routes={routes} polylines={polylines} />
      </div>

      {/* Driver view overlay */}
      {activeDriverView && routes && (() => {
        const route = routes.find(r => r.vehicleId === activeDriverView);
        const color = DRIVER_COLORS[(activeDriverView - 1) % DRIVER_COLORS.length];
        return route ? (
          <DriverView
            route={route}
            driverColor={color}
            onClose={() => setActiveDriverView(null)}
          />
        ) : null;
      })()}
    </div>
  );
};

export default RouteOptimizer;
