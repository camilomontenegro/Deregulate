import { Loader } from "@googlemaps/js-api-loader";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

// Singleton loader to prevent multiple API calls
let mapLoader: Loader | null = null;
let isLoaderInitialized = false;
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

const getMapLoader = (apiKey: string) => {
  if (!mapLoader && !isLoaderInitialized) {
    isLoaderInitialized = true;
    mapLoader = new Loader({
      apiKey: apiKey,
      version: 'weekly',
      libraries: ['maps', 'marker', 'visualization'],
      // Reduce data loading
      region: 'ES',
      language: 'es'
    });
  }
  return mapLoader;
};


export const useMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [heatmapRef, setHeatMapRef] = useState<google.maps.visualization.HeatmapLayer>();

  useEffect(() => {
    const initializeMap = async () => {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      
      if (!apiKey || !mapRef.current) return;

      try {
        const loader = getMapLoader(apiKey);
        if (!loader) return;

        const [{ Map }] = await Promise.all([
          loader.importLibrary('maps')
        ]);

        const { HeatmapLayer } = await loader.importLibrary('visualization');

        // Double-check mapRef is still valid after async operations
        if (!mapRef.current) return;
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
          mapTypeId: 'roadmap',
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'cooperative',
          // Disable features that load additional data
          clickableIcons: false,
          keyboardShortcuts: false,
          // Disable POI and transit
          disableDoubleClickZoom: false,
          scrollwheel: true
        });

        // Apply styles after map creation to override defaults
        map.setOptions({
          styles: [
            // Hide ALL POI labels
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            // Hide ALL POI icons
            {
              featureType: 'poi',
              elementType: 'labels.icon',
              stylers: [{ visibility: 'off' }]
            },
            // Hide transit completely
            {
              featureType: 'transit',
              stylers: [{ visibility: 'off' }]
            },
            // Hide road labels but keep roads
            {
              featureType: 'road',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }]
            },
            // Keep only administrative labels (cities, towns)
            {
              featureType: 'administrative',
              elementType: 'labels',
              stylers: [{ visibility: 'on' }]
            }
          ]
        });

        // Store map instance for heatmap updates
        mapInstanceRef.current = map;

        // Calculate price statistics from existing Supabase data for proper comparison
        const validProperties = properties.filter(property => 
          property.latitude && property.longitude && property.price > 0
        );
        
        if (validProperties.length === 0) return;
        
        const prices = validProperties.map(property => property.price);
        const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        console.log(`Price stats - Min: €${minPrice}, Avg: €${avgPrice.toFixed(0)}, Max: €${maxPrice}`);

        // Create heatmap data points based on price comparison to average
        const heatmapData = validProperties.map(property => {
          // Calculate how much above/below average this property is
          const priceRatio = property.price / avgPrice;
          
          // Create weight based on price relative to average
          let weight;
          if (priceRatio >= 2.0) {
            weight = 10; // Very expensive (2x+ average) = hot red
          } else if (priceRatio >= 1.5) {
            weight = 7; // Expensive (1.5x+ average) = orange
          } else if (priceRatio >= 1.2) {
            weight = 5; // Above average (1.2x+ average) = yellow
          } else if (priceRatio >= 0.8) {
            weight = 3; // Around average (0.8-1.2x average) = green
          } else if (priceRatio >= 0.5) {
            weight = 1; // Below average (0.5-0.8x average) = cyan
          } else {
            weight = 0.1; // Very cheap (<0.5x average) = blue/transparent
          }
          
          return {
            location: new google.maps.LatLng(property.latitude, property.longitude),
            weight: weight
          };
        });

        // Create heatmap layer with settings optimized for granular data
        const heatmap = new HeatmapLayer({
          data: heatmapData,
          map: null, // Initially not shown
          radius: 25, // Reduced radius to prevent oversized blobs
          opacity: 0.5, // Lower opacity for better visibility of overlaps
          maxIntensity: 3, // Lower max intensity to prevent oversaturation
          dissipating: true, // Enable dissipation for smoother gradients
          gradient: [
            'rgba(0, 0, 255, 0)', // Transparent blue (no data)
            'rgba(0, 0, 255, 0.3)', // Light blue (low density)
            'rgba(0, 255, 255, 0.5)', // Cyan (low-medium density)
            'rgba(0, 255, 0, 0.7)', // Green (medium density)
            'rgba(255, 255, 0, 0.8)', // Yellow (medium-high density)
            'rgba(255, 165, 0, 0.9)', // Orange (high density)
            'rgba(255, 0, 0, 1)' // Red (highest density)
          ]
        });

        /* heatmapRef.current = heatmap; */
        setHeatMapRef(heatmap);

        // Add city markers using regular markers
        majorCities.forEach(city => {
          new google.maps.Marker({
            map,
            position: { lat: city.lat, lng: city.lng },
            title: city.name,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#1f2937',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2
            }
          });
        });

        // Create property markers but don't add them to map initially
        const allMarkers: google.maps.Marker[] = [];
        properties.forEach(property => {
          if (property.latitude && property.longitude) {
            // Different colors for sale vs rent
            const pinColor = property.operation === 'sale' ? '#ef4444' : '#10b981';
            
            const marker = new google.maps.Marker({
              map: null, // Initially not on map
              position: { lat: property.latitude, lng: property.longitude },
              title: `${property.address} - €${property.price.toLocaleString()}`,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: pinColor,
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 1
              }
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

            allMarkers.push(marker);
          }
        });

        // Store markers in ref for toggling
        markersRef.current = allMarkers;

        // Initialize marker clusterer but don't show markers initially
        clustererRef.current = new MarkerClusterer({
          map: null, // Initially not on map
          markers: allMarkers,
          gridSize: 60,
          maxZoom: 15,
          minimumClusterSize: 2,
          styles: [
            {
              textColor: 'white',
              textSize: 12,
              height: 40,
              width: 40,
              backgroundPosition: 'center',
              iconAnchor: [20, 20],
              textAlign: 'center',
              fontFamily: 'Arial, sans-serif',
              fontWeight: 'bold',
              backgroundSize: 'contain'
            }
          ]
        });

      } catch (error) {
        console.error('Error initializing map:', error);
      }
    };

    // Only initialize once when we have properties and loading is complete and we're on client
    if (!loading && properties.length > 0 && !mapInstanceRef.current && isClient) {
      initializeMap();
    }
  }, [properties, loading, isClient]);

  useEffect(() => {
      setIsClient(true);
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
            .limit(5000); // Limit to prevent too many markers
  
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
  // Function to toggle markers
  const toggleMarkers = (enabled: boolean) => {
    if (clustererRef.current && mapInstanceRef.current) {
      if (enabled) {
        clustererRef.current.setMap(mapInstanceRef.current);
      } else {
        clustererRef.current.setMap(null);
      }
    }
  };

  return {
    mapRef,
    mapInstanceRef,
    isClient,
    loading,
    properties,
    setIsClient,
    heatmapRef,
    toggleMarkers
  }
}