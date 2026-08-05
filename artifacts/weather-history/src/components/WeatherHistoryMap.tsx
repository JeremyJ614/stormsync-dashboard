import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { format, subDays, subMonths, subYears, startOfDay, endOfDay } from 'date-fns';
import { useWeatherHistory } from '@/hooks/useWeatherHistory';
import { 
  Zap, AlertTriangle, Layers, Calendar, ChevronRight, 
  Map as MapIcon, MinusSquare, Loader2, AlertCircle 
} from 'lucide-react';

const DARK_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const EF_COLORS = {
  'EF0': '#00FF00', '0': '#00FF00',
  'EF1': '#FFFF00', '1': '#FFFF00',
  'EF2': '#FF8C00', '2': '#FF8C00',
  'EF3': '#FF0000', '3': '#FF0000',
  'EF4': '#FF69B4', '4': '#FF69B4',
  'EF5': '#8B00FF', '5': '#8B00FF',
  'UNKNOWN': '#888888'
};

const WARNING_COLORS = {
  'SV': '#FFFF00',       // Severe T-Store
  'TO': '#FF0000',       // Tornado Warning
  'TO.A': '#FF00FF',     // Tornado Watch (Magenta)
  'DEFAULT': '#FFA500'   // Default/Considerable
};

const QUICK_RANGES = [
  { label: '7D', get: () => ({ from: subDays(new Date(), 7), to: endOfDay(new Date()) }) },
  { label: '30D', get: () => ({ from: subDays(new Date(), 30), to: endOfDay(new Date()) }) },
  { label: '90D', get: () => ({ from: subDays(new Date(), 90), to: endOfDay(new Date()) }) },
  { label: '6M', get: () => ({ from: subMonths(new Date(), 6), to: endOfDay(new Date()) }) },
  { label: '1Y', get: () => ({ from: subYears(new Date(), 1), to: endOfDay(new Date()) }) },
  { label: '2Y', get: () => ({ from: subYears(new Date(), 2), to: endOfDay(new Date()) }) },
  { label: '3Y', get: () => ({ from: subYears(new Date(), 3), to: endOfDay(new Date()) }) },
  { label: '4Y', get: () => ({ from: subYears(new Date(), 4), to: endOfDay(new Date()) }) },
  { label: '5Y', get: () => ({ from: subYears(new Date(), 5), to: endOfDay(new Date()) }) },
];

const YEARS = [2026, 2025, 2024, 2023, 2022, 2021];

export default function WeatherHistoryMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const {
    mode, setMode,
    activeTornadoLayers, setActiveTornadoLayers,
    warningType, setWarningType,
    dateRange, setDateRange
  } = useWeatherHistory();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureCount, setFeatureCount] = useState(0);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current) return;
    
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: DARK_MAP_STYLE,
      center: [-96, 38], // US center
      zoom: 4,
      minZoom: 3,
      maxZoom: 14,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    popupRef.current = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: '300px'
    });

    map.current.on('load', () => {
      // Add empty sources first
      const emptyGeoJSON = { type: 'FeatureCollection', features: [] };
      
      map.current?.addSource('tornado-tracks', { type: 'geojson', data: emptyGeoJSON });
      map.current?.addSource('damage-points', { type: 'geojson', data: emptyGeoJSON });
      map.current?.addSource('damage-areas', { type: 'geojson', data: emptyGeoJSON });
      map.current?.addSource('warning-polygons', { type: 'geojson', data: emptyGeoJSON });

      // Add Layers
      // 1. Damage Areas (Polygon)
      map.current?.addLayer({
        id: 'layer-damage-areas',
        type: 'fill',
        source: 'damage-areas',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': [
            'match', ['to-string', ['get', 'EF_RATING']],
            'EF0', EF_COLORS['EF0'], '0', EF_COLORS['EF0'],
            'EF1', EF_COLORS['EF1'], '1', EF_COLORS['EF1'],
            'EF2', EF_COLORS['EF2'], '2', EF_COLORS['EF2'],
            'EF3', EF_COLORS['EF3'], '3', EF_COLORS['EF3'],
            'EF4', EF_COLORS['EF4'], '4', EF_COLORS['EF4'],
            'EF5', EF_COLORS['EF5'], '5', EF_COLORS['EF5'],
            EF_COLORS['UNKNOWN']
          ],
          'fill-opacity': 0.4,
          'fill-outline-color': [
             'match', ['to-string', ['get', 'EF_RATING']],
             'EF0', EF_COLORS['EF0'], '0', EF_COLORS['EF0'],
             'EF1', EF_COLORS['EF1'], '1', EF_COLORS['EF1'],
             'EF2', EF_COLORS['EF2'], '2', EF_COLORS['EF2'],
             'EF3', EF_COLORS['EF3'], '3', EF_COLORS['EF3'],
             'EF4', EF_COLORS['EF4'], '4', EF_COLORS['EF4'],
             'EF5', EF_COLORS['EF5'], '5', EF_COLORS['EF5'],
             EF_COLORS['UNKNOWN']
          ]
        }
      });

      // 2. Warning Polygons
      map.current?.addLayer({
        id: 'layer-warning-polygons',
        type: 'fill',
        source: 'warning-polygons',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': [
            'match', ['get', 'PHENOM'],
            'TO', WARNING_COLORS['TO'],
            'SV', WARNING_COLORS['SV'],
            'TO.A', WARNING_COLORS['TO.A'],
            WARNING_COLORS['DEFAULT']
          ],
          'fill-opacity': 0.35,
          'fill-outline-color': [
            'match', ['get', 'PHENOM'],
            'TO', WARNING_COLORS['TO'],
            'SV', WARNING_COLORS['SV'],
            'TO.A', WARNING_COLORS['TO.A'],
            WARNING_COLORS['DEFAULT']
          ]
        }
      });

      map.current?.addLayer({
        id: 'layer-warning-polygons-line',
        type: 'line',
        source: 'warning-polygons',
        layout: { visibility: 'none' },
        paint: {
          'line-color': [
            'match', ['get', 'PHENOM'],
            'TO', WARNING_COLORS['TO'],
            'SV', WARNING_COLORS['SV'],
            'TO.A', WARNING_COLORS['TO.A'],
            WARNING_COLORS['DEFAULT']
          ],
          'line-width': 1.5,
          'line-opacity': 0.9
        }
      });

      // 3. Tornado Tracks (Line)
      map.current?.addLayer({
        id: 'layer-tornado-tracks',
        type: 'line',
        source: 'tornado-tracks',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          visibility: 'none'
        },
        paint: {
          'line-color': [
            'match', ['to-string', ['get', 'EF_RATING']],
            'EF0', EF_COLORS['EF0'], '0', EF_COLORS['EF0'],
            'EF1', EF_COLORS['EF1'], '1', EF_COLORS['EF1'],
            'EF2', EF_COLORS['EF2'], '2', EF_COLORS['EF2'],
            'EF3', EF_COLORS['EF3'], '3', EF_COLORS['EF3'],
            'EF4', EF_COLORS['EF4'], '4', EF_COLORS['EF4'],
            'EF5', EF_COLORS['EF5'], '5', EF_COLORS['EF5'],
            EF_COLORS['UNKNOWN']
          ],
          'line-width': 3,
          'line-opacity': 1.0
        }
      });

      // 4. Damage Points (Circle)
      map.current?.addLayer({
        id: 'layer-damage-points',
        type: 'circle',
        source: 'damage-points',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 5,
          'circle-opacity': 0.8,
          'circle-color': [
            'match', ['to-string', ['get', 'EF_RATING']],
            'EF0', EF_COLORS['EF0'], '0', EF_COLORS['EF0'],
            'EF1', EF_COLORS['EF1'], '1', EF_COLORS['EF1'],
            'EF2', EF_COLORS['EF2'], '2', EF_COLORS['EF2'],
            'EF3', EF_COLORS['EF3'], '3', EF_COLORS['EF3'],
            'EF4', EF_COLORS['EF4'], '4', EF_COLORS['EF4'],
            'EF5', EF_COLORS['EF5'], '5', EF_COLORS['EF5'],
            EF_COLORS['UNKNOWN']
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#000000'
        }
      });

      // Popup Interaction
      const interactiveLayers = ['layer-tornado-tracks', 'layer-damage-points', 'layer-warning-polygons', 'layer-damage-areas'];
      
      map.current?.on('click', (e: maplibregl.MapMouseEvent) => {
        if (!map.current) return;
        const features = map.current.queryRenderedFeatures(e.point, { layers: interactiveLayers.filter(l => map.current?.getLayer(l)) });
        
        if (!features.length) {
          popupRef.current?.remove();
          return;
        }

        const feature = features[0];
        let html = '';

        if (feature.layer.id === 'layer-tornado-tracks' || feature.layer.id === 'layer-damage-areas') {
          const props = feature.properties;
          const ef = props.EF_RATING !== null ? props.EF_RATING : 'Unknown';
          const beginDate = props.BEGIN_DATE ? new Date(props.BEGIN_DATE).toLocaleString() : 'N/A';
          html = `
            <div class="space-y-1">
              <h3 class="font-display font-bold text-lg text-primary tracking-wide">TORNADO TRACK</h3>
              <p class="text-sm"><strong>EF Rating:</strong> <span class="text-white">${ef}</span></p>
              <p class="text-sm"><strong>Date:</strong> <span class="text-white">${beginDate}</span></p>
              <p class="text-sm"><strong>Fatalities:</strong> <span class="text-destructive font-bold">${props.FATALITIES ?? 0}</span></p>
              <p class="text-sm"><strong>Injuries:</strong> <span class="text-white font-bold">${props.INJURIES ?? 0}</span></p>
            </div>
          `;
        } else if (feature.layer.id === 'layer-damage-points') {
          const props = feature.properties;
          const ef = props.EF_RATING !== null ? props.EF_RATING : 'Unknown';
          html = `
            <div class="space-y-1">
              <h3 class="font-display font-bold text-lg text-primary tracking-wide">DAMAGE POINT</h3>
              <p class="text-sm"><strong>EF Rating:</strong> <span class="text-white">${ef}</span></p>
              <p class="text-sm"><strong>Hazard:</strong> <span class="text-white">${props.HAZARD ?? 'N/A'}</span></p>
              <p class="text-sm"><strong>Category:</strong> <span class="text-white">${props.DAMAGE_CATEGORY ?? 'N/A'}</span></p>
            </div>
          `;
        } else if (feature.layer.id === 'layer-warning-polygons' || feature.layer.id === 'layer-warning-polygons-line') {
          const props = feature.properties;
          html = `
            <div class="space-y-1">
              <h3 class="font-display font-bold text-lg text-primary tracking-wide">WARNING POLYGON</h3>
              <p class="text-sm"><strong>Phenomena:</strong> <span class="text-white">${props.PHENOM ?? 'N/A'}</span></p>
              <p class="text-sm"><strong>Significance:</strong> <span class="text-white">${props.SIG ?? 'N/A'}</span></p>
              <p class="text-sm"><strong>Issued:</strong> <span class="text-white">${props.ISSUE ? new Date(props.ISSUE).toLocaleString() : 'N/A'}</span></p>
              <p class="text-sm"><strong>Expires:</strong> <span class="text-white">${props.EXPIRE ? new Date(props.EXPIRE).toLocaleString() : 'N/A'}</span></p>
            </div>
          `;
        }

        if (html) {
          popupRef.current?.setLngLat(e.lngLat).setHTML(html).addTo(map.current!);
        }
      });

      map.current?.on('mouseenter', 'layer-tornado-tracks', () => { map.current!.getCanvas().style.cursor = 'pointer'; });
      map.current?.on('mouseleave', 'layer-tornado-tracks', () => { map.current!.getCanvas().style.cursor = ''; });
      map.current?.on('mouseenter', 'layer-damage-points', () => { map.current!.getCanvas().style.cursor = 'pointer'; });
      map.current?.on('mouseleave', 'layer-damage-points', () => { map.current!.getCanvas().style.cursor = ''; });
      map.current?.on('mouseenter', 'layer-warning-polygons', () => { map.current!.getCanvas().style.cursor = 'pointer'; });
      map.current?.on('mouseleave', 'layer-warning-polygons', () => { map.current!.getCanvas().style.cursor = ''; });

      // Trigger initial fetch
      fetchData();
    });

    return () => {
      map.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update layer visibility
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    if (mode === 'TORNADO') {
      map.current.setLayoutProperty('layer-tornado-tracks', 'visibility', activeTornadoLayers.has('tracks') ? 'visible' : 'none');
      map.current.setLayoutProperty('layer-damage-points', 'visibility', activeTornadoLayers.has('points') ? 'visible' : 'none');
      map.current.setLayoutProperty('layer-damage-areas', 'visibility', activeTornadoLayers.has('areas') ? 'visible' : 'none');
      
      map.current.setLayoutProperty('layer-warning-polygons', 'visibility', 'none');
      map.current.setLayoutProperty('layer-warning-polygons-line', 'visibility', 'none');
    } else {
      map.current.setLayoutProperty('layer-tornado-tracks', 'visibility', 'none');
      map.current.setLayoutProperty('layer-damage-points', 'visibility', 'none');
      map.current.setLayoutProperty('layer-damage-areas', 'visibility', 'none');
      
      map.current.setLayoutProperty('layer-warning-polygons', 'visibility', 'visible');
      map.current.setLayoutProperty('layer-warning-polygons-line', 'visibility', 'visible');
    }
  }, [mode, activeTornadoLayers]);

  // Fetch Data Effect
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dateRange, activeTornadoLayers, warningType]);

  const fetchData = async () => {
    if (!map.current || !map.current.isStyleLoaded()) {
      // If map isn't ready, wait a bit and try again
      setTimeout(fetchData, 500);
      return;
    }

    setIsLoading(true);
    setError(null);
    let totalFeatures = 0;

    try {
      if (mode === 'TORNADO') {
        const startStr = format(dateRange.from, 'yyyy-MM-dd HH:mm:ss').replace(' ', '%20');
        const endStr = format(dateRange.to, 'yyyy-MM-dd HH:mm:ss').replace(' ', '%20');

        const fetches = [];
        
        if (activeTornadoLayers.has('tracks')) {
          const url = `https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer/1/query?f=geojson&outSR=4326&where=BEGIN_DATE%20BETWEEN%20TIMESTAMP%20'${startStr}'%20AND%20TIMESTAMP%20'${endStr}'&outFields=OBJECTID,BEGIN_DATE,END_DATE,LOCAL_DATE,EF_RATING,FATALITIES,INJURIES,BEGIN_LAT,BEGIN_LON,END_LAT,END_LON&geometryPrecision=6`;
          fetches.push(
            fetch(url).then(r => r.json()).then(data => {
              (map.current?.getSource('tornado-tracks') as maplibregl.GeoJSONSource)?.setData(data);
              totalFeatures += data.features?.length || 0;
            })
          );
        } else {
           (map.current?.getSource('tornado-tracks') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [] });
        }

        if (activeTornadoLayers.has('points')) {
          const url = `https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer/0/query?f=geojson&outSR=4326&where=BEGIN_DATE%20BETWEEN%20TIMESTAMP%20'${startStr}'%20AND%20TIMESTAMP%20'${endStr}'&outFields=OBJECTID,EF_RATING,HAZARD,DAMAGE_CATEGORY&geometryPrecision=6`;
          fetches.push(
            fetch(url).then(r => r.json()).then(data => {
              (map.current?.getSource('damage-points') as maplibregl.GeoJSONSource)?.setData(data);
              totalFeatures += data.features?.length || 0;
            })
          );
        } else {
          (map.current?.getSource('damage-points') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [] });
        }

        if (activeTornadoLayers.has('areas')) {
           const url = `https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer/2/query?f=geojson&outSR=4326&where=BEGIN_DATE%20BETWEEN%20TIMESTAMP%20'${startStr}'%20AND%20TIMESTAMP%20'${endStr}'&outFields=OBJECTID,EF_RATING&geometryPrecision=6`;
           fetches.push(
             fetch(url).then(r => r.json()).then(data => {
               (map.current?.getSource('damage-areas') as maplibregl.GeoJSONSource)?.setData(data);
               totalFeatures += data.features?.length || 0;
             })
           );
        } else {
           (map.current?.getSource('damage-areas') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [] });
        }

        await Promise.all(fetches);

      } else {
        // WARNING HISTORY
        const startIso = format(dateRange.from, "yyyy-MM-dd'T'HH:mm:ss'Z'");
        const endIso = format(dateRange.to, "yyyy-MM-dd'T'HH:mm:ss'Z'");
        const url = `https://mesonet.agron.iastate.edu/geojson/sbw.geojson?sts=${startIso}&ets=${endIso}`;

        const response = await fetch(url);
        const data = await response.json();
        
        let filteredFeatures = data.features || [];
        if (warningType === 'TO') {
          filteredFeatures = filteredFeatures.filter((f: any) => f.properties?.PHENOM === 'TO');
        } else if (warningType === 'SV') {
          filteredFeatures = filteredFeatures.filter((f: any) => f.properties?.PHENOM === 'SV');
        }

        const filteredData = { ...data, features: filteredFeatures };
        (map.current?.getSource('warning-polygons') as maplibregl.GeoJSONSource)?.setData(filteredData);
        totalFeatures = filteredFeatures.length;
      }
      
      setFeatureCount(totalFeatures);
    } catch (err) {
      console.error(err);
      setError("Unable to load data. The requested date range might be too large or the server is busy.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTornadoLayer = (layer: 'tracks' | 'points' | 'areas') => {
    const next = new Set(activeTornadoLayers);
    if (next.has(layer)) next.delete(layer);
    else next.add(layer);
    setActiveTornadoLayers(next);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      {/* Header */}
      <header className="flex-none px-6 py-4 border-b border-border bg-background/80 backdrop-blur-md z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-primary fill-primary" />
              <span className="text-primary font-bold tracking-widest text-xs uppercase">VIP FORECASTS</span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-foreground uppercase drop-shadow-md">
              Weather History
            </h1>
            <p className="text-muted-foreground mt-1 max-w-xl text-sm md:text-base">
              Explore past tornado tracks, damage surveys, and warning records on an interactive command center map.
            </p>
          </div>
          
          <div className="flex items-center space-x-2 bg-card p-1 rounded-md border border-card-border shadow-sm">
            <button
              onClick={() => setMode('TORNADO')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-sm transition-all duration-200 ${
                mode === 'TORNADO' 
                  ? 'bg-primary text-primary-foreground shadow-md' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              <Zap className="w-4 h-4" />
              TORNADO HISTORY
            </button>
            <button
              onClick={() => setMode('WARNING')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-sm transition-all duration-200 ${
                mode === 'WARNING' 
                  ? 'bg-destructive text-destructive-foreground shadow-md' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              WARNING HISTORY
            </button>
          </div>
        </div>
      </header>

      {/* Controls Row */}
      <div className="flex-none bg-card border-b border-border p-4 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col xl:flex-row gap-6 justify-between items-start xl:items-center">
          
          {/* Left Controls */}
          <div className="flex flex-col gap-2 w-full xl:w-auto">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {mode === 'TORNADO' ? 'Map Layers' : 'Warning Type'}
            </span>
            
            {mode === 'TORNADO' ? (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${activeTornadoLayers.has('tracks') ? 'bg-primary border-primary' : 'border-muted-foreground group-hover:border-foreground'}`}>
                    {activeTornadoLayers.has('tracks') && <MinusSquare className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={activeTornadoLayers.has('tracks')} onChange={() => toggleTornadoLayer('tracks')} />
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Tornado Tracks</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${activeTornadoLayers.has('points') ? 'bg-primary border-primary' : 'border-muted-foreground group-hover:border-foreground'}`}>
                    {activeTornadoLayers.has('points') && <MinusSquare className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={activeTornadoLayers.has('points')} onChange={() => toggleTornadoLayer('points')} />
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Damage Points</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${activeTornadoLayers.has('areas') ? 'bg-primary border-primary' : 'border-muted-foreground group-hover:border-foreground'}`}>
                    {activeTornadoLayers.has('areas') && <MinusSquare className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={activeTornadoLayers.has('areas')} onChange={() => toggleTornadoLayer('areas')} />
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Damage Areas</span>
                </label>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 bg-background/50 p-1 rounded-md border border-border/50">
                <button 
                  onClick={() => setWarningType('ALL')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors ${warningType === 'ALL' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  All Warnings
                </button>
                <button 
                  onClick={() => setWarningType('TO')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors ${warningType === 'TO' ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:text-destructive'}`}
                >
                  Tornado Warnings
                </button>
                <button 
                  onClick={() => setWarningType('SV')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-colors ${warningType === 'SV' ? 'bg-yellow-500 text-black' : 'text-muted-foreground hover:text-yellow-500'}`}
                >
                  Severe T-Storm
                </button>
              </div>
            )}
          </div>

          {/* Right Controls - Date Range */}
          <div className="flex flex-col gap-2 w-full xl:w-auto">
             <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Date Range
            </span>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input 
                    type="date" 
                    className="bg-background border border-border text-foreground text-sm rounded-md pl-3 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark-color-scheme"
                    value={format(dateRange.from, 'yyyy-MM-dd')}
                    onChange={(e) => {
                      const d = new Date(e.target.value);
                      if (!isNaN(d.getTime())) setDateRange(prev => ({ ...prev, from: startOfDay(d) }));
                    }}
                  />
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <div className="relative">
                  <input 
                    type="date" 
                    className="bg-background border border-border text-foreground text-sm rounded-md pl-3 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark-color-scheme"
                    value={format(dateRange.to, 'yyyy-MM-dd')}
                    onChange={(e) => {
                      const d = new Date(e.target.value);
                      if (!isNaN(d.getTime())) setDateRange(prev => ({ ...prev, to: endOfDay(d) }));
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1 border-l border-border/50 pl-4">
                <div className="flex flex-wrap gap-1">
                  {QUICK_RANGES.map(range => (
                    <button 
                      key={range.label}
                      onClick={() => setDateRange(range.get())}
                      className="text-[10px] px-2 py-1 rounded bg-background border border-border hover:border-primary hover:text-primary transition-colors text-muted-foreground font-mono"
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                   {YEARS.map(year => (
                    <button 
                      key={year}
                      onClick={() => setDateRange({ from: new Date(year, 0, 1), to: endOfDay(new Date(year, 11, 31)) })}
                      className="text-[10px] px-2 py-1 rounded bg-background border border-border hover:border-primary hover:text-primary transition-colors text-muted-foreground font-mono"
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* Map Area */}
      <div className="relative flex-1 bg-[#0a1628]">
        <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
        
        {/* Features Count Badge */}
        <div className="absolute top-4 left-4 z-10">
           <div className="bg-card/90 backdrop-blur-sm border border-card-border px-3 py-2 rounded-md shadow-lg flex flex-col items-center justify-center min-w-[120px]">
             <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Features Shown</span>
             <span className="font-display font-bold text-2xl text-foreground mt-0.5">
               {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-primary mt-1" /> : featureCount.toLocaleString()}
             </span>
           </div>
        </div>

        {/* Loading Overlay / Error */}
        {isLoading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-primary text-primary-foreground px-4 py-1.5 rounded-full font-bold text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading Data...
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2 shadow-lg">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-6 right-6 z-10 pointer-events-none">
          <div className="bg-card/90 backdrop-blur-md border border-card-border p-4 rounded-lg shadow-2xl min-w-[200px] pointer-events-auto">
             <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
               <MapIcon className="w-3 h-3" />
               {mode === 'TORNADO' ? 'EF RATING' : 'WARNING TYPE'}
             </h4>
             
             {mode === 'TORNADO' ? (
               <div className="space-y-2">
                 {[
                   { label: 'EF5', color: EF_COLORS['EF5'] },
                   { label: 'EF4', color: EF_COLORS['EF4'] },
                   { label: 'EF3', color: EF_COLORS['EF3'] },
                   { label: 'EF2', color: EF_COLORS['EF2'] },
                   { label: 'EF1', color: EF_COLORS['EF1'] },
                   { label: 'EF0', color: EF_COLORS['EF0'] },
                   { label: 'Unknown', color: EF_COLORS['UNKNOWN'] },
                 ].map(item => (
                   <div key={item.label} className="flex items-center gap-3">
                     <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 8px ${item.color}66` }} />
                     <span className="text-sm font-medium text-foreground">{item.label}</span>
                   </div>
                 ))}
               </div>
             ) : (
               <div className="space-y-2">
                 {[
                   { label: 'Tornado Emergency', color: '#FF1493' },
                   { label: 'PDS Tornado', color: '#FF00FF' },
                   { label: 'Tornado (Observed)', color: '#8B0000' },
                   { label: 'Tornado Warning', color: '#FF0000' },
                   { label: 'Destructive Severe', color: '#FF4500' },
                   { label: 'Considerable Severe', color: '#FF8C00' },
                   { label: 'Severe T-Storm', color: '#FFFF00' },
                 ].map(item => (
                   <div key={item.label} className="flex items-center gap-3">
                     <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: item.color, opacity: 0.8 }} />
                     <span className="text-sm font-medium text-foreground">{item.label}</span>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>

      </div>
    </div>
  );
}
