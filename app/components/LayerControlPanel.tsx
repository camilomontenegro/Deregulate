'use client';

import { useState } from 'react';
import ToggleSwitch from './ToggleSwitch';

interface LayerControlPanelProps {
  heatmapEnabled: boolean;
  onHeatmapToggle: (enabled: boolean) => void;
  markersEnabled: boolean;
  onMarkersToggle: (enabled: boolean) => void;
  propertyCount: number;
  heatmapSettings?: {
    radius: number;
    opacity: number;
    weightMode: 'price' | 'pricePerM2' | 'density';
    maxIntensity: number;
  };
  onHeatmapSettingsChange?: (settings: any) => void;
}

const LayerControlPanel = ({ 
  heatmapEnabled, 
  onHeatmapToggle, 
  markersEnabled, 
  onMarkersToggle, 
  propertyCount,
  heatmapSettings,
  onHeatmapSettingsChange 
}: LayerControlPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSettingChange = (key: string, value: any) => {
    if (heatmapSettings && onHeatmapSettingsChange) {
      onHeatmapSettingsChange({
        ...heatmapSettings,
        [key]: value
      });
    }
  };

  return (
    <div className="absolute top-4 right-4 z-20 max-h-screen">
      <div className={`
        bg-white rounded-lg shadow-lg border border-gray-200 transition-all duration-300 ease-in-out
        ${isExpanded ? 'w-80' : 'w-12'}
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
          transition-all duration-300 ease-in-out
          ${isExpanded ? 'max-h-[80vh] opacity-100' : 'max-h-0 opacity-0'}
        `}>
          <div className="overflow-y-auto max-h-[75vh]">
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
                  enabled={markersEnabled}
                  onChange={onMarkersToggle}
                  label="Property Markers"
                  description="Show individual property markers with clustering"
                />
              </div>

              <div className="border-t border-gray-200 pt-3">
                <ToggleSwitch
                  enabled={heatmapEnabled}
                  onChange={onHeatmapToggle}
                  label="Property Heatmap"
                  description="Show property density with Gaussian blur"
                />

                {/* Heatmap Settings */}
                {heatmapEnabled && heatmapSettings && (
                  <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-100">
                    {/* Radius Control */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Radius: {heatmapSettings.radius}px
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={heatmapSettings.radius}
                        onChange={(e) => handleSettingChange('radius', parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    {/* Opacity Control */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Opacity: {Math.round(heatmapSettings.opacity * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.1"
                        value={heatmapSettings.opacity}
                        onChange={(e) => handleSettingChange('opacity', parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    {/* Weight Mode */}
                    <div className="relative">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Weight Mode
                      </label>
                      <select
                        value={heatmapSettings.weightMode}
                        onChange={(e) => handleSettingChange('weightMode', e.target.value)}
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1 relative z-10"
                      >
                        <option value="price">Price</option>
                        <option value="pricePerM2">Price per m²</option>
                        <option value="density">Property Density</option>
                      </select>
                    </div>

                    {/* Max Intensity */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Max Intensity: {heatmapSettings.maxIntensity}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={heatmapSettings.maxIntensity}
                        onChange={(e) => handleSettingChange('maxIntensity', parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                )}
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
    </div>
  );
};

export default LayerControlPanel;