'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { createClient } from '@supabase/supabase-js';

const majorCities = [
  { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { name: 'Barcelona', lat: 41.3851, lng: 2.1734 },
  { name: 'Seville', lat: 37.3891, lng: -5.9845 }
];

interface Property {
  id: number;
  property_code: number;
  address: string;
  price: number;
  operation: string;
  property_type: string;
  size: number;
  rooms: number;
  bathrooms: number;
  latitude: number;
  longitude: number;
  municipality: string;
  district: string;
  neighborhood: string;
  url: string;
}

const Map = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch properties from Supabase
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error } = await supabase
          .from('houses')
          .select('*')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .limit(1000); // Limit to prevent too many markers

        if (error) {
          console.error('Error fetching properties:', error);
        } else {
          setProperties(data || []);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProperties();
  }, []);

  useEffect(() => {
    const initializeMap = async () => {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      
      if (!apiKey) return;

      const loader = new Loader({
        apiKey: apiKey,
        version: 'weekly',
        libraries: ['maps', 'marker']
      });

      const [{ Map }, { AdvancedMarkerElement }, { PinElement }] = await Promise.all([
        loader.importLibrary('maps'),
        loader.importLibrary('marker'),
        loader.importLibrary('marker')
      ]);

      if (mapRef.current) {
        const map = new Map(mapRef.current, {
          center: { lat: 40.4168, lng: -3.7038 },
          zoom: 6,
          restriction: {
            latLngBounds: {
              north: 43.9,
              south: 35.9,
              west: -9.5,
              east: 4.5,
            },
          },
          mapId: 'DEMO_MAP_ID',
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'poi.business',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative.locality',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'administrative.neighborhood',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'road',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'road.highway',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'road.arterial',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'road.local',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit.station',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit.station.airport',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit.station.bus',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            {
              featureType: 'transit.station.rail',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            }
          ],
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'cooperative'
        });

        // Add city markers
        majorCities.forEach(city => {
          const cityPin = new PinElement({
            background: '#1f2937',
            borderColor: '#ffffff',
            glyphColor: '#ffffff',
            scale: 1.2
          });

          new AdvancedMarkerElement({
            map,
            position: { lat: city.lat, lng: city.lng },
            title: city.name,
            content: cityPin.element
          });
        });

        // Add property markers
        properties.forEach(property => {
          if (property.latitude && property.longitude) {
            // Different colors for sale vs rent
            const pinColor = property.operation === 'sale' ? '#ef4444' : '#10b981';
            
            const propertyPin = new PinElement({
              background: pinColor,
              borderColor: '#ffffff',
              glyphColor: '#ffffff',
              scale: 0.8
            });

            const marker = new AdvancedMarkerElement({
              map,
              position: { lat: property.latitude, lng: property.longitude },
              title: `${property.address} - €${property.price.toLocaleString()}`,
              content: propertyPin.element
            });

            // Create info window content
            const infoContent = `
              <div style="padding: 10px; max-width: 300px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">
                  €${property.price.toLocaleString()} - ${property.operation === 'sale' ? 'Sale' : 'Rent'}
                </h3>
                <p style="margin: 0 0 4px 0; color: #666; font-size: 14px;">
                  ${property.address}
                </p>
                <p style="margin: 0 0 4px 0; color: #666; font-size: 12px;">
                  ${property.municipality}, ${property.district}
                </p>
                <div style="display: flex; gap: 12px; margin: 8px 0; font-size: 12px;">
                  ${property.size ? `<span>📐 ${property.size}m²</span>` : ''}
                  ${property.rooms ? `<span>🛏️ ${property.rooms} rooms</span>` : ''}
                  ${property.bathrooms ? `<span>🚿 ${property.bathrooms} baths</span>` : ''}
                </div>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #888;">
                  Type: ${property.property_type} • ID: ${property.property_code}
                </p>
              </div>
            `;

            const infoWindow = new google.maps.InfoWindow({
              content: infoContent
            });

            marker.addListener('click', () => {
              infoWindow.open(map, marker);
            });
          }
        });
      }
    };

    if (!loading && properties.length > 0) {
      initializeMap();
    }
  }, [properties, loading]);

  return (
    <div className="relative">
      {loading && (
        <div className="absolute top-4 left-4 bg-white px-3 py-2 rounded-lg shadow-lg z-10">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <span className="text-sm">Loading properties...</span>
          </div>
        </div>
      )}
      
      {!loading && properties.length > 0 && (
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