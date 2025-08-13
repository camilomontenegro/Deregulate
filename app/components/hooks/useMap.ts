import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

const majorCities = [
  { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { name: 'Barcelona', lat: 41.3851, lng: 2.1734 },
  { name: 'Seville', lat: 37.3891, lng: -5.9845 }
];

const MAPTILER_API_KEY = 'z3OfJgO4Nbj34x56NGlf';

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

export const useMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const clustererRef = useRef<any>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [heatmapRef, setHeatMapRef] = useState<any>();
  const [totalPropertiesCount, setTotalPropertiesCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [allChunksLoaded, setAllChunksLoaded] = useState(false);
  const CHUNK_SIZE = 1000;

  useEffect(() => {
    const initializeMap = async () => {
      if (!mapRef.current) return;

      try {
        // Create MapLibre map with MapTiler style
        const map = new maplibregl.Map({
          container: mapRef.current,
          style: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_API_KEY}`,
          center: [-3.7038, 40.4168], // lng, lat format for MapLibre
          zoom: 6,
          maxBounds: [[-9.5, 35.9], [4.5, 43.9]], // Spain bounds [west, south, east, north]
        });

        // Store map instance for heatmap updates
        mapInstanceRef.current = map;

        // Wait for map to load before adding layers
        map.on('load', () => {
          // Add city markers
          majorCities.forEach(city => {
            new maplibregl.Marker({
              color: '#1f2937',
              scale: 0.8
            })
              .setLngLat([city.lng, city.lat])
              .setPopup(new maplibregl.Popup({ offset: 25 })
                .setHTML(`<h3>${city.name}</h3>`))
              .addTo(map);
          });

          // Create empty heatmap ref for later use
          setHeatMapRef({ map, layerId: 'property-heatmap' });

          // Initialize clustering data structures
          clustererRef.current = {
            map,
            sourceId: 'properties-source',
            clusterLayerId: 'clusters',
            unclusteredLayerId: 'unclustered-points',
            clusterCountLayerId: 'cluster-count'
          };
        });

      } catch (error) {
        console.error('Error initializing map:', error);
      }
    };

    // Only initialize once when we're on client and we have the map ref
    if (!mapInstanceRef.current && isClient && mapRef.current) {
      initializeMap();
    }
  }, [isClient]);

  // Function to load next chunk of properties
  const loadNextChunk = async () => {
    if (allChunksLoaded || loadingMore) return;
    
    try {
      setLoadingMore(true);
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const nextChunk = currentChunk + 1;
      const startIndex = nextChunk * CHUNK_SIZE;
      const endIndex = startIndex + CHUNK_SIZE - 1;
      
      console.log(`Loading chunk ${nextChunk}: properties ${startIndex}-${endIndex}`);
      
      const { data, error } = await supabase
        .from('houses')
        .select('*')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .range(startIndex, endIndex);

      if (error) {
        console.error('Error fetching chunk:', error);
        return;
      }

      const newProperties = data || [];
      console.log(`Loaded chunk ${nextChunk}: ${newProperties.length} properties`);
      
      if (newProperties.length > 0) {
        setProperties(prev => [...prev, ...newProperties]);
        setCurrentChunk(nextChunk);
      }
      
      // Mark as complete if we got less than full chunk
      if (newProperties.length < CHUNK_SIZE) {
        setAllChunksLoaded(true);
        console.log('All chunks loaded!');
      }
      
    } catch (error) {
      console.error('Error loading chunk:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Function to load first chunk and get total count
  const loadInitialChunk = async () => {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      // Get total count
      const { count: totalCount } = await supabase
        .from('houses')
        .select('*', { count: 'exact', head: true })
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      setTotalPropertiesCount(totalCount || 0);
      console.log('Total properties with coordinates:', totalCount);

      // Load first chunk (0-999)
      const { data, error } = await supabase
        .from('houses')
        .select('*')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .range(0, CHUNK_SIZE - 1);

      if (error) {
        console.error('Error fetching first chunk:', error);
      } else {
        console.log(`Loaded first chunk: ${data?.length || 0} properties`);
        setProperties(data || []);
        setCurrentChunk(0);
        
        // If we got less than full chunk, we have all data
        if ((data?.length || 0) < CHUNK_SIZE) {
          setAllChunksLoaded(true);
        }
      }
    } catch (error) {
      console.error('Error loading initial chunk:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsClient(true);
    loadInitialChunk();
  }, []);

  // Set up smart loading trigger when map is ready
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || loading || allChunksLoaded) return;

    let interactionTimeout: NodeJS.Timeout;
    
    const handleMapInteraction = () => {
      clearTimeout(interactionTimeout);
      
      // After user stops interacting for 2 seconds, check if we need more data
      interactionTimeout = setTimeout(() => {
        const zoom = map.getZoom();
        
        // Only trigger loading when zoomed in to city level or closer
        if (zoom > 9 && !allChunksLoaded && !loadingMore) {
          // Simple trigger: load next chunk when user is exploring at city level
          console.log('User exploring at zoom', zoom, '- loading next chunk');
          loadNextChunk();
        }
      }, 2000); // Wait 2 seconds after user stops moving
    };
    
    map.on('moveend', handleMapInteraction);
    map.on('zoomend', handleMapInteraction);
    
    return () => {
      clearTimeout(interactionTimeout);
      map.off('moveend', handleMapInteraction);
      map.off('zoomend', handleMapInteraction);
    };
  }, [loading, isClient, allChunksLoaded, loadingMore]);

  // Function to create GeoJSON from properties
  const createGeoJSONData = (properties: Property[]) => {
    return {
      type: 'FeatureCollection' as const,
      features: properties
        .filter(property => property.latitude && property.longitude)
        .map(property => ({
          type: 'Feature' as const,
          properties: {
            ...property,
            color: property.operation === 'sale' ? '#ef4444' : '#10b981'
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [property.longitude, property.latitude]
          }
        }))
    };
  };

  // Function to toggle markers
  const toggleMarkers = (enabled: boolean) => {
    const map = mapInstanceRef.current;
    if (!map || !clustererRef.current) return;

    const { sourceId, clusterLayerId, unclusteredLayerId, clusterCountLayerId } = clustererRef.current;

    if (enabled) {
      // Add source if it doesn't exist
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: createGeoJSONData(properties),
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 60
        });

        // Add cluster layer
        map.addLayer({
          id: clusterLayerId,
          type: 'circle',
          source: sourceId,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#51bbd6',
              100,
              '#f1c40f',
              750,
              '#e74c3c'
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              20,
              100,
              30,
              750,
              40
            ]
          }
        });

        // Add cluster count layer
        map.addLayer({
          id: clusterCountLayerId,
          type: 'symbol',
          source: sourceId,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': 12
          },
          paint: {
            'text-color': '#ffffff'
          }
        });

        // Add unclustered points layer
        map.addLayer({
          id: unclusteredLayerId,
          type: 'circle',
          source: sourceId,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': 6,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff'
          }
        });

        // Add click handlers
        map.on('click', clusterLayerId, (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: [clusterLayerId]
          });
          const clusterId = features[0].properties!.cluster_id;
          const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
          
          source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
            const coordinates = (features[0].geometry as any).coordinates as [number, number];
            map.easeTo({
              center: coordinates,
              zoom: zoom
            });
          }).catch((err) => {
            console.error('Error getting cluster expansion zoom:', err);
          });
        });

        // Add click handler for individual points
        map.on('click', unclusteredLayerId, (e) => {
          if (!e.features || e.features.length === 0) return;
          
          const coordinates = (e.features[0].geometry as any).coordinates.slice() as [number, number];
          const properties = e.features[0].properties!;

          // Ensure that if the map is zoomed out such that multiple
          // copies of the feature are visible, the popup appears
          // over the copy being pointed to.
          while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
          }

          // Close existing popup
          if (popupRef.current) {
            popupRef.current.remove();
          }

          const popupContent = `
            <div style="padding: 10px; max-width: 300px;">
              <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">
                €${parseInt(properties.price).toLocaleString()} - ${properties.operation === 'sale' ? 'Sale' : 'Rent'}
              </h3>
              <p style="margin: 0 0 4px 0; color: #666; font-size: 14px;">
                ${properties.address}
              </p>
              <p style="margin: 0 0 4px 0; color: #666; font-size: 12px;">
                ${properties.municipality}, ${properties.district}
              </p>
              <div style="display: flex; gap: 12px; margin: 8px 0; font-size: 12px;">
                ${properties.size ? `<span>📐 ${properties.size}m²</span>` : ''}
                ${properties.rooms ? `<span>🛏️ ${properties.rooms} rooms</span>` : ''}
                ${properties.bathrooms ? `<span>🚿 ${properties.bathrooms} baths</span>` : ''}
              </div>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #888;">
                Type: ${properties.property_type} • ID: ${properties.property_code}
              </p>
            </div>
          `;

          popupRef.current = new maplibregl.Popup()
            .setLngLat(coordinates)
            .setHTML(popupContent)
            .addTo(map);
        });

        // Change cursor on hover
        map.on('mouseenter', clusterLayerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', clusterLayerId, () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('mouseenter', unclusteredLayerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', unclusteredLayerId, () => {
          map.getCanvas().style.cursor = '';
        });
      }
    } else {
      // Remove layers
      if (map.getLayer(clusterLayerId)) map.removeLayer(clusterLayerId);
      if (map.getLayer(clusterCountLayerId)) map.removeLayer(clusterCountLayerId);
      if (map.getLayer(unclusteredLayerId)) map.removeLayer(unclusteredLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      
      // Remove popup
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
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
    toggleMarkers,
    totalPropertiesCount,
    loadingMore,
    allChunksLoaded,
    loadNextChunk
  }
}