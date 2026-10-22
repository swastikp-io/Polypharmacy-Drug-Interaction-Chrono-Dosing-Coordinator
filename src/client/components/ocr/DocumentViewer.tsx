import React, { useState } from 'react';
import {
  FileText,
  Layers,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { OCRDocumentResult } from '../../../shared/ocrTypes.js';
import { api } from '../../api/apiClient.js';

interface DocumentViewerProps {
  document: OCRDocumentResult;
  selectedLineIndex?: number | null;
  selectedPageNumber?: number;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  selectedLineIndex,
  selectedPageNumber = 1,
}) => {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [viewMode, setViewMode] = useState<'source' | 'ocr_layer'>('source');

  const previewUrl = api.getDocumentPreviewUrl(document.documentId);
  const isImage = document.fileType.startsWith('image/');
  const currentPage = document.pages.find((p) => p.pageNumber === selectedPageNumber) || document.pages[0];

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(200, prev + 20));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(60, prev - 20));
  const handleResetZoom = () => setZoomLevel(100);

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-md flex flex-col h-[750px] overflow-hidden text-slate-100">
      {/* Top Controls Header */}
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 truncate">
          <FileText className="w-4 h-4 text-clinical-400 flex-shrink-0" aria-hidden="true" />
          <span className="font-bold text-slate-200 truncate">{document.fileName}</span>
          <span className="text-2xs text-slate-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
            {document.fileType.split('/')[1]?.toUpperCase() || 'DOC'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="bg-slate-800 p-0.5 rounded-lg flex items-center text-2xs">
            <button
              type="button"
              onClick={() => setViewMode('source')}
              className={`px-2 py-1 rounded font-semibold transition-colors ${
                viewMode === 'source' ? 'bg-clinical-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Document
            </button>
            <button
              type="button"
              onClick={() => setViewMode('ocr_layer')}
              className={`px-2 py-1 rounded font-semibold transition-colors flex items-center gap-1 ${
                viewMode === 'ocr_layer' ? 'bg-clinical-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3 h-3" aria-hidden="true" />
              OCR Layer
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
            <button
              type="button"
              onClick={handleZoomOut}
              aria-label="Zoom out"
              title="Zoom out"
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            >
              <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <span className="text-2xs font-mono w-10 text-center">{zoomLevel}%</span>
            <button
              type="button"
              onClick={handleZoomIn}
              aria-label="Zoom in"
              title="Zoom in"
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            >
              <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              aria-label="Reset zoom"
              title="Reset zoom"
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/40 relative">
        <div
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
          className="transition-transform duration-150 max-w-full"
        >
          {viewMode === 'source' ? (
            isImage ? (
              <div className="relative inline-block rounded-lg shadow-2xl overflow-hidden border border-slate-700 bg-white">
                <img
                  src={previewUrl}
                  alt={`Source prescription document: ${document.fileName}`}
                  className="max-w-md w-full h-auto object-contain block"
                  onError={() => {
                    // Fallback to text view if image preview fails
                    setViewMode('ocr_layer');
                  }}
                />

                {/* Bounding box highlight overlay if line index is selected */}
                {currentPage && selectedLineIndex && (
                  <div className="absolute inset-0 pointer-events-none">
                    {currentPage.lines.map((l) => {
                      if (l.lineIndex !== selectedLineIndex || !l.boundingBox) return null;
                      return (
                        <div
                          key={l.lineIndex}
                          style={{
                            left: `${l.boundingBox.x}px`,
                            top: `${l.boundingBox.y}px`,
                            width: `${l.boundingBox.width}px`,
                            height: `${l.boundingBox.height}px`,
                          }}
                          className="absolute border-2 border-amber-400 bg-amber-400/20 rounded animate-pulse shadow-sm"
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-[480px] min-h-[580px] bg-white text-slate-900 rounded-lg p-6 shadow-2xl border border-slate-300 font-serif space-y-4">
                <div className="border-b-2 border-slate-800 pb-3 text-center">
                  <h3 className="font-bold text-base tracking-wide uppercase">Medical Prescription</h3>
                  <p className="text-2xs text-slate-500 font-sans">
                    PDF Electronic Document • Embedded Text View
                  </p>
                </div>

                <div className="space-y-2 font-mono text-xs leading-relaxed">
                  {currentPage?.lines.map((line) => {
                    const isSelected = line.lineIndex === selectedLineIndex;
                    return (
                      <div
                        key={line.lineIndex}
                        className={`p-1.5 rounded transition-colors ${
                          isSelected
                            ? 'bg-amber-100 border-l-4 border-amber-500 font-bold text-slate-950'
                            : 'hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-slate-400 select-none mr-2">{line.lineIndex}.</span>
                        <span>{line.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            /* OCR Layer Raw Bounding Inspection */
            <div className="w-[480px] min-h-[580px] bg-slate-900 text-slate-100 rounded-lg p-5 shadow-2xl border border-slate-700 font-mono text-xs space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-2xs text-slate-400">
                <span>OCR Extracted Text Streams</span>
                <span>Page {selectedPageNumber} of {document.pageCount}</span>
              </div>

              <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                {currentPage?.lines.map((l) => {
                  const isSelected = l.lineIndex === selectedLineIndex;
                  return (
                    <div
                      key={l.lineIndex}
                      className={`p-2 rounded text-2xs transition-all ${
                        isSelected
                          ? 'bg-clinical-950/80 border border-clinical-500 text-clinical-200'
                          : 'bg-slate-800/60 border border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-slate-400 mb-1">
                        <span className="font-bold">Line {l.lineIndex}</span>
                        <span
                          className={`font-semibold px-1 rounded ${
                            l.confidence >= 0.85
                              ? 'text-emerald-400'
                              : l.confidence >= 0.65
                                ? 'text-amber-400'
                                : 'text-red-400'
                          }`}
                        >
                          {Math.round(l.confidence * 100)}% conf
                        </span>
                      </div>
                      <div className="text-slate-100">{l.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Document Metadata Footer */}
      <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-2xs text-slate-400">
        <div>
          <span>Engine: <strong>{document.engineName}</strong></span>
        </div>
        <div className="flex items-center gap-3">
          <span>Overall Confidence: <strong>{Math.round(document.overallConfidence * 100)}%</strong></span>
          <span>•</span>
          <span>Lines: <strong>{currentPage?.lines.length || 0}</strong></span>
        </div>
      </div>
    </div>
  );
};
