'use client';

import { useState } from 'react';
import ToggleSwitch from './ToggleSwitch';

interface LayerControlPanelProps {
  heatmapEnabled: boolean;
  onHeatmapToggle: (enabled: boolean) => void;
  propertyCount: number;
}

const LayerControlPanel = ({ heatmapEnabled, onHeatmapToggle, propertyCount }: LayerControlPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="absolute top-4 right-4 z-20">
      <div className={`
        bg-white rounded-lg shadow-lg border border-gray-200 transition-all duration-300 ease-in-out
        ${isExpanded ? 'w-72' : 'w-12'}
      `}>
        {/* Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`
            p-3 rounded-lg hover:bg-gray-50 transition-colors duration-200 w-full
            ${isExpanded ? 'border-b border-gray-200' : ''}
          `}
          aria-label={isExpanded ? 'Collapse layer panel' : 'Expand layer panel'}
        >
          <div className="flex items-center justify-center">
            <svg
              className={`w-5 h-5 text-gray-600 transition-transform duration-300 ${
                isExpanded ? 'rotate-180' : 'rotate-0'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Panel Content */}
        <div className={`
          overflow-hidden transition-all duration-300 ease-in-out
          ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
        `}>
          <div className="p-4 space-y-4">
            {/* Header */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Map Layers</h3>
              <p className="text-sm text-gray-500">{propertyCount} properties loaded</p>
            </div>

            {/* Layer Controls */}
            <div className="space-y-3">
              <div className="border-t border-gray-200 pt-3">
                <ToggleSwitch
                  enabled={heatmapEnabled}
                  onChange={onHeatmapToggle}
                  label="Property Heatmap"
                  description="Show property density with Gaussian blur"
                />
              </div>

              {/* Future layers can be added here */}
              <div className="border-t border-gray-200 pt-3">
                <div className="text-xs text-gray-400 text-center py-2">
                  More layers coming soon...
                </div>
              </div>
            </div>

            {/* Legend */}
            {heatmapEnabled && (
              <div className="border-t border-gray-200 pt-3">
                <div className="text-sm font-medium text-gray-900 mb-2">Price Comparison</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                    <span className="text-xs text-gray-600">Very cheap (&lt;50% avg)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
                    <span className="text-xs text-gray-600">Below average</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    <span className="text-xs text-gray-600">Around average</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                    <span className="text-xs text-gray-600">Above average</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    <span className="text-xs text-gray-600">Expensive</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span className="text-xs text-gray-600">Very expensive (2x+ avg)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayerControlPanel;