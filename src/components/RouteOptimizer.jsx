import React, { useState } from 'react';
import {
  MapPin, Navigation, Printer, AlertCircle, CheckCircle,
  Loader, Copy, ClipboardCheck, Truck, Share2, ArrowRight, RefreshCw,
  PlusCircle, Trash2,
} from 'lucide-react';
import { geocodeAddress, autocompleteAddress, geocodeCensus, optimizeRoute, getRoutePolyline } from '../utils/routeService';
import { encodeDriverLink } from '../utils/driverLink';
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
  const [depotAddress,     setDepotAddress]     = useState(() => localStorage.getItem(DEPOT_STORAGE_KEY) || '');
  const [depotCoords,      setDepotCoords]      = useState(null);
  const [depotLabel,       setDepotLabel]       = useState('');
  const [numDrivers,       setNumDrivers]       = useState(1);
  const [geocoding,        setGeocoding]        = useState(false);
  const [optimizing,       setOptimizing]       = useState(false);
  const [reoptimizing,     setReoptimizing]     = useState(false);
  const [error,            setError]            = useState(null);
  const [routes,           setRoutes]           = useState(null);   // drives the map
  const [editedRoutes,     setEditedRoutes]     = useState(null);   // drives the stop list UI
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);
  const [polylines,        setPolylines]        = useState(null);
  const [copiedDriverId,   setCopiedDriverId]   = useState(null);
  const [sharedDriverId,   setSharedDriverId]   = useState(null);
  const [activeDriverView, setActiveDriverView] = useState(null);
  const [driverNames,      setDriverNames]      = useState(() => {
    try { return JSON.parse(localStorage.getItem('deliveryDriverNames') || '[]'); }
    catch { return []; }
  });

  // ── Extra (manually added) stops — persisted so they survive Resume ──────
  const EXTRA_STOPS_KEY = 'deliveryExtraStops';
  const [extraStops,     setExtraStops]     = useState(() => {
    try { return JSON.parse(localStorage.getItem(EXTRA_STOPS_KEY) || '[]'); }
    catch { return []; }
  });
  const persistExtraStops = (stops) => {
    localStorage.setItem(EXTRA_STOPS_KEY, JSON.stringify(stops));
    return stops;
  };
  const [showAddStop,    setShowAddStop]    = useState(false);
  const [newStopName,    setNewStopName]    = useState('');
  const [newStopAddress, setNewStopAddress] = useState('');
  const [newStopPhone,   setNewStopPhone]   = useState('');
  const [newStopNote,    setNewStopNote]    = useState('');
  const [addingStop,     setAddingStop]     = useState(false);
  const [suggestions,    setSuggestions]    = useState([]);
  const [pickedGeo,      setPickedGeo]      = useState(null); // verified suggestion the user clicked
  const suggestTimer = React.useRef(null);

  // All orders that feed optimization: CSV orders + manually added stops
  const allOrders = [...(labelData || []), ...extraStops];

  const updateDriverName = (vehicleId, name) => {
    setDriverNames(prev => {
      const next = [...prev];
      next[vehicleId - 1] = name;
      localStorage.setItem('deliveryDriverNames', JSON.stringify(next));
      return next;
    });
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const buildPolylines = async (routeList) => {
    return Promise.all(routeList.map(route => {
      if (!route.stops.length) return Promise.resolve([]);
      const waypoints = [
        [depotCoords.lon, depotCoords.lat],
        ...route.stops.map(s => [parseFloat(s.order.lon), parseFloat(s.order.lat)]),
        [depotCoords.lon, depotCoords.lat],
      ];
      return getRoutePolyline(waypoints);
    }));
  };

  // ── Initial optimization ──────────────────────────────────────────────────
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

  // ── Add a manual stop ─────────────────────────────────────────────────────
  const handleStopAddressChange = (value) => {
    setNewStopAddress(value);
    setPickedGeo(null); // typing invalidates a previously picked suggestion
    clearTimeout(suggestTimer.current);
    if (value.trim().length < 4) { setSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      setSuggestions(await autocompleteAddress(value));
    }, 300);
  };

  const pickSuggestion = (s) => {
    setPickedGeo(s);
    setNewStopAddress(s.label);
    setSuggestions([]);
  };

  const handleAddStop = async () => {
    if (!newStopName.trim() || !newStopAddress.trim()) return;
    setAddingStop(true);
    setError(null);
    setSuggestions([]);
    try {
      // Priority: 1) suggestion the user picked, 2) ORS exact match,
      // 3) US Census geocoder (official address database — catches new subdivisions)
      let geo = pickedGeo;
      if (!geo) {
        try {
          const ors = await geocodeAddress(newStopAddress);
          if (ors.layer === 'address') geo = ors;
        } catch { /* fall through to Census */ }
      }
      if (!geo) geo = await geocodeCensus(newStopAddress);
      if (!geo) {
        throw new Error(
          `Couldn't verify that address in either the map database or the US Census address database. ` +
          `Double-check spelling and ZIP, or pick one of the suggestions that appear while typing.`
        );
      }
      const stop = {
        orderId:      `custom-${Date.now()}`,
        isCustom:     true,
        deliveryDate: '',
        customerName: newStopName.trim(),
        phone:        newStopPhone.trim(),
        deliveryNote: newStopNote.trim(),
        street: geo.street || newStopAddress.trim(),
        city:   geo.city,
        state:  geo.state,
        zip:    geo.zip,
        lat:    geo.lat,
        lon:    geo.lon,
        items:  [],
      };
      setExtraStops(prev => persistExtraStops([...prev, stop]));
      setNewStopName(''); setNewStopAddress(''); setNewStopPhone(''); setNewStopNote('');
      setPickedGeo(null);
      setShowAddStop(false);
      // Existing results are stale once a stop is added
      setRoutes(null); setEditedRoutes(null); setPolylines(null); setIsManuallyEdited(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setAddingStop(false);
    }
  };

  const removeExtraStop = (orderId) => {
    setExtraStops(prev => persistExtraStops(prev.filter(s => s.orderId !== orderId)));
    setRoutes(null); setEditedRoutes(null); setPolylines(null); setIsManuallyEdited(false);
  };

  const handleOptimize = async () => {
    if (!depotCoords || !allOrders.length) return;
    setOptimizing(true);
    setError(null);
    setRoutes(null);
    setEditedRoutes(null);
    setPolylines(null);
    setIsManuallyEdited(false);

    try {
      const result = await optimizeRoute(depotCoords, allOrders, numDrivers);
      const processed = result.routes.map(r => {
        const jobSteps = r.steps.filter(s => s.type === 'job');
        const stops = jobSteps
          .map(step => ({ order: allOrders[step.id - 1], stopNum: step.arrival }))
          .filter(s => s.order != null);
        const summary = r.summary ?? { duration: r.duration ?? 0, distance: r.distance ?? 0 };
        return { vehicleId: r.vehicle, stops, summary };
      });

      setRoutes(processed);
      setEditedRoutes(processed);
      setPolylines(await buildPolylines(processed));
    } catch (e) {
      setError(e.message);
    } finally {
      setOptimizing(false);
    }
  };

  // ── Manual stop reassignment ──────────────────────────────────────────────
  const moveStop = (fromVehicleId, orderId) => {
    setEditedRoutes(prev => {
      const next = prev.map(r => ({ ...r, stops: [...r.stops] }));
      const from = next.find(r => r.vehicleId === fromVehicleId);
      const to   = next.find(r => r.vehicleId !== fromVehicleId);
      if (!from || !to) return prev;
      const idx = from.stops.findIndex(s => s.order.orderId === orderId);
      if (idx === -1) return prev;
      const [moved] = from.stops.splice(idx, 1);
      to.stops.push(moved);
      return next;
    });
    // Update map markers immediately (without re-routing polylines)
    setRoutes(prev => {
      if (!prev) return prev;
      const next = prev.map(r => ({ ...r, stops: [...r.stops] }));
      const from = next.find(r => r.vehicleId === fromVehicleId);
      const to   = next.find(r => r.vehicleId !== fromVehicleId);
      if (!from || !to) return prev;
      const idx = from.stops.findIndex(s => s.order.orderId === orderId);
      if (idx === -1) return prev;
      const [moved] = from.stops.splice(idx, 1);
      to.stops.push(moved);
      return next;
    });
    setPolylines(null); // polylines are stale until re-optimized
    setIsManuallyEdited(true);
  };

  // ── Re-optimize each driver's current stops independently ─────────────────
  const handleReoptimize = async () => {
    if (!depotCoords || !editedRoutes) return;
    setReoptimizing(true);
    setError(null);
    try {
      const newRoutes = await Promise.all(
        editedRoutes.map(async route => {
          if (route.stops.length === 0) {
            return { ...route, summary: { distance: 0, duration: 0 } };
          }
          const orders = route.stops.map(s => s.order);
          const result = await optimizeRoute(depotCoords, orders, 1);
          const jobSteps = result.routes[0].steps.filter(s => s.type === 'job');
          const reordered = jobSteps
            .map(step => ({ order: orders[step.id - 1] }))
            .filter(s => s.order != null);
          const summary = result.routes[0].summary ?? {
            duration: result.routes[0].duration ?? 0,
            distance: result.routes[0].distance ?? 0,
          };
          return { ...route, stops: reordered, summary };
        })
      );

      setEditedRoutes(newRoutes);
      setRoutes(newRoutes);
      setPolylines(await buildPolylines(newRoutes));
      setIsManuallyEdited(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setReoptimizing(false);
    }
  };

  // ── Action buttons ────────────────────────────────────────────────────────
  const handleCopyRoute = (route) => {
    const waypoints = route.stops.slice(0, 8).map(s => `${s.order.lat},${s.order.lon}`).join('|');
    const mapsUrl =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${depotCoords.lat},${depotCoords.lon}` +
      `&destination=${depotCoords.lat},${depotCoords.lon}` +
      `&waypoints=${waypoints}&travelmode=driving`;
    const stopLines = route.stops
      .map((s, i) => `${i + 1}. ${s.order.customerName} — ${s.order.street}, ${s.order.city}`)
      .join('\n');
    const driverName = driverNames[route.vehicleId - 1] || `Driver ${route.vehicleId}`;
    const message =
      `${driverName} — ${route.stops.length} stop${route.stops.length !== 1 ? 's' : ''}` +
      ` (${formatDistance(route.summary.distance)} / ${formatDuration(route.summary.duration)})\n\n` +
      `${stopLines}\n\nNavigate all stops:\n${mapsUrl}`;
    navigator.clipboard.writeText(message).then(() => {
      setCopiedDriverId(route.vehicleId);
      setTimeout(() => setCopiedDriverId(null), 2500);
    });
  };

  const handleShareDriver = (route) => {
    const name     = driverNames[route.vehicleId - 1] || `Driver ${route.vehicleId}`;
    const farmName = localStorage.getItem('deliveryFarmName') || 'Fuster Cluck Farm';
    const url      = encodeDriverLink(route, name, farmName);
    navigator.clipboard.writeText(url).then(() => {
      setSharedDriverId(route.vehicleId);
      setTimeout(() => setSharedDriverId(null), 2500);
    });
  };

  const handlePrintDriver = (route) => {
    onPrintLabels(route.stops.map((stop, idx) => ({
      ...stop.order,
      driverInfo: { driverNum: route.vehicleId, stopNum: idx + 1, totalStops: route.stops.length },
    })));
  };

  const handlePrintAll = () => {
    if (!editedRoutes) return;
    onPrintLabels(editedRoutes.flatMap(route =>
      route.stops.map((stop, idx) => ({
        ...stop.order,
        driverInfo: { driverNum: route.vehicleId, stopNum: idx + 1, totalStops: route.stops.length },
      }))
    ));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const displayRoutes = editedRoutes ?? routes;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Left panel */}
      <div className="w-full lg:w-96 flex-shrink-0 space-y-4 overflow-y-auto">

        {/* Depot */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <MapPin size={16} className="text-gray-500" /> Start / End Depot
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={depotAddress}
              onChange={e => setDepotAddress(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSetDepot()}
              placeholder="123 Farm Rd, City, NC 27000"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <button
              onClick={handleSetDepot}
              disabled={!depotAddress.trim() || geocoding}
              className="px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-black disabled:opacity-40 flex items-center gap-1"
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
            <Navigation size={16} className="text-gray-500" /> Number of Drivers
          </h3>
          <div className="flex gap-2">
            {[1, 2].map(n => (
              <button key={n} onClick={() => setNumDrivers(n)}
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

        {/* Add a stop */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <PlusCircle size={16} className="text-gray-500" /> Additional Stops
              {extraStops.length > 0 && (
                <span className="text-xs font-normal text-gray-400">({extraStops.length})</span>
              )}
            </h3>
            {!showAddStop && (
              <button
                onClick={() => setShowAddStop(true)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                + Add Stop
              </button>
            )}
          </div>

          {/* Existing extra stops */}
          {extraStops.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {extraStops.map(s => (
                <li key={s.orderId} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">{s.customerName}</div>
                    <div className="text-[10px] text-gray-500 truncate">{s.street}, {s.city}</div>
                  </div>
                  <button
                    onClick={() => removeExtraStop(s.orderId)}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500"
                    title="Remove stop"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Add-stop form */}
          {showAddStop && (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={newStopName}
                onChange={e => setNewStopName(e.target.value)}
                placeholder="Name (e.g. Feed Store pickup)"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
              <div className="relative">
                <input
                  type="text"
                  value={newStopAddress}
                  onChange={e => handleStopAddressChange(e.target.value)}
                  placeholder="Address (e.g. 123 Main St, Kenly, NC)"
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-1 outline-none ${
                    pickedGeo
                      ? 'border-green-400 focus:border-green-500 focus:ring-green-500'
                      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                />
                {pickedGeo && (
                  <CheckCircle size={15} className="absolute right-3 top-2.5 text-green-500" />
                )}
                {suggestions.length > 0 && (
                  <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {suggestions.map((s, i) => (
                      <li key={i}>
                        <button
                          onClick={() => pickSuggestion(s)}
                          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 border-b border-gray-50 last:border-0"
                        >
                          {s.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStopPhone}
                  onChange={e => setNewStopPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <input
                  type="text"
                  value={newStopNote}
                  onChange={e => setNewStopNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddStop}
                  disabled={!newStopName.trim() || !newStopAddress.trim() || addingStop}
                  className="flex-1 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black disabled:opacity-40 flex items-center justify-center gap-1.5"
                >
                  {addingStop
                    ? <><Loader size={14} className="animate-spin" /> Finding address…</>
                    : 'Add Stop'}
                </button>
                <button
                  onClick={() => setShowAddStop(false)}
                  className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Optimize button */}
        <button
          onClick={handleOptimize}
          disabled={!depotCoords || !allOrders.length || optimizing}
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2 shadow-sm transition-all"
        >
          {optimizing
            ? <><Loader size={18} className="animate-spin" /> Optimizing…</>
            : <><Navigation size={18} /> Optimize Route{numDrivers > 1 ? 's' : ''}</>}
        </button>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Route results */}
        {displayRoutes && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-700">Optimized Routes</span>
              <div className="flex gap-1.5">
                {/* Re-optimize after manual edits */}
                {isManuallyEdited && (
                  <button
                    onClick={handleReoptimize}
                    disabled={reoptimizing}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium disabled:opacity-50"
                    title="Re-optimize stop order for each driver based on their current assignment"
                  >
                    {reoptimizing
                      ? <><Loader size={12} className="animate-spin" /> Optimizing…</>
                      : <><RefreshCw size={12} /> Re-optimize Order</>}
                  </button>
                )}
                {displayRoutes.length > 1 && (
                  <button onClick={handlePrintAll}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
                  >
                    <Printer size={13} /> Print All
                  </button>
                )}
              </div>
            </div>

            {isManuallyEdited && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Stops have been manually reassigned. Click <strong>Re-optimize Order</strong> to find the best sequence for each driver.
              </p>
            )}

            {displayRoutes.map(route => {
              const color      = DRIVER_COLORS[(route.vehicleId - 1) % DRIVER_COLORS.length];
              const otherRoute = displayRoutes.find(r => r.vehicleId !== route.vehicleId);

              return (
                <div key={route.vehicleId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

                  {/* Driver header */}
                  <div className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderLeft: `4px solid ${color}` }}>
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
                        {route.stops.length} stop{route.stops.length !== 1 ? 's' : ''}
                        {route.summary.distance > 0 && ` · ${formatDistance(route.summary.distance)}`}
                        {route.summary.duration > 0 && ` · ${formatDuration(route.summary.duration)}`}
                        {isManuallyEdited && <span className="text-amber-500"> *</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <button onClick={() => handleShareDriver(route)}
                        className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg transition-all font-medium ${
                          sharedDriverId === route.vehicleId
                            ? 'border-green-400 bg-green-50 text-green-700'
                            : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                        }`}
                        title="Copy link to send to driver — opens Driver View on their phone"
                      >
                        {sharedDriverId === route.vehicleId
                          ? <><ClipboardCheck size={12} /> Copied!</>
                          : <><Share2 size={12} /> Driver Link</>}
                      </button>
                      <button onClick={() => handleCopyRoute(route)}
                        className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg transition-all ${
                          copiedDriverId === route.vehicleId
                            ? 'border-green-400 bg-green-50 text-green-700'
                            : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                        }`}
                      >
                        {copiedDriverId === route.vehicleId
                          ? <><ClipboardCheck size={12} /> Copied!</>
                          : <><Copy size={12} /> Copy Route</>}
                      </button>
                      <button onClick={() => handlePrintDriver(route)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                      >
                        <Printer size={12} /> Labels
                      </button>
                      <button onClick={() => setActiveDriverView(route.vehicleId)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg text-white font-medium"
                        style={{ background: color, borderColor: color }}
                      >
                        <Truck size={12} /> Drive
                      </button>
                    </div>
                  </div>

                  {/* Stop list */}
                  <ol className="divide-y divide-gray-50">
                    {route.stops.map((stop, idx) => (
                      <li key={stop.order.orderId} className="flex items-center gap-2 px-4 py-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                          style={{ background: color }}>
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-800 truncate">
                            {stop.order.customerName}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">
                            {stop.order.street}, {stop.order.city}
                          </div>
                        </div>
                        {/* Move to other driver button — only shown with 2 drivers */}
                        {otherRoute && (
                          <button
                            onClick={() => moveStop(route.vehicleId, stop.order.orderId)}
                            className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-medium px-2 py-1 rounded border border-gray-200 hover:border-gray-400 hover:bg-gray-50 text-gray-500 transition-all"
                            title={`Move to ${driverNames[(otherRoute.vehicleId - 1)] || `Driver ${otherRoute.vehicleId}`}`}
                            style={{ '--tw-border-opacity': 1 }}
                          >
                            <ArrowRight size={10} />
                            {driverNames[(otherRoute.vehicleId - 1)] || `Driver ${otherRoute.vehicleId}`}
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1" style={{ minHeight: '500px' }}>
        <RouteMap depot={depotCoords} routes={routes} polylines={polylines} />
      </div>

      {/* Driver view overlay */}
      {activeDriverView && displayRoutes && (() => {
        const route = displayRoutes.find(r => r.vehicleId === activeDriverView);
        const color = DRIVER_COLORS[(activeDriverView - 1) % DRIVER_COLORS.length];
        return route ? (
          <DriverView route={route} driverColor={color} onClose={() => setActiveDriverView(null)} />
        ) : null;
      })()}
    </div>
  );
};

export default RouteOptimizer;
