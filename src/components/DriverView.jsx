import React, { useState } from 'react';
import { X, CheckCircle, Circle, MessageSquare, Clock, ChevronDown, ChevronUp } from 'lucide-react';

// Change this to match your farm name as you want it to appear in texts
const FARM_NAME = 'Fuster Cluck Farm';

function cleanPhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

function smsLink(phone, body) {
  const number = cleanPhone(phone);
  if (!number) return null;
  return `sms:${number}?body=${encodeURIComponent(body)}`;
}

const DriverView = ({ route, driverColor, onClose }) => {
  const [completedIds, setCompletedIds] = useState(new Set());
  const [expandedId, setExpandedId]     = useState(null);

  const toggleComplete = (orderId) => {
    setCompletedIds(prev => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  };

  const incompleteStops = route.stops.filter(s => !completedIds.has(s.order.orderId));
  const completedStops  = route.stops.filter(s =>  completedIds.has(s.order.orderId));
  const allDone = completedStops.length === route.stops.length;

  // Average minutes per stop based on actual route duration
  const avgMin = route.summary?.duration
    ? Math.max(5, Math.round((route.summary.duration / 60) / route.stops.length))
    : 12;

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: driverColor }} />
          <span className="font-bold text-gray-900">Driver {route.vehicleId} Route</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {completedStops.length}/{route.stops.length} done
          </span>
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

      {/* Scrollable stop list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {/* All done banner */}
        {allDone && (
          <div className="p-5 bg-green-50 border border-green-200 rounded-xl text-center text-green-800">
            <div className="text-3xl mb-1">🎉</div>
            <div className="font-bold text-lg">All deliveries complete!</div>
            <div className="text-sm mt-1 text-green-600">Great work today.</div>
          </div>
        )}

        {/* Incomplete stops */}
        {incompleteStops.map((stop, idx) => {
          const { order } = stop;
          const isExpanded = expandedId === order.orderId;
          const stopsAway  = idx; // 0 = next stop

          const etaBody = stopsAway === 0
            ? `Hi ${order.customerName.split(' ')[0]}! This is your ${FARM_NAME} driver — we're on our way and should arrive shortly!`
            : `Hi ${order.customerName.split(' ')[0]}! This is your ${FARM_NAME} driver — we're about ${stopsAway} stop${stopsAway !== 1 ? 's' : ''} away, estimated ~${stopsAway * avgMin} minutes!`;

          const thankBody =
            `Hi ${order.customerName.split(' ')[0]}! Your ${FARM_NAME} order has been delivered. Thank you so much for your support! 🐔`;

          const etaHref     = smsLink(order.phone, etaBody);
          const thankHref   = smsLink(order.phone, thankBody);
          const hasPhone    = !!cleanPhone(order.phone);

          return (
            <div key={order.orderId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

              {/* Stop header */}
              <div className="flex items-start gap-3 p-4">
                {/* Stop number badge */}
                <span
                  className="flex-shrink-0 w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center mt-0.5"
                  style={{ background: driverColor }}
                >
                  {idx + 1}
                </span>

                {/* Customer info */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : order.orderId)}
                >
                  <div className="font-bold text-gray-900 text-base leading-tight">
                    {order.customerName}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">{order.street}</div>
                  <div className="text-sm text-gray-500">
                    {order.city}, {order.state} {order.zip}
                  </div>
                  {order.phone && (
                    <div className="text-sm font-semibold text-gray-700 mt-0.5">{order.phone}</div>
                  )}
                  {order.deliveryNote && (
                    <div className="mt-1.5 text-xs italic text-amber-800 bg-amber-50 border border-amber-100 px-2 py-1 rounded-md">
                      📝 {order.deliveryNote}
                    </div>
                  )}
                </div>

                {/* Expand toggle */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.orderId)}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 mt-0.5"
                >
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>

              {/* Expanded items list */}
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
                {hasPhone ? (
                  <a
                    href={etaHref}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 active:bg-blue-100"
                  >
                    <Clock size={15} />
                    ETA
                  </a>
                ) : (
                  <span className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm text-gray-300">
                    <Clock size={15} />
                    ETA
                  </span>
                )}

                {hasPhone ? (
                  <a
                    href={thankHref}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-emerald-600 hover:bg-emerald-50 active:bg-emerald-100"
                  >
                    <MessageSquare size={15} />
                    Thank You
                  </a>
                ) : (
                  <span className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm text-gray-300">
                    <MessageSquare size={15} />
                    Thank You
                  </span>
                )}

                <button
                  onClick={() => toggleComplete(order.orderId)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold text-white active:opacity-80"
                  style={{ background: driverColor }}
                >
                  <CheckCircle size={15} />
                  Delivered
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
              <div
                key={stop.order.orderId}
                className="bg-white rounded-xl border border-gray-100 p-4 mb-3 opacity-50"
              >
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleComplete(stop.order.orderId)}>
                    <CheckCircle size={24} className="text-green-500" />
                  </button>
                  <div>
                    <div className="font-medium text-gray-600 line-through">
                      {stop.order.customerName}
                    </div>
                    <div className="text-xs text-gray-400">
                      {stop.order.street}, {stop.order.city}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom padding so last card isn't flush against the edge */}
        <div className="h-4" />
      </div>
    </div>
  );
};

export default DriverView;
