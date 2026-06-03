import React, { useMemo } from 'react';
import _ from 'lodash';

const ITEMS_PER_PAGE = 12;

const DRIVER_COLORS = ['#2563EB', '#EA580C'];

const LabelTemplate = ({ data }) => {
  if (!data) return null;

  const pages = useMemo(() => {
    if (data.items.length === 0) return [[]];
    return _.chunk(data.items, ITEMS_PER_PAGE);
  }, [data.items]);

  const hasWeights = data.items.some((i) => i.weight);
  const driverInfo = data.driverInfo || null;
  const driverColor = driverInfo ? DRIVER_COLORS[(driverInfo.driverNum - 1) % DRIVER_COLORS.length] : null;

  // Clean delivery date — strip newlines
  const deliveryDate = (data.deliveryDate || '').replace(/\n/g, ' ').trim();

  return (
    <div className="flex flex-col gap-4 print:block">
      {pages.map((pageItems, pageIndex) => (
        <div
          key={pageIndex}
          className="label-page bg-white border border-gray-200 shadow-sm print:shadow-none print:border-none relative flex flex-col"
          style={{
            width: '4in',
            height: '3in',
            paddingTop: '0.12in',
            paddingLeft: '0.22in',
            paddingRight: '0.15in',
            paddingBottom: '0.12in',
            boxSizing: 'border-box',
            pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto',
          }}
        >
          {/* Driver badge — top-right corner, first page only */}
          {driverInfo && pageIndex === 0 && (
            <div
              style={{
                position: 'absolute',
                top: '0.1in',
                right: '0.1in',
                backgroundColor: driverColor,
                color: 'white',
                fontSize: '8px',
                fontWeight: 'bold',
                padding: '1px 5px',
                borderRadius: '3px',
                lineHeight: '1.4',
              }}
            >
              Driver {driverInfo.driverNum} · Stop {driverInfo.stopNum}/{driverInfo.totalStops}
            </div>
          )}

          {/* Header row */}
          <div
            className="flex justify-between items-baseline font-sans"
            style={{ fontSize: '10px', marginBottom: '2px', lineHeight: '1.2' }}
          >
            <span className="font-medium">{deliveryDate}</span>
            <span className="font-medium" style={{ marginRight: driverInfo ? '1.1in' : '0' }}>
              Ord: {data.orderId}
            </span>
          </div>

          {/* Address block */}
          <div
            className="font-sans border-b border-black"
            style={{ marginBottom: '3px', paddingBottom: '3px', lineHeight: '1.25' }}
          >
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '1px' }}>{data.customerName}</div>
            <div style={{ fontSize: '10px' }}>{data.street}</div>
            <div style={{ fontSize: '10px' }}>
              {data.city}, {data.state} {data.zip}
              {data.phone ? <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 'bold' }}>{data.phone}</span> : null}
            </div>
            {data.deliveryNote && (
              <div
                style={{
                  fontSize: '9px',
                  fontStyle: 'italic',
                  marginTop: '1px',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
                title={data.deliveryNote}
              >
                Note: {data.deliveryNote}
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="flex-grow overflow-hidden">
            <table className="w-full text-left font-sans table-fixed" style={{ fontSize: '10px' }}>
              <thead>
                <tr className="border-b border-black">
                  <th style={{ width: hasWeights ? '75%' : '85%', padding: '1px 2px 1px 0' }}>Item</th>
                  <th style={{ width: '10%', padding: '1px 2px', textAlign: 'center' }}>Qty</th>
                  {hasWeights && (
                    <th style={{ width: '15%', padding: '1px 2px', textAlign: 'right' }}>Wt</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td
                      style={{ padding: '1px 2px 1px 0', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: '500' }}
                      title={item.name}
                    >
                      {item.name}
                    </td>
                    <td style={{ padding: '1px 2px', textAlign: 'center' }}>{item.qty}</td>
                    {hasWeights && (
                      <td style={{ padding: '1px 2px', textAlign: 'right' }}>
                        {item.weight || ''}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Page indicator */}
          {pages.length > 1 && (
            <div style={{ position: 'absolute', bottom: '4px', right: '6px', fontSize: '8px', color: '#9CA3AF' }}>
              {pageIndex + 1}/{pages.length}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default LabelTemplate;
