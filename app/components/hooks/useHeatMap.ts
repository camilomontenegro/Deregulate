import { RefObject, useEffect, useRef, useState } from "react";
type Props = {
  mapInstanceRef: RefObject<google.maps.Map | null>;
  ref: any;
}

export const useHeatMap = (props: Props) => {
  const {mapInstanceRef, ref} = props;
  const heatmapRef = useRef<any>(ref);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);

  useEffect(() => {
    console.log(ref, "ashdoshdao")
    heatmapRef.current = ref
  }, [ref])

  useEffect(() => {
      if (heatmapRef.current && mapInstanceRef.current) {
        if (heatmapEnabled) {
          heatmapRef.current.setMap(mapInstanceRef.current);
        } else {
          heatmapRef.current.setMap(null);
        }
      }
    }, [heatmapEnabled]);

  return {
    heatmapRef,
    heatmapEnabled,
    setHeatmapEnabled
  }
}