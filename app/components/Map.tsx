'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { createClient } from '@supabase/supabase-js';
import LayerControlPanel from './LayerControlPanel';
import { useHeatMap } from './hooks/useHeatMap';
import { useMap } from './hooks/useMap';
/// <reference types="@types/google.maps" />





const Map = () => {
  const {mapRef, mapInstanceRef, properties, isClient, loading, heatmapRef} = useMap();
  const {heatmapEnabled, setHeatmapEnabled, heatmapRef: heatmapRef2} = useHeatMap({mapInstanceRef, ref: heatmapRef});

  

  // Handle heatmap toggle
  

  // Update heatmap data when properties change - using existing Supabase data only
  useEffect(() => {
    if (heatmapRef2.current && properties.length > 0) {
      const validProperties = properties.filter(property => 
        property.latitude && property.longitude && property.price > 0
      );
      
      if (validProperties.length === 0) return;

      // Recalculate average price from current data
      const prices = validProperties.map(property => property.price);
      const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;

      const heatmapData = validProperties.map(property => {
        const priceRatio = property.price / avgPrice;
        
        // Same weight logic as initialization for consistency
        let weight;
        if (priceRatio >= 2.0) {
          weight = 10; // Very expensive = hot red
        } else if (priceRatio >= 1.5) {
          weight = 7; // Expensive = orange
        } else if (priceRatio >= 1.2) {
          weight = 5; // Above average = yellow
        } else if (priceRatio >= 0.8) {
          weight = 3; // Around average = green
        } else if (priceRatio >= 0.5) {
          weight = 1; // Below average = cyan
        } else {
          weight = 0.1; // Very cheap = blue/transparent
        }
        
        return {
          location: new google.maps.LatLng(property.latitude, property.longitude),
          weight: weight
        };
      });

      heatmapRef2.current.setData(heatmapData);
    }
  }, [properties]);

  const handleHeatmapToggle = (enabled: boolean) => {
    setHeatmapEnabled(enabled);
  };

  // Don't render anything until client-side to prevent hydration issues
  if (!isClient) {
    return (
      <div className="relative" style={{ width: '100%', height: '500px' }}>
        <div className="absolute top-4 left-4 bg-white px-3 py-2 rounded-lg shadow-lg z-10">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <span className="text-sm">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Loading Indicator */}
      {loading && (
        <div className="absolute top-4 left-4 bg-white px-3 py-2 rounded-lg shadow-lg z-10">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <span className="text-sm">Loading properties...</span>
          </div>
        </div>
      )}
      
      {/* Property Legend */}
      {!loading && properties.length > 0 && !heatmapEnabled && (
        <div className="absolute top-4 left-4 bg-white px-3 py-2 rounded-lg shadow-lg z-10">
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span>Sale</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>Rent</span>
            </div>
            <span className="text-gray-600">• {properties.length} properties</span>
          </div>
        </div>
      )}

      {/* Layer Control Panel */}
      <LayerControlPanel
        heatmapEnabled={heatmapEnabled}
        onHeatmapToggle={handleHeatmapToggle}
        propertyCount={properties.length}
      />

      {/* Map Container */}
      <div 
        ref={mapRef} 
        style={{ 
          width: '100%', 
          height: '500px',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }} 
      />
    </div>
  );
};

export default Map;