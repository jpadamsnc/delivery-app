import React, { useCallback } from 'react';
import { Upload } from 'lucide-react';

const FileUpload = ({ onFileUpload }) => {
    const handleDrop = (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            onFileUpload(files[0]);
        }
    };

    const handleChange = (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            onFileUpload(files[0]);
        }
    };

    return (
        <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors cursor-pointer bg-white"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('fileInput').click()}
        >
            <input
                type="file"
                id="fileInput"
                accept="*/*"
                onChange={handleChange}
                onClick={(e) => e.stopPropagation()}
                className="hidden"
            />
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-700">Drop your packing list here</p>
            <p className="text-sm text-gray-500 mt-2">CSV or ZIP file · click to browse</p>
        </div>
    );
};

export default FileUpload;
