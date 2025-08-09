'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { createClient } from '@supabase/supabase-js';
import LayerControlPanel from './LayerControlPanel';
import { useHeatMap } from './hooks/useHeatMap';
import { useMap } from './hooks/useMap';
/// <reference types="@types/google.maps" />





const Map = () => {
  const {mapRef, mapInstanceRef, properties, isClient, loading, heatmapRef, toggleMarkers} = useMap();
  const {heatmapEnabled, setHeatmapEnabled, heatmapRef: heatmapRef2} = useHeatMap({mapInstanceRef, ref: heatmapRef});
  const [markersEnabled, setMarkersEnabled] = useState(false);
  const [heatmapSettings, setHeatmapSettings] = useState({
    radius: 25, // Reduced from 50
    opacity: 0.5, // Reduced from 0.8
    weightMode: 'price' as 'price' | 'pricePerM2' | 'density',
    maxIntensity: 3 // Reduced from 5
  });

  
  // Function to calculate weight based on mode
  const calculateWeight = (property: any, avgPrice: number, avgPricePerM2: number, weightMode: string) => {
    switch (weightMode) {
      case 'pricePerM2':
        if (!property.size || property.size <= 0) return 1; // Default for missing size
        const pricePerM2 = property.price / property.size;
        const pricePerM2Ratio = pricePerM2 / avgPricePerM2;
        
        if (pricePerM2Ratio >= 2.0) return 10;
        if (pricePerM2Ratio >= 1.5) return 7;
        if (pricePerM2Ratio >= 1.2) return 5;
        if (pricePerM2Ratio >= 0.8) return 3;
        if (pricePerM2Ratio >= 0.5) return 2;
        return 1;
        
      case 'density':
        // For density mode, all properties get equal weight (1) 
        // The heatmap will show clustering based on geographic concentration
        return 1;
        
      case 'price':
      default:
        const priceRatio = property.price / avgPrice;
        if (priceRatio >= 2.0) return 10;
        if (priceRatio >= 1.5) return 7;
        if (priceRatio >= 1.2) return 5;
        if (priceRatio >= 0.8) return 3;
        if (priceRatio >= 0.5) return 2;
        return 1;
    }
  };

  // Handle heatmap toggle
  

  // Update heatmap data when properties change - using existing Supabase data only
  useEffect(() => {
    if (heatmapRef2.current && properties.length > 0) {
      const validProperties = properties.filter(property => 
        property.latitude && property.longitude && property.price > 0
      );
      
      if (validProperties.length === 0) return;

      // Calculate averages for both price and price per m²
      const prices = validProperties.map(property => property.price);
      const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      
      const pricesPerM2 = validProperties
        .filter(property => property.size && property.size > 0)
        .map(property => property.price / property.size);
      const avgPricePerM2 = pricesPerM2.length > 0 
        ? pricesPerM2.reduce((sum, price) => sum + price, 0) / pricesPerM2.length 
        : avgPrice / 50; // fallback estimate

      const heatmapData = validProperties.map(property => {
        const weight = calculateWeight(property, avgPrice, avgPricePerM2, heatmapSettings.weightMode);
        
        return {
          location: new google.maps.LatLng(property.latitude, property.longitude),
          weight: weight
        };
      });

      heatmapRef2.current.setData(heatmapData);
      
      // Update heatmap settings
      heatmapRef2.current.setOptions({
        radius: heatmapSettings.radius,
        opacity: heatmapSettings.opacity,
        maxIntensity: heatmapSettings.maxIntensity
      });
    }
  }, [properties, heatmapSettings]);

  const handleHeatmapToggle = (enabled: boolean) => {
    setHeatmapEnabled(enabled);
  };

  const handleMarkersToggle = (enabled: boolean) => {
    setMarkersEnabled(enabled);
    toggleMarkers(enabled);
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
      {!loading && properties.length > 0 && markersEnabled && !heatmapEnabled && (
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
        markersEnabled={markersEnabled}
        onMarkersToggle={handleMarkersToggle}
        propertyCount={properties.length}
        heatmapSettings={heatmapSettings}
        onHeatmapSettingsChange={setHeatmapSettings}
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