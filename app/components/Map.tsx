'use client';

import { useEffect, useRef } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

const majorCities = [
  { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { name: 'Barcelona', lat: 41.3851, lng: 2.1734 },
  { name: 'Seville', lat: 37.3891, lng: -5.9845 }
];

const Map = () => {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeMap = async () => {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      
      if (!apiKey) return;

      const loader = new Loader({
        apiKey: apiKey,
        version: 'weekly',
        libraries: ['maps', 'marker']
      });

      const [{ Map }, { Marker }] = await Promise.all([
        loader.importLibrary('maps'),
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

        majorCities.forEach(city => {
          new Marker({
            map,
            position: { lat: city.lat, lng: city.lng },
            title: city.name
          });
        });
      }
    };

    initializeMap();
  }, []);

  return (
    <div 
      ref={mapRef} 
      style={{ 
        width: '100%', 
        height: '500px',
        borderRadius: '8px',
        border: '1px solid #e5e7eb'
      }} 
    />
  );
};

export default Map;