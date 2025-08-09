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
    scalingMode: 'average' as 'average' | 'maxPrice' | 'percentile' | 'cityMedian',
    maxIntensity: 3 // Reduced from 5
  });

  
  // Function to calculate percentile value
  const calculatePercentile = (values: number[], percentile: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  };

  // Function to calculate median value
  const calculateMedian = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 
      ? sorted[mid] 
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  // Function to group properties by city and calculate medians
  const calculateCityMedians = (properties: any[]) => {
    const cityGroups: { [city: string]: number[] } = {};
    
    // Group properties by municipality
    properties.forEach(property => {
      const city = property.municipality || 'Unknown';
      if (!cityGroups[city]) {
        cityGroups[city] = [];
      }
      cityGroups[city].push(property.price);
    });

    // Calculate median for each city
    const cityMedians: { [city: string]: number } = {};
    Object.keys(cityGroups).forEach(city => {
      cityMedians[city] = calculateMedian(cityGroups[city]);
    });

    return cityMedians;
  };

  // Function to calculate scaling reference based on mode
  const getScalingReference = (values: number[], mode: string) => {
    switch (mode) {
      case 'maxPrice':
        return Math.max(...values);
      case 'percentile':
        return calculatePercentile(values, 95); // 95th percentile
      case 'average':
      default:
        return values.reduce((sum, price) => sum + price, 0) / values.length;
    }
  };

  // Function to calculate weight based on mode
  const calculateWeight = (property: any, scalingReference: number, avgPricePerM2: number, weightMode: string, scalingMode: string, cityMedians?: { [city: string]: number }) => {
    switch (weightMode) {
      case 'pricePerM2':
        if (!property.size || property.size <= 0) return 1; // Default for missing size
        const pricePerM2 = property.price / property.size;
        const pricePerM2Ratio = pricePerM2 / avgPricePerM2;
        return calculateWeightFromRatio(pricePerM2Ratio, scalingMode);
        
      case 'density':
        // For density mode, all properties get equal weight (1) 
        // The heatmap will show clustering based on geographic concentration
        return 1;
        
      case 'price':
      default:
        let referencePrice = scalingReference;
        
        // For city median mode, use the property's city median as reference
        if (scalingMode === 'cityMedian' && cityMedians) {
          const propertyCity = property.municipality || 'Unknown';
          referencePrice = cityMedians[propertyCity] || scalingReference; // fallback to overall reference
        }
        
        const priceRatio = property.price / referencePrice;
        return calculateWeightFromRatio(priceRatio, scalingMode);
    }
  };

  // Function to calculate weight from ratio based on scaling mode
  const calculateWeightFromRatio = (ratio: number, scalingMode: string) => {
    if (scalingMode === 'maxPrice') {
      // For max price mode, only the maximum gets weight 10, others scale proportionally
      return Math.min(10, Math.max(0.1, ratio * 10));
    } else if (scalingMode === 'percentile') {
      // For percentile mode, 95th percentile gets weight 10
      if (ratio >= 1.0) return 10; // At or above 95th percentile
      if (ratio >= 0.8) return 7;
      if (ratio >= 0.6) return 5;
      if (ratio >= 0.4) return 3;
      if (ratio >= 0.2) return 2;
      return 1;
    } else if (scalingMode === 'cityMedian') {
      // For city median mode, use median as reference point (similar to average)
      if (ratio >= 2.0) return 10; // 2x city median = very expensive for that city
      if (ratio >= 1.5) return 7;  // 1.5x city median = expensive for that city
      if (ratio >= 1.2) return 5;  // 1.2x city median = above median for that city
      if (ratio >= 0.8) return 3;  // Around city median
      if (ratio >= 0.5) return 2;  // Below city median
      return 1;                    // Well below city median
    } else {
      // For average mode (original logic)
      if (ratio >= 2.0) return 10;
      if (ratio >= 1.5) return 7;
      if (ratio >= 1.2) return 5;
      if (ratio >= 0.8) return 3;
      if (ratio >= 0.5) return 2;
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

      // Calculate reference values for scaling
      const prices = validProperties.map(property => property.price);
      const scalingReference = getScalingReference(prices, heatmapSettings.scalingMode);
      
      // Calculate city medians for city median mode
      const cityMedians = heatmapSettings.scalingMode === 'cityMedian' 
        ? calculateCityMedians(validProperties) 
        : undefined;
      
      const pricesPerM2 = validProperties
        .filter(property => property.size && property.size > 0)
        .map(property => property.price / property.size);
      const avgPricePerM2 = pricesPerM2.length > 0 
        ? pricesPerM2.reduce((sum, price) => sum + price, 0) / pricesPerM2.length 
        : scalingReference / 50; // fallback estimate

      // Log scaling info for debugging
      console.log(`Scaling mode: ${heatmapSettings.scalingMode}, Reference: €${scalingReference.toLocaleString()}`);
      if (cityMedians) {
        console.log('City medians:', Object.entries(cityMedians).map(([city, median]) => 
          `${city}: €${median.toLocaleString()}`
        ).join(', '));
      }

      const heatmapData = validProperties.map(property => {
        const weight = calculateWeight(property, scalingReference, avgPricePerM2, heatmapSettings.weightMode, heatmapSettings.scalingMode, cityMedians);
        
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