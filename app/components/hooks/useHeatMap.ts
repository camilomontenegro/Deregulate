import { RefObject, useEffect, useRef, useState } from "react";
import maplibregl from 'maplibre-gl';

type Props = {
  mapInstanceRef: RefObject<maplibregl.Map | null>;
  ref: any;
}

export const useHeatMap = (props: Props) => {
  const {mapInstanceRef, ref} = props;
  const heatmapRef = useRef<any>(ref);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);

  useEffect(() => {
    heatmapRef.current = ref
  }, [ref])

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !heatmapRef.current) {
      console.log('HeatMap toggle: missing map or heatmapRef', { map: !!map, heatmapRef: !!heatmapRef.current });
      return;
    }

    const { layerId } = heatmapRef.current;
    console.log('HeatMap toggle:', { layerId, heatmapEnabled, layerExists: !!map.getLayer(layerId) });

    // Add a small delay to ensure layer is created
    const updateVisibility = () => {
      if (heatmapEnabled) {
        // Show heatmap layer if it exists
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', 'visible');
          console.log('Heatmap layer made visible');
        } else {
          console.log('Heatmap layer does not exist yet, will retry');
          // Retry after a short delay
          setTimeout(updateVisibility, 100);
        }
      } else {
        // Hide heatmap layer if it exists
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', 'none');
          console.log('Heatmap layer hidden');
        }
      }
    };

    updateVisibility();
  }, [heatmapEnabled]);

  return {
    heatmapRef,
    heatmapEnabled,
    setHeatmapEnabled
  }
}