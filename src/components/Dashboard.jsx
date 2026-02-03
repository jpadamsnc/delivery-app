import React, { useState } from 'react';
import { Download, Printer, Search, X, Package, MapPin, Calendar, ArrowUpRight } from 'lucide-react';
import { exportToCSV, generateVamoData, prepareLabelData } from '../utils/csvProcessor';
import LabelTemplate from './LabelTemplate';
import { format } from 'date-fns';

const Dashboard = ({ data, onReset }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrderForPrint, setSelectedOrderForPrint] = useState(null);

    const vamoData = generateVamoData(data);
    const labelData = prepareLabelData(data);

    const filteredOrders = labelData.filter(order =>
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.orderId.includes(searchTerm)
    );

    const uniqueLocations = [...new Set(labelData.map(o => o.deliveryType))];
    const totalItems = labelData.reduce((acc, curr) => acc + curr.items.length, 0);

    const handleExport = () => {
        const filename = `VAMO_Upload_${format(new Date(), 'MM-dd-yyyy')}.csv`;
        exportToCSV(vamoData, filename);
    };

    const handlePrint = (order) => {
        setSelectedOrderForPrint(order);
        setTimeout(() => {
            window.print();
        }, 100);
    };

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-8 font-sans text-gray-900">
            {/* Header Stats & Actions */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 text-gray-500 mb-2">
                        <Package size={20} />
                        <span className="text-sm font-medium">Total Orders</span>
                    </div>
                    <div className="text-3xl font-bold text-gray-900">{labelData.length}</div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 text-gray-500 mb-2">
                        <ArrowUpRight size={20} />
                        <span className="text-sm font-medium">Total Items</span>
                    </div>
                    <div className="text-3xl font-bold text-blue-600">{totalItems}</div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm md:col-span-2 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="font-semibold text-lg">Quick Actions</h2>
                            <p className="text-gray-500 text-sm">Manage your current session</p>
                        </div>
                        <button
                            onClick={onReset}
                            className="text-sm text-red-600 hover:text-red-700 font-medium bg-red-50 hover:bg-red-100 px-3 py-1 rounded transition-colors"
                        >
                            Reset Session
                        </button>
                    </div>

                    <div className="flex justify-end mt-4">
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-black transition-all shadow-md active:scale-95"
                        >
                            <Download size={18} />
                            <span>Export VAMO CSV</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Table Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:hidden">
                {/* Toolbar */}
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search customers, orders..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>
                    <div className="text-sm text-gray-500 font-medium">
                        Showing {filteredOrders.length} orders
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                <th className="px-6 py-4">Order Details</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Location</th>
                                <th className="px-6 py-4 text-center">Items</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                                        No orders found matching "{searchTerm}"
                                    </td>
                                </tr>
                            ) : (
                                filteredOrders.map((order) => (
                                    <tr key={order.orderId} className="hover:bg-gray-50/80 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                                    <Package size={18} />
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-gray-900">#{order.orderId}</div>
                                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                                        <Calendar size={12} />
                                                        {order.deliveryDate}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900">{order.customerName}</div>
                                            <div className="text-sm text-gray-500 truncate max-w-[200px]">{order.street}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${order.deliveryType.includes('Local')
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {order.deliveryType}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="inline-flex flex-col items-center justify-center min-w-[3rem]">
                                                <span className="text-lg font-bold text-gray-700">{order.items.length}</span>
                                                <span className="text-[10px] text-gray-400 uppercase">Count</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handlePrint(order)}
                                                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm font-medium"
                                            >
                                                <Printer size={16} />
                                                Print
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Print Overlay / Modal */}
            {selectedOrderForPrint && (
                <div className="fixed inset-0 z-50 bg-white flex items-center justify-center print-area">
                    {/* Close button for when we are done printing and want to go back, hidden in print */}
                    <div className="fixed top-4 right-4 print:hidden">
                        <button
                            onClick={() => setSelectedOrderForPrint(null)}
                            className="p-2 bg-gray-800 text-white rounded-full hover:bg-gray-700 shadow-lg"
                        >
                            <X size={24} />
                        </button>
                        <div className="mt-2 text-center text-sm bg-yellow-100 p-2 rounded shadow text-yellow-800">
                            Press ESC or click X to return
                        </div>
                    </div>

                    <div className="print-area h-full w-full flex flex-col items-center justify-center overflow-auto">
                        <LabelTemplate data={selectedOrderForPrint} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
