import React, { useState } from 'react';
import {
  MapPin, Navigation, Printer, AlertCircle, CheckCircle,
  Loader, Copy, ClipboardCheck, Truck, Share2, ArrowRight, RefreshCw,
  PlusCircle, Trash2, ChevronUp, ChevronDown, Check,
} from 'lucide-react';
import { geocodeAddress, autocompleteAddress, geocodeCensus, optimizeRoute, getRouteDetails } from '../utils/routeService';
import { encodeDriverLink } from '../utils/driverLink';
import { addressText, shortAddress, googleDirectionsUrl } from '../utils/mapsLink';
import RouteMap from './RouteMap';
import DriverView, { getDriverName } from './DriverView';

const DRIVER_COLORS = ['#2563EB', '#EA580C'];
// Driver 1's depot keeps the original key so existing saved addresses still load.
const DEPOT_STORAGE_KEYS = ['deliveryDepotAddress', 'deliveryDepotAddress2'];
const SHARED_DEPOT_KEY   = 'deliveryDepotShared';

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDistance(meters) {
  return (meters / 1609.34).toFixed(1) + ' mi';
}

// One depot address input + Set button. Declared at module level so React keeps
// the input mounted across re-renders (otherwise it loses focus on every keystroke).
const DepotField = ({ color, name, value, onChange, onSet, busy, verifiedLabel }) => (
  <div>
    {name && (
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-xs font-medium text-gray-600">{name}</span>
      </div>
    )}
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSet()}
        placeholder="123 Farm Rd, City, NC 27000"
        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      />
      <button
        onClick={onSet}
        disabled={!value.trim() || busy}
        className="px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-black disabled:opacity-40 flex items-center gap-1"
      >
        {busy ? <Loader size={14} className="animate-spin" /> : 'Set'}
      </button>
    </div>
    {verifiedLabel && (
      <div className="mt-2 flex items-start gap-1.5 text-xs text-green-700">
        <CheckCircle size={13} className="mt-0.5 flex-shrink-0" />
        <span className="truncate">{verifiedLabel}</span>
      </div>
    )}
  </div>
);

const RouteOptimizer = ({ labelData, onPrintLabels }) => {
  // Depots are per-driver: index 0 = Driver 1, index 1 = Driver 2.
  const [depotAddresses,   setDepotAddresses]   = useState(() => DEPOT_STORAGE_KEYS.map(k => localStorage.getItem(k) || ''));
  const [depotCoordsList,  setDepotCoordsList]  = useState([null, null]);
  const [depotLabels,      setDepotLabels]      = useState(['', '']);
  const [sharedDepot,      setSharedDepot]      = useState(() => localStorage.getItem(SHARED_DEPOT_KEY) !== 'false');
  const [numDrivers,       setNumDrivers]       = useState(1);
  const [geocodingIdx,     setGeocodingIdx]     = useState(null);
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

  // ── Depot resolution ──────────────────────────────────────────────────────
  // With one driver — or when Driver 2 shares Driver 1's depot — every vehicle
  // starts and ends at depot 0. Otherwise each driver uses their own.
  const useSharedDepot = numDrivers === 1 || sharedDepot;
  const effectiveDepots = useSharedDepot
    ? [depotCoordsList[0], depotCoordsList[0]]
    : depotCoordsList;
  const activeDepots = effectiveDepots.slice(0, numDrivers);
  const depotsReady  = activeDepots.length > 0 && activeDepots.every(Boolean);
  const depotFor     = (vehicleId) => effectiveDepots[vehicleId - 1] || effectiveDepots[0];

  const updateDriverName = (vehicleId, name) => {
    setDriverNames(prev => {
      const next = [...prev];
      next[vehicleId - 1] = name;
      localStorage.setItem('deliveryDriverNames', JSON.stringify(next));
      return next;
    });
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const clearResults = () => {
    setRoutes(null); setEditedRoutes(null); setPolylines(null); setIsManuallyEdited(false);
  };

  // Route each driver through their own depot → stops → back to their own depot.
  // Returns both the refreshed summaries and the map polylines in one pass.
  const recalcRoutes = async (routeList) => {
    const details = await Promise.all(routeList.map(route => {
      const depot = depotFor(route.vehicleId);
      if (!route.stops.length || !depot) return Promise.resolve({ coords: [], distance: 0, duration: 0 });
      const waypoints = [
        [depot.lon, depot.lat],
        ...route.stops.map(s => [parseFloat(s.order.lon), parseFloat(s.order.lat)]),
        [depot.lon, depot.lat],
      ];
      return getRouteDetails(waypoints);
    }));
    return {
      routes: routeList.map((route, i) => ({
        ...route,
        summary: { distance: details[i].distance, duration: details[i].duration },
      })),
      polylines: details.map(d => d.coords),
    };
  };

  // ── Initial optimization ──────────────────────────────────────────────────
  const setDepotAddressAt = (idx, value) => {
    setDepotAddresses(prev => { const next = [...prev]; next[idx] = value; return next; });
  };

  const handleSetDepot = async (idx) => {
    const address = depotAddresses[idx];
    if (!address.trim()) return;
    setGeocodingIdx(idx);
    setError(null);
    setDepotCoordsList(prev => { const next = [...prev]; next[idx] = null; return next; });
    try {
      const coords = await geocodeAddress(address);
      // Keep the typed address: when the geocoder only resolves to city level,
      // it still beats the coarse fields for handing to Google Maps later.
      setDepotCoordsList(prev => { const next = [...prev]; next[idx] = { ...coords, address }; return next; });
      setDepotLabels(prev    => { const next = [...prev]; next[idx] = coords.label; return next; });
      localStorage.setItem(DEPOT_STORAGE_KEYS[idx], address);
      clearResults(); // existing routes were built around the old depot
    } catch (e) {
      setError(e.message);
    } finally {
      setGeocodingIdx(null);
    }
  };

  const toggleSharedDepot = (shared) => {
    setSharedDepot(shared);
    localStorage.setItem(SHARED_DEPOT_KEY, String(shared));
    clearResults();
  };

  // ── Add a manual stop ─────────────────────────────────────────────────────
  const handleStopAddressChange = (value) => {
    setNewStopAddress(value);
    setPickedGeo(null); // typing invalidates a previously picked suggestion
    clearTimeout(suggestTimer.current);
    if (value.trim().length < 4) { setSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      setSuggestions(await autocompleteAddress(value, effectiveDepots[0]));
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
      clearResults(); // existing results are stale once a stop is added
    } catch (e) {
      setError(e.message);
    } finally {
      setAddingStop(false);
    }
  };

  const removeExtraStop = (orderId) => {
    setExtraStops(prev => persistExtraStops(prev.filter(s => s.orderId !== orderId)));
    clearResults();
  };

  // ── Hand-off stop ─────────────────────────────────────────────────────────
  // Driver 1 carries Driver 2's orders and drops them at Driver 2's depot. This
  // adds that meeting point as a stop pinned to the front of Driver 1's route,
  // so the optimizer can't hand it to Driver 2 (who is already standing there).
  const handoffStop = extraStops.find(s => s.pinVehicle);
  // Only meaningful with two drivers on separate depots. Otherwise the stop
  // stays in the list as an ordinary one the optimizer is free to assign.
  const handoffActive = numDrivers > 1 && !sharedDepot && !!handoffStop;
  const manualStops   = extraStops.filter(s => !(handoffActive && s.pinVehicle));

  const addHandoffStop = () => {
    const depot = depotCoordsList[1];
    if (!depot) return;
    const name = driverNames[1] || 'Driver 2';
    const stop = {
      orderId:      `handoff-${Date.now()}`,
      isCustom:     true,
      isHandoff:    true,
      pinVehicle:   1,           // always rides at the front of Driver 1's route
      deliveryDate: '',
      customerName: `Hand-off to ${name}`,
      phone:        '',
      deliveryNote: `Transfer ${name}'s orders here`,
      // Mirror the depot's own fields rather than flattening the typed address
      // into `street` — that would repeat the city and confuse Google's lookup.
      address: depot.address || depotAddresses[1],
      street:  depot.street,
      city:    depot.city,
      state:   depot.state,
      zip:     depot.zip,
      lat:     depot.lat,
      lon:     depot.lon,
      items:   [],
    };
    setExtraStops(prev => persistExtraStops([...prev.filter(s => !s.pinVehicle), stop]));
    clearResults();
  };

  const handleOptimize = async () => {
    if (!depotsReady || !allOrders.length) return;
    setOptimizing(true);
    setError(null);
    clearResults();

    try {
      // Pinned stops (the hand-off) are placed by hand, not by the optimizer.
      const pinned    = handoffActive ? allOrders.filter(o => o.pinVehicle) : [];
      const jobOrders = allOrders.filter(o => !pinned.includes(o));

      const result = await optimizeRoute(activeDepots, jobOrders, numDrivers);
      const byVehicle = new Map(result.routes.map(r => [r.vehicle, r]));

      // Build one route per driver — VROOM omits vehicles it gave no jobs to,
      // and an empty driver still needs a card and a depot of their own.
      const processed = Array.from({ length: numDrivers }, (_, i) => {
        const vehicleId = i + 1;
        const r = byVehicle.get(vehicleId);
        const stops = r
          ? r.steps.filter(s => s.type === 'job')
              .map(step => ({ order: jobOrders[step.id - 1], stopNum: step.arrival }))
              .filter(s => s.order != null)
          : [];
        const pinnedHere = pinned
          .filter(o => o.pinVehicle === vehicleId)
          .map(o => ({ order: o, stopNum: null }));
        return { vehicleId, stops: [...pinnedHere, ...stops], summary: { distance: 0, duration: 0 } };
      });

      // Recalculate against each driver's own depot (and any pinned stops).
      const { routes: finalRoutes, polylines: lines } = await recalcRoutes(processed);
      setRoutes(finalRoutes);
      setEditedRoutes(finalRoutes);
      setPolylines(lines);
    } catch (e) {
      setError(e.message);
    } finally {
      setOptimizing(false);
    }
  };

  // ── Manual stop reassignment ──────────────────────────────────────────────
  const moveStop = (fromVehicleId, orderId) => {
    // A pinned hand-off belongs to one driver by definition — never reassign it.
    if (handoffActive && handoffStop?.orderId === orderId) return;
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

  // ── Reorder a stop within its driver's route ─────────────────────────────
  const reorderStop = (vehicleId, orderId, direction) => {
    const shift = (routeList) => {
      const next = routeList.map(r => ({ ...r, stops: [...r.stops] }));
      const route = next.find(r => r.vehicleId === vehicleId);
      if (!route) return routeList;
      const idx = route.stops.findIndex(s => s.order.orderId === orderId);
      const to  = idx + direction;
      if (idx === -1 || to < 0 || to >= route.stops.length) return routeList;
      [route.stops[idx], route.stops[to]] = [route.stops[to], route.stops[idx]];
      return next;
    };
    setEditedRoutes(prev => shift(prev));
    setRoutes(prev => (prev ? shift(prev) : prev));
    setPolylines(null);
    setIsManuallyEdited(true);
  };

  // ── Keep the user's manual order: recalc times + map without re-optimizing ─
  const handleKeepOrder = async () => {
    if (!depotsReady || !editedRoutes) return;
    setReoptimizing(true);
    setError(null);
    try {
      const { routes: newRoutes, polylines: lines } = await recalcRoutes(editedRoutes);
      setEditedRoutes(newRoutes);
      setRoutes(newRoutes);
      setPolylines(lines);
      setIsManuallyEdited(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setReoptimizing(false);
    }
  };

  // ── Re-optimize each driver's current stops independently ─────────────────
  const handleReoptimize = async () => {
    if (!depotsReady || !editedRoutes) return;
    setReoptimizing(true);
    setError(null);
    try {
      const resequenced = await Promise.all(
        editedRoutes.map(async route => {
          // The hand-off stays first — only the remaining stops get resequenced.
          const pinnedHere = handoffActive ? route.stops.filter(s => s.order.pinVehicle) : [];
          const free       = route.stops.filter(s => !pinnedHere.includes(s));
          if (free.length === 0) return route;

          const orders = free.map(s => s.order);
          const result = await optimizeRoute(depotFor(route.vehicleId), orders, 1);
          const jobSteps = result.routes[0].steps.filter(s => s.type === 'job');
          const reordered = jobSteps
            .map(step => ({ order: orders[step.id - 1] }))
            .filter(s => s.order != null);
          return { ...route, stops: [...pinnedHere, ...reordered] };
        })
      );

      const { routes: newRoutes, polylines: lines } = await recalcRoutes(resequenced);
      setEditedRoutes(newRoutes);
      setRoutes(newRoutes);
      setPolylines(lines);
      setIsManuallyEdited(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setReoptimizing(false);
    }
  };

  // ── Action buttons ────────────────────────────────────────────────────────
  const handleCopyRoute = (route) => {
    const depot     = depotFor(route.vehicleId);
    const depotAddr = addressText(depot);
    const mapsUrl   = googleDirectionsUrl({
      origin:      depotAddr,
      destination: depotAddr,
      // Google caps a directions URL at 9 waypoints.
      waypoints:   route.stops.slice(0, 8).map(s => addressText(s.order)).filter(Boolean),
    });
    const stopLines = route.stops
      .map((s, i) => `${i + 1}. ${s.order.customerName} — ${shortAddress(s.order)}`)
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
    const url      = encodeDriverLink(route, name, farmName, depotFor(route.vehicleId));
    navigator.clipboard.writeText(url).then(() => {
      setSharedDriverId(route.vehicleId);
      setTimeout(() => setSharedDriverId(null), 2500);
    });
  };

  // Stop numbers stay aligned with the on-screen list, but the hand-off point
  // has no order to pack, so it never gets a label.
  const labelsForRoute = (route) => route.stops
    .map((stop, idx) => ({
      ...stop.order,
      driverInfo: { driverNum: route.vehicleId, stopNum: idx + 1, totalStops: route.stops.length },
    }))
    .filter(label => !label.isHandoff);

  const handlePrintDriver = (route) => onPrintLabels(labelsForRoute(route));

  const handlePrintAll = () => {
    if (!editedRoutes) return;
    onPrintLabels(editedRoutes.flatMap(labelsForRoute));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const displayRoutes = editedRoutes ?? routes;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* Left panel */}
      <div className="w-full lg:w-96 flex-shrink-0 space-y-4 overflow-y-auto">

        {/* Depot(s) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <MapPin size={16} className="text-gray-500" />
            Start / End Depot{numDrivers > 1 && !sharedDepot ? 's' : ''}
          </h3>

          <DepotField
            color={DRIVER_COLORS[0]}
            name={numDrivers > 1 && !sharedDepot
              ? (driverNames[0] || 'Driver 1')
              : null}
            value={depotAddresses[0]}
            onChange={v => setDepotAddressAt(0, v)}
            onSet={() => handleSetDepot(0)}
            busy={geocodingIdx === 0}
            verifiedLabel={depotCoordsList[0] ? depotLabels[0] : ''}
          />

          {numDrivers > 1 && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5">
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sharedDepot}
                  onChange={e => toggleSharedDepot(e.target.checked)}
                  className="rounded border-gray-300"
                />
                {driverNames[1] || 'Driver 2'} starts and ends at the same depot
              </label>

              {!sharedDepot && (
                <>
                  <DepotField
                    color={DRIVER_COLORS[1]}
                    name={driverNames[1] || 'Driver 2'}
                    value={depotAddresses[1]}
                    onChange={v => setDepotAddressAt(1, v)}
                    onSet={() => handleSetDepot(1)}
                    busy={geocodingIdx === 1}
                    verifiedLabel={depotCoordsList[1] ? depotLabels[1] : ''}
                  />

                  {/* Hand-off: Driver 1 carries Driver 2's orders to this depot */}
                  {depotCoordsList[1] && !handoffStop && (
                    <button
                      onClick={addHandoffStop}
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
                      title={`Adds this address as the first stop on ${driverNames[0] || 'Driver 1'}'s route`}
                    >
                      <PlusCircle size={13} />
                      Make this {driverNames[0] || 'Driver 1'}'s first stop (hand-off)
                    </button>
                  )}
                  {handoffStop && (
                    <div className="flex items-center gap-2 text-xs bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5 text-indigo-800">
                      <Truck size={13} className="flex-shrink-0" />
                      <span className="flex-1 min-w-0 truncate">
                        {driverNames[0] || 'Driver 1'} drops off here first
                      </span>
                      <button
                        onClick={() => removeExtraStop(handoffStop.orderId)}
                        className="flex-shrink-0 p-0.5 text-indigo-400 hover:text-red-500"
                        title="Remove hand-off stop"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </>
              )}
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
              <button key={n} onClick={() => { setNumDrivers(n); clearResults(); }}
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
              {manualStops.length > 0 && (
                <span className="text-xs font-normal text-gray-400">({manualStops.length})</span>
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
          {manualStops.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {manualStops.map(s => (
                <li key={s.orderId} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">{s.customerName}</div>
                    <div className="text-[10px] text-gray-500 truncate">{shortAddress(s)}</div>
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
          disabled={!depotsReady || !allOrders.length || optimizing}
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
                {/* After manual edits: keep the user's order, or re-optimize */}
                {isManuallyEdited && (
                  <>
                    <button
                      onClick={handleKeepOrder}
                      disabled={reoptimizing}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
                      title="Keep the current stop order and update times and the map"
                    >
                      {reoptimizing
                        ? <><Loader size={12} className="animate-spin" /> Updating…</>
                        : <><Check size={12} /> Keep My Order</>}
                    </button>
                    <button
                      onClick={handleReoptimize}
                      disabled={reoptimizing}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium disabled:opacity-50"
                      title="Let the optimizer pick the best stop order for each driver"
                    >
                      <RefreshCw size={12} /> Re-optimize
                    </button>
                  </>
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
                Stops have been manually changed. Click <strong>Keep My Order</strong> to update times and the map with your arrangement, or <strong>Re-optimize</strong> to let the optimizer pick the best sequence.
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
                    {route.stops.map((stop, idx) => {
                      const isPinned = handoffActive && !!stop.order.pinVehicle;
                      return (
                      <li key={stop.order.orderId} className={`flex items-center gap-2 px-4 py-2 ${isPinned ? 'bg-indigo-50/60' : ''}`}>
                        <span className="flex-shrink-0 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                          style={{ background: color }}>
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-800 truncate flex items-center gap-1">
                            {isPinned && <Truck size={11} className="flex-shrink-0 text-indigo-500" />}
                            {stop.order.customerName}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">
                            {shortAddress(stop.order)}
                          </div>
                        </div>
                        {/* Reorder within this driver's route */}
                        <div className="flex-shrink-0 flex flex-col">
                          <button
                            onClick={() => reorderStop(route.vehicleId, stop.order.orderId, -1)}
                            disabled={idx === 0}
                            className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-20"
                            title="Move up"
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            onClick={() => reorderStop(route.vehicleId, stop.order.orderId, 1)}
                            disabled={idx === route.stops.length - 1}
                            className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-20"
                            title="Move down"
                          >
                            <ChevronDown size={13} />
                          </button>
                        </div>
                        {/* Move to other driver button — only shown with 2 drivers.
                            The hand-off can't move: it IS the other driver's depot. */}
                        {otherRoute && !isPinned && (
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
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1" style={{ minHeight: '500px' }}>
        <RouteMap depots={activeDepots} routes={routes} polylines={polylines} />
      </div>

      {/* Driver view overlay */}
      {activeDriverView && displayRoutes && (() => {
        const route = displayRoutes.find(r => r.vehicleId === activeDriverView);
        const color = DRIVER_COLORS[(activeDriverView - 1) % DRIVER_COLORS.length];
        return route ? (
          <DriverView
            route={route}
            driverColor={color}
            depot={depotFor(activeDriverView)}
            onClose={() => setActiveDriverView(null)}
          />
        ) : null;
      })()}
    </div>
  );
};

export default RouteOptimizer;
