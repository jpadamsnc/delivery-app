import React, { useMemo } from 'react';
import _ from 'lodash';

const ITEMS_PER_PAGE = 4;

const LabelTemplate = ({ data }) => {
    if (!data) return null;

    // Split items into chunks for pagination
    const pages = useMemo(() => {
        if (data.items.length === 0) return [[]];
        return _.chunk(data.items, ITEMS_PER_PAGE);
    }, [data.items]);

    return (
        <div className="flex flex-col gap-4 print:block">
            {pages.map((pageItems, pageIndex) => (
                <div
                    key={pageIndex}
                    className="label-page bg-white border border-gray-200 shadow-sm print:shadow-none print:border-none relative flex flex-col"
                    style={{
                        width: '4in',
                        height: '3in',
                        paddingTop: '0.15in',
                        paddingLeft: '0.15in',
                        paddingRight: '0.2in',
                        paddingBottom: '0.2in',
                        boxSizing: 'border-box',
                        pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto'
                    }}
                >
                    {/* Header */}
                    {/* Header */}
                    <div className="flex justify-between items-baseline font-sans text-xs" style={{ marginBottom: '2px', lineHeight: '1.2' }}>
                        <div className="font-medium">Delivery: {data.deliveryDate}</div>
                        <div className="font-medium">Ord: {data.orderId}</div>
                    </div>

                    <div className="font-sans border-b border-black" style={{ marginBottom: '4px', paddingBottom: '2px', lineHeight: '1.1' }}>
                        <h1 className="text-sm font-bold truncate" style={{ marginBottom: '1px' }}>{data.customerName}</h1>
                        <div className="text-xs truncate">{data.deliveryType}</div>
                        <div className="text-xs truncate">{data.street}</div>
                        <div className="text-xs truncate">{data.city} {data.state} {data.zip}</div>
                    </div>

                    {/* Items Table - Takes remaining space */}
                    <div className="flex-grow">
                        <table className="w-full text-left font-sans text-xs table-fixed">
                            <thead>
                                <tr className="border-b border-black">
                                    <th className="py-0.5 w-2/3 truncate">Item</th>
                                    <th className="py-0.5 w-1/6 text-center">Qty</th>
                                    <th className="py-0.5 w-1/6 truncate">Unit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageItems.map((item, index) => (
                                    <tr key={index} className="border-b border-gray-100">
                                        <td className="py-0.5 pr-1 truncate align-top font-medium" title={item.name}>
                                            {item.name}
                                        </td>
                                        <td className="py-0.5 px-0 align-top text-center">{item.qty}</td>
                                        <td className="py-0.5 pl-1 truncate align-top">{item.unit}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Page Indicator if multiple */}
                    {pages.length > 1 && (
                        <div className="absolute bottom-1 right-1 text-[10px] text-gray-500">
                            {pageIndex + 1}/{pages.length}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default LabelTemplate;
