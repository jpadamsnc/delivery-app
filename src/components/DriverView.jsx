import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, CheckCircle, MessageSquare, Clock,
  ChevronDown, ChevronUp, Settings, RotateCcw, Loader, Map,
} from 'lucide-react';
import { getDrivingTime } from '../utils/routeService';

// ─── Default message templates ──────────────────────────────────────────────
// Available placeholders:
//   {firstName}   – customer's first name
//   {farmName}    – your farm name
//   {stopsAway}   – number of stops ahead of this one  (ETA only)
//   {stopsWord}   – "stop" or "stops"                  (ETA only)
//   {etaTime}     – clock time if GPS available, otherwise "~X minutes" / "shortly"
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_ETA_TEMPLATE =
  `Hi {firstName}! This is your {farmName} driver — we're {stopsAway} {stopsWord} away, estimated arrival at {etaTime}!`;

const DEFAULT_THANKS_TEMPLATE =
  `Hi {firstName}! Your {farmName} order has been delivered. Thank you so much for your support! 🐔`;

const STORAGE_ETA     = 'deliveryEtaTemplate';
const STORAGE_THANKS  = 'deliveryThanksTemplate';
const STORAGE_FARM    = 'deliveryFarmName';
const STORAGE_DRIVERS = 'deliveryDriverNames'; // JSON array ["Jim","Carol"]
const STORAGE_COMPLETED_PREFIX = 'deliveryCompleted_'; // + route key

export function getDriverName(vehicleId) {
  try {
    const names = JSON.parse(localStorage.getItem(STORAGE_DRIVERS) || '[]');
    return names[vehicleId - 1] || `Driver ${vehicleId}`;
  } catch { return `Driver ${vehicleId}`; }
}

const DEFAULT_FARM = 'Fuster Cluck Farm';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function cleanPhone(phone) { return (phone || '').replace(/\D/g, ''); }

function smsLink(phone, body) {
  const number = cleanPhone(phone);
  if (!number) return null;
  return `sms:${number}?body=${encodeURIComponent(body)}`;
}

function applyTemplate(template, vars) {
  return template
    .replace(/\{firstName\}/g,   vars.firstName   ?? '')
    .replace(/\{farmName\}/g,    vars.farmName    ?? '')
    .replace(/\{driverName\}/g,  vars.driverName  ?? '')
    .replace(/\{stopsAway\}/g,   vars.stopsAway   ?? '')
    .replace(/\{stopsWord\}/g,   vars.stopsWord   ?? '')
    .replace(/\{etaTime\}/g,     vars.etaTime     ?? '');
}

function formatArrivalTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ─── Template Editor Modal ────────────────────────────────────────────────────
const TemplateEditor = ({ farmName, etaTemplate, thanksTemplate, driverNames, onSave, onClose }) => {
  const [farm,    setFarm]    = useState(farmName);
  const [eta,     setEta]     = useState(etaTemplate);
  const [thanks,  setThanks]  = useState(thanksTemplate);
  const [drivers, setDrivers] = useState(driverNames);

  const setDriver = (idx, val) => setDrivers(prev => {
    const next = [...prev];
    next[idx] = val;
    return next;
  });

  const handleSave = () => {
    onSave({ farmName: farm.trim() || DEFAULT_FARM, etaTemplate: eta, thanksTemplate: thanks, driverNames: drivers });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} className="sm:items-center sm:p-4">
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">Text Message Templates</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* Farm name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Farm Name</label>
            <input
              type="text"
              value={farm}
              onChange={e => setFarm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Driver names */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Driver Names</label>
            <div className="flex gap-2">
              {[0, 1].map(i => (
                <input
                  key={i}
                  type="text"
                  value={drivers[i] || ''}
                  onChange={e => setDriver(i, e.target.value)}
                  placeholder={`Driver ${i + 1} (e.g. ${i === 0 ? 'Jim' : 'Carol'})`}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">Use <code className="bg-gray-100 px-1 rounded">{'{driverName}'}</code> in templates to include the driver's name.</p>
          </div>

          {/* ETA template */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-gray-700">ETA Message</label>
              <button
                onClick={() => setEta(DEFAULT_ETA_TEMPLATE)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>
            <textarea
              value={eta}
              onChange={e => setEta(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Placeholders: <code className="bg-gray-100 px-1 rounded">{'{firstName}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{farmName}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{driverName}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{stopsAway}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{stopsWord}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{etaTime}'}</code>
            </p>
          </div>

          {/* Thank you template */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-gray-700">Thank You Message</label>
              <button
                onClick={() => setThanks(DEFAULT_THANKS_TEMPLATE)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>
            <textarea
              value={thanks}
              onChange={e => setThanks(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Placeholders: <code className="bg-gray-100 px-1 rounded">{'{firstName}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{farmName}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{driverName}'}</code>
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200">
          <button
            onClick={handleSave}
            className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            Save Templates
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Driver View ─────────────────────────────────────────────────────────
const DriverView = ({ route, driverColor, onClose, overrideFarmName }) => {
  // Stable key for this specific route so completed-stop state survives a page reload
  // (iOS Safari frequently reloads the tab after the driver leaves to send an SMS or open Maps).
  const routeKey = `${STORAGE_COMPLETED_PREFIX}${route.vehicleId}_${route.stops.map(s => s.order.orderId).join(',')}`;

  const [completedIds,  setCompletedIds]  = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(routeKey) || '[]');
      return new Set(saved);
    } catch { return new Set(); }
  });
  const [expandedId,    setExpandedId]    = useState(null);
  const [etaLoadingId,  setEtaLoadingId]  = useState(null);
  const [showSettings,  setShowSettings]  = useState(false);

  const [farmName,       setFarmName]       = useState(() => overrideFarmName || localStorage.getItem(STORAGE_FARM) || DEFAULT_FARM);
  const [etaTemplate,    setEtaTemplate]    = useState(() => localStorage.getItem(STORAGE_ETA)    || DEFAULT_ETA_TEMPLATE);
  const [thanksTemplate, setThanksTemplate] = useState(() => localStorage.getItem(STORAGE_THANKS) || DEFAULT_THANKS_TEMPLATE);
  const [driverNames,    setDriverNames]    = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_DRIVERS) || '[]'); } catch { return []; } });

  const driverName = route.driverName || driverNames[route.vehicleId - 1] || `Driver ${route.vehicleId}`;

  // Google Maps link for the full route (all incomplete stops in order)
  const mapsUrl = (() => {
    const stops = route.stops.filter(s => s.order?.lat && s.order?.lon);
    if (!stops.length) return null;
    const waypoints = stops.slice(0, 8).map(s => `${s.order.lat},${s.order.lon}`).join('|');
    const dest = stops[stops.length - 1];
    return `https://www.google.com/maps/dir/?api=1` +
      `&destination=${dest.order.lat},${dest.order.lon}` +
      (stops.length > 1 ? `&waypoints=${stops.slice(0, -1).map(s => `${s.order.lat},${s.order.lon}`).join('|')}` : '') +
      `&travelmode=driving`;
  })();

  const handleSaveTemplates = ({ farmName: f, etaTemplate: e, thanksTemplate: t, driverNames: d }) => {
    setFarmName(f);        localStorage.setItem(STORAGE_FARM,    f);
    setEtaTemplate(e);     localStorage.setItem(STORAGE_ETA,     e);
    setThanksTemplate(t);  localStorage.setItem(STORAGE_THANKS,  t);
    setDriverNames(d);     localStorage.setItem(STORAGE_DRIVERS, JSON.stringify(d));
  };

  const toggleComplete = (orderId) => {
    setCompletedIds(prev => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      localStorage.setItem(routeKey, JSON.stringify([...next]));
      return next;
    });
  };

  const incompleteStops = route.stops.filter(s => !completedIds.has(s.order.orderId));
  const completedStops  = route.stops.filter(s =>  completedIds.has(s.order.orderId));
  const allDone         = completedStops.length === route.stops.length;

  const avgMin = route.summary?.duration
    ? Math.max(5, Math.round((route.summary.duration / 60) / route.stops.length))
    : 12;

  // ── ETA handler: tries GPS → ORS, falls back to stops estimate ──────────────
  const handleEta = async (order, stopsAway) => {
    setEtaLoadingId(order.orderId);

    let etaTime;
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 8000,
          maximumAge: 30000,
          enableHighAccuracy: false,
        })
      );

      const { latitude: lat, longitude: lon } = pos.coords;
      const seconds = await getDrivingTime(
        [lon, lat],
        [parseFloat(order.lon), parseFloat(order.lat)]
      );

      if (seconds != null) {
        etaTime = formatArrivalTime(new Date(Date.now() + seconds * 1000));
      } else {
        throw new Error('no duration');
      }
    } catch {
      // Fallback
      etaTime = stopsAway === 0
        ? 'shortly'
        : `~${stopsAway * avgMin} minutes`;
    }

    setEtaLoadingId(null);

    const firstName = (order.customerName || '').split(' ')[0];
    const body = applyTemplate(etaTemplate, {
      firstName,
      farmName,
      driverName,
      stopsAway,
      stopsWord: stopsAway === 1 ? 'stop' : 'stops',
      etaTime,
    });
    const href = smsLink(order.phone, body);
    if (href) window.location.href = href;
  };

  const buildThanks = (order) => {
    const firstName = (order.customerName || '').split(' ')[0];
    return smsLink(order.phone, applyTemplate(thanksTemplate, { firstName, farmName, driverName }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: driverColor }} />
          <span className="font-bold text-gray-900">{driverName}'s Route</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{completedStops.length}/{route.stops.length} done</span>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg text-white"
              style={{ background: driverColor }}
              title="Open full route in Google Maps"
            >
              <Map size={13} /> Navigate
            </a>
          )}
          <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">
            <Settings size={18} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-200 flex-shrink-0">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${(completedStops.length / route.stops.length) * 100}%`,
            background: driverColor,
          }}
        />
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {allDone && (
          <div className="p-5 bg-green-50 border border-green-200 rounded-xl text-center text-green-800">
            <div className="text-3xl mb-1">🎉</div>
            <div className="font-bold text-lg">All deliveries complete!</div>
            <div className="text-sm mt-1 text-green-600">Great work today.</div>
          </div>
        )}

        {/* Incomplete stops */}
        {incompleteStops.map((stop, idx) => {
          const { order }   = stop;
          const isExpanded  = expandedId === order.orderId;
          const isCalc      = etaLoadingId === order.orderId;
          const hasPhone    = !!cleanPhone(order.phone);
          const thankHref   = buildThanks(order);

          return (
            <div key={order.orderId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

              {/* Stop header */}
              <div className="flex items-start gap-3 p-4">
                <span
                  className="flex-shrink-0 w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center mt-0.5"
                  style={{ background: driverColor }}
                >
                  {idx + 1}
                </span>

                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : order.orderId)}
                >
                  <div className="font-bold text-gray-900 text-base leading-tight">{order.customerName}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{order.street}</div>
                  <div className="text-sm text-gray-500">{order.city}, {order.state} {order.zip}</div>
                  {order.phone && (
                    <div className="text-sm font-semibold text-gray-700 mt-0.5">{order.phone}</div>
                  )}
                  {order.deliveryNote && (
                    <div className="mt-1.5 text-xs italic text-amber-800 bg-amber-50 border border-amber-100 px-2 py-1 rounded-md">
                      📝 {order.deliveryNote}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.orderId)}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 mt-0.5"
                >
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>

              {/* Expanded items */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Items ({order.items.length})
                  </div>
                  <div className="space-y-1.5">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700 flex-1 pr-2">{item.name}</span>
                        <span className="text-gray-500 flex-shrink-0">
                          ×{item.qty}{item.weight ? ` · ${item.weight} lb` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex border-t border-gray-100 divide-x divide-gray-100">

                {/* ETA */}
                {hasPhone ? (
                  <button
                    onClick={() => !isCalc && handleEta(order, idx)}
                    disabled={isCalc}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-60"
                  >
                    {isCalc
                      ? <><Loader size={15} className="animate-spin" /> Locating…</>
                      : <><Clock size={15} /> ETA</>}
                  </button>
                ) : (
                  <span className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm text-gray-300">
                    <Clock size={15} /> ETA
                  </span>
                )}

                {/* Thank You */}
                {hasPhone ? (
                  <a
                    href={thankHref}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-emerald-600 hover:bg-emerald-50 active:bg-emerald-100"
                  >
                    <MessageSquare size={15} /> Thank You
                  </a>
                ) : (
                  <span className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm text-gray-300">
                    <MessageSquare size={15} /> Thank You
                  </span>
                )}

                {/* Delivered */}
                <button
                  onClick={() => toggleComplete(order.orderId)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold text-white active:opacity-80"
                  style={{ background: driverColor }}
                >
                  <CheckCircle size={15} /> Delivered
                </button>
              </div>
            </div>
          );
        })}

        {/* Completed stops */}
        {completedStops.length > 0 && (
          <div className="pt-1">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
              Completed ({completedStops.length})
            </div>
            {completedStops.map((stop) => (
              <div key={stop.order.orderId} className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-3 opacity-60">
                <div className="flex items-center gap-3 px-4 py-3">
                  <CheckCircle size={22} className="text-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-600 line-through">{stop.order.customerName}</div>
                    <div className="text-xs text-gray-400">{stop.order.street}, {stop.order.city}</div>
                  </div>
                  <button
                    onClick={() => toggleComplete(stop.order.orderId)}
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    <RotateCcw size={12} />
                    Undo
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="h-4" />
      </div>

      {/* Template editor — portalled to body so it renders above the Leaflet map */}
      {showSettings && createPortal(
        <TemplateEditor
          farmName={farmName}
          etaTemplate={etaTemplate}
          thanksTemplate={thanksTemplate}
          driverNames={driverNames}
          onSave={handleSaveTemplates}
          onClose={() => setShowSettings(false)}
        />,
        document.body
      )}
    </div>
  );
};

export default DriverView;
