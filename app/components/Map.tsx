'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createClient } from '@supabase/supabase-js';
import LayerControlPanel from './LayerControlPanel';
import { useHeatMap } from './hooks/useHeatMap';
import { useMap } from './hooks/useMap';





const Map = () => {
  const {mapRef, mapInstanceRef, properties, isClient, loading, heatmapRef, toggleMarkers, totalPropertiesCount, loadingMore, allChunksLoaded, loadNextChunk} = useMap();
  const {heatmapEnabled, setHeatmapEnabled, heatmapRef: heatmapRef2} = useHeatMap({mapInstanceRef, ref: heatmapRef});
  const [markersEnabled, setMarkersEnabled] = useState(false);
  const [heatmapSettings, setHeatmapSettings] = useState({
    radius: 25, // Reduced from 50
    opacity: 0.5, // Reduced from 0.8
    weightMode: 'price' as 'price' | 'pricePerM2' | 'density',
    scalingMode: 'average' as 'average' | 'maxPrice' | 'percentile' | 'cityMedian' | 'minMax',
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
      case 'minMax':
        return {
          min: Math.min(...values),
          max: Math.max(...values)
        };
      case 'average':
      default:
        return values.reduce((sum, price) => sum + price, 0) / values.length;
    }
  };

  // Function to calculate weight based on mode
  const calculateWeight = (property: any, scalingReference: number | { min: number; max: number }, avgPricePerM2: number, weightMode: string, scalingMode: string, cityMedians?: { [city: string]: number }, pricePerM2Range?: { min: number; max: number }) => {
    switch (weightMode) {
      case 'pricePerM2':
        if (!property.size || property.size <= 0) return 1; // Default for missing size
        const pricePerM2 = property.price / property.size;
        
        // Handle minMax scaling for price per m2
        if (scalingMode === 'minMax' && pricePerM2Range) {
          const { min, max } = pricePerM2Range;
          
          if (max === min) {
            return 5; // Middle weight for uniform pricing per m2
          }
          
          const normalizedPricePerM2 = (pricePerM2 - min) / (max - min);
          
          // Top 1% get pink ultra-premium treatment
          if (normalizedPricePerM2 >= 0.99) {
            return 12; // Special weight for pink ultra-premium
          }
          
          return Math.max(0.1, Math.min(10, normalizedPricePerM2 * 10));
        }
        
        const pricePerM2Ratio = pricePerM2 / avgPricePerM2;
        return calculateWeightFromRatio(pricePerM2Ratio, scalingMode);
        
      case 'density':
        // For density mode, all properties get equal weight (1) 
        // The heatmap will show clustering based on geographic concentration
        return 1;
        
      case 'price':
      default:
        // Handle minMax scaling mode with direct normalization
        if (scalingMode === 'minMax' && typeof scalingReference === 'object') {
          const { min, max } = scalingReference;
          
          // Handle edge case where min === max (all properties same price)
          if (max === min) {
            return 5; // Middle weight for uniform pricing
          }
          
          // Min-max normalization: (value - min) / (max - min)
          const normalizedPrice = (property.price - min) / (max - min);
          
          // Top 1% get pink ultra-premium treatment
          if (normalizedPrice >= 0.99) {
            return 12; // Special weight for pink ultra-premium
          }
          
          // Scale to 0.1-10 range for heatmap weights
          return Math.max(0.1, Math.min(10, normalizedPrice * 10));
        }
        
        let referencePrice = typeof scalingReference === 'number' ? scalingReference : 0;
        
        // For city median mode, use the property's city median as reference
        if (scalingMode === 'cityMedian' && cityMedians) {
          const propertyCity = property.municipality || 'Unknown';
          referencePrice = cityMedians[propertyCity] || referencePrice; // fallback to overall reference
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
    console.log('Heatmap useEffect triggered:', { 
      hasHeatmapRef: !!heatmapRef2.current, 
      propertiesCount: properties.length, 
      heatmapEnabled 
    });
    
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
        : (typeof scalingReference === 'number' ? scalingReference : (scalingReference.min + scalingReference.max) / 2) / 50; // fallback estimate

      // Calculate price per m2 range for minMax mode
      const pricePerM2Range = heatmapSettings.scalingMode === 'minMax' && pricesPerM2.length > 0
        ? {
            min: Math.min(...pricesPerM2),
            max: Math.max(...pricesPerM2)
          }
        : undefined;

      // Log scaling info for debugging
      if (heatmapSettings.scalingMode === 'minMax' && typeof scalingReference === 'object') {
        console.log(`MinMax scaling mode: Price range €${scalingReference.min.toLocaleString()} - €${scalingReference.max.toLocaleString()}`);
        if (pricePerM2Range) {
          console.log(`Price per m² range: €${pricePerM2Range.min.toLocaleString()} - €${pricePerM2Range.max.toLocaleString()}`);
        }
      } else {
        console.log(`Scaling mode: ${heatmapSettings.scalingMode}, Reference: €${typeof scalingReference === 'number' ? scalingReference.toLocaleString() : 'N/A'}`);
      }
      if (cityMedians) {
        console.log('City medians:', Object.entries(cityMedians).map(([city, median]) => 
          `${city}: €${median.toLocaleString()}`
        ).join(', '));
      }

      // Create GeoJSON data for heatmap
      const heatmapGeoJSON = {
        type: 'FeatureCollection' as const,
        features: validProperties.map(property => {
          const weight = calculateWeight(property, scalingReference, avgPricePerM2, heatmapSettings.weightMode, heatmapSettings.scalingMode, cityMedians, pricePerM2Range);
          
          return {
            type: 'Feature' as const,
            properties: {
              weight: weight
            },
            geometry: {
              type: 'Point' as const,
              coordinates: [property.longitude, property.latitude]
            }
          };
        })
      };

      // Update or create heatmap layer
      const map = heatmapRef2.current.map;
      const layerId = heatmapRef2.current.layerId;
      const sourceId = 'heatmap-source';

      if (map.getSource(sourceId)) {
        // Update existing source
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(heatmapGeoJSON);
      } else {
        // Add source
        map.addSource(sourceId, {
          type: 'geojson',
          data: heatmapGeoJSON
        });

        // Add heatmap layer
        console.log('Creating heatmap layer:', layerId);
        map.addLayer({
          id: layerId,
          type: 'heatmap',
          source: sourceId,
          layout: {
            visibility: heatmapEnabled ? 'visible' : 'none'
          },
          paint: {
            // Use the weight property from our data
            'heatmap-weight': ['get', 'weight'],
            // Increase the heatmap color weight weight by zoom level
            'heatmap-intensity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 1,
              9, heatmapSettings.maxIntensity
            ],
            // Color ramp focusing on lower density ranges where data actually exists
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0, 0, 255, 0)',         // Transparent (no data)
              0.01, 'rgba(0, 0, 255, 0.1)',   // Very faint blue
              0.02, 'rgba(0, 0, 255, 0.15)',  // Light blue
              0.03, 'rgba(0, 0, 255, 0.2)',   // Light blue
              0.04, 'rgba(0, 0, 255, 0.25)',  // Light blue
              0.05, 'rgba(0, 0, 255, 0.3)',   // Light blue
              0.06, 'rgba(0, 50, 255, 0.35)', // Blue
              0.07, 'rgba(0, 100, 255, 0.4)', // Blue-cyan transition
              0.08, 'rgba(0, 150, 255, 0.45)', // Blue-cyan
              0.09, 'rgba(0, 200, 255, 0.5)', // Cyan-ish
              0.1, 'rgba(0, 255, 255, 0.55)', // Cyan
              0.12, 'rgba(0, 255, 200, 0.6)', // Cyan-green transition
              0.14, 'rgba(0, 255, 150, 0.65)', // Cyan-green
              0.16, 'rgba(0, 255, 100, 0.7)', // Green-cyan
              0.18, 'rgba(0, 255, 50, 0.75)', // Green
              0.2, 'rgba(0, 255, 0, 0.8)',    // Pure green
              0.25, 'rgba(100, 255, 0, 0.82)', // Green-yellow
              0.3, 'rgba(200, 255, 0, 0.85)', // Yellow-green
              0.35, 'rgba(255, 255, 0, 0.87)', // Yellow
              0.4, 'rgba(255, 200, 0, 0.9)', // Orange-yellow
              0.5, 'rgba(255, 150, 0, 0.92)', // Orange
              0.6, 'rgba(255, 100, 0, 0.95)', // Red-orange
              0.7, 'rgba(255, 50, 0, 0.97)',  // Red
              0.8, 'rgba(255, 0, 0, 0.98)',   // Red
              0.9, 'rgba(255, 20, 100, 0.99)', // Pink-red
              1, 'rgba(255, 20, 147, 1)'      // Pink (ultra-premium)
            ],
            // Adjust the heatmap radius by zoom level
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 2,
              9, heatmapSettings.radius
            ],
            // Transition from heatmap to circle layer by zoom level
            'heatmap-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              7, heatmapSettings.opacity,
              9, heatmapSettings.opacity * 0.5
            ]
          }
        });
        console.log('Heatmap layer created successfully:', layerId, 'Visible:', heatmapEnabled);
      }
      
      // Update heatmap paint properties
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, 'heatmap-radius', [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 2,
          9, heatmapSettings.radius
        ]);
        
        map.setPaintProperty(layerId, 'heatmap-opacity', [
          'interpolate',
          ['linear'],
          ['zoom'],
          7, heatmapSettings.opacity,
          9, heatmapSettings.opacity * 0.5
        ]);

        map.setPaintProperty(layerId, 'heatmap-intensity', [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 1,
          9, heatmapSettings.maxIntensity
        ]);

        // Update color gradient focusing on lower density ranges where data exists
        const colorGradient = heatmapSettings.scalingMode === 'minMax' 
          ? [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0, 0, 255, 0)',         // Transparent (no data)
              0.01, 'rgba(0, 0, 255, 0.1)',   // Very faint blue
              0.02, 'rgba(0, 0, 255, 0.15)',  // Light blue
              0.03, 'rgba(0, 0, 255, 0.2)',   // Light blue
              0.04, 'rgba(0, 0, 255, 0.25)',  // Light blue
              0.05, 'rgba(0, 0, 255, 0.3)',   // Light blue
              0.06, 'rgba(0, 50, 255, 0.35)', // Blue
              0.07, 'rgba(0, 100, 255, 0.4)', // Blue-cyan transition
              0.08, 'rgba(0, 150, 255, 0.45)', // Blue-cyan
              0.09, 'rgba(0, 200, 255, 0.5)', // Cyan-ish
              0.1, 'rgba(0, 255, 255, 0.55)', // Cyan
              0.12, 'rgba(0, 255, 200, 0.6)', // Cyan-green transition
              0.14, 'rgba(0, 255, 150, 0.65)', // Cyan-green
              0.16, 'rgba(0, 255, 100, 0.7)', // Green-cyan
              0.18, 'rgba(0, 255, 50, 0.75)', // Green
              0.2, 'rgba(0, 255, 0, 0.8)',    // Pure green
              0.25, 'rgba(100, 255, 0, 0.82)', // Green-yellow
              0.3, 'rgba(200, 255, 0, 0.85)', // Yellow-green
              0.35, 'rgba(255, 255, 0, 0.87)', // Yellow
              0.4, 'rgba(255, 200, 0, 0.9)', // Orange-yellow
              0.5, 'rgba(255, 150, 0, 0.92)', // Orange
              0.6, 'rgba(255, 100, 0, 0.95)', // Red-orange
              0.7, 'rgba(255, 50, 0, 0.97)',  // Red
              0.8, 'rgba(255, 0, 0, 0.98)',   // Red
              0.9, 'rgba(255, 20, 100, 0.99)', // Pink-red
              1, 'rgba(255, 20, 147, 1)'      // Pink (ultra-premium)
            ]
          : [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0, 0, 255, 0)',         // Transparent (no data)
              0.01, 'rgba(0, 0, 255, 0.1)',   // Very faint blue
              0.02, 'rgba(0, 0, 255, 0.15)',  // Light blue
              0.03, 'rgba(0, 0, 255, 0.2)',   // Light blue
              0.04, 'rgba(0, 0, 255, 0.25)',  // Light blue
              0.05, 'rgba(0, 0, 255, 0.3)',   // Light blue
              0.07, 'rgba(0, 100, 255, 0.4)', // Blue-cyan transition
              0.09, 'rgba(0, 200, 255, 0.5)', // Cyan-ish
              0.11, 'rgba(0, 255, 255, 0.55)', // Cyan
              0.13, 'rgba(0, 255, 200, 0.6)', // Cyan-green
              0.15, 'rgba(0, 255, 150, 0.65)', // Cyan-green
              0.17, 'rgba(0, 255, 100, 0.7)', // Green-cyan
              0.19, 'rgba(0, 255, 50, 0.75)', // Green
              0.21, 'rgba(0, 255, 0, 0.8)',   // Pure green
              0.25, 'rgba(100, 255, 0, 0.82)', // Green-yellow
              0.3, 'rgba(200, 255, 0, 0.85)', // Yellow-green
              0.4, 'rgba(255, 255, 0, 0.87)', // Yellow
              0.5, 'rgba(255, 150, 0, 0.9)', // Orange
              0.6, 'rgba(255, 100, 0, 0.95)', // Red-orange
              0.8, 'rgba(255, 0, 0, 1)'       // Red (expensive)
            ];

        map.setPaintProperty(layerId, 'heatmap-color', colorGradient);
      }
    }
  }, [properties, heatmapSettings, heatmapEnabled]);

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
      
      {/* Dynamic Loading Indicator */}
      {loadingMore && (
        <div className="absolute top-16 left-4 bg-blue-50 px-3 py-2 rounded-lg shadow-lg z-10 border border-blue-200">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-3 w-3 border-2 border-blue-400 border-t-transparent rounded-full"></div>
            <span className="text-xs text-blue-700">Loading more properties...</span>
          </div>
        </div>
      )}
      
      {/* Load More Button */}
      {!loading && !allChunksLoaded && !loadingMore && properties.length > 500 && (
        <div className="absolute top-16 right-4 z-10">
          <button
            onClick={loadNextChunk}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-colors"
          >
            Load More Properties
            <span className="ml-2 text-blue-200">({properties.length} of {totalPropertiesCount})</span>
          </button>
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
            <span className="text-gray-600">• {properties.length}{totalPropertiesCount ? ` of ${totalPropertiesCount}` : ''} properties</span>
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