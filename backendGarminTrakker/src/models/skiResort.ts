export interface SkiDatasetManifest {
  station: string;
  stationName?: string;
  country?: string;
  region?: string;
  version: string;
  updatedAt: string;
  stats?: {
    pistes: number;
    lifts: number;
    total: number;
  };
  files: SkiDatasetFile[];
}

export interface SkiDatasetFile {
  name: string;
  size: number;
}

export type OverpassElement = {
  id: number;
  type: string;
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

export type SkiBoundingBox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export interface SkiResortCatalogItem {
  slug: string;
  name: string;
  country: "ES";
  region: string;
  bbox: SkiBoundingBox;
  aliases?: string[];
  enabled: boolean;
}

export type GeoJsonFeature = {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  properties: {
    id: string;
    name: string | null;
    station: string;
    stationName?: string;
    featureType: "piste" | "lift" | "other";
    difficulty: string | null;
    difficultyColor: string | null;
    liftType: string | null;
    osmType: string;
    osmId: number;
    source: "osm";
  };
};

export type SkiFeatureType = "piste" | "lift" | "other";

export interface SkiGeoJsonFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  properties: {
    id: string;
    name: string | null;
    station: string;
    stationName?: string;
    featureType: SkiFeatureType;
    difficulty: string | null;
    difficultyColor: string | null;
    liftType: string | null;
    osmType: string;
    osmId: number;
    source: "osm";
  };
}

export interface SkiGeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: SkiGeoJsonFeature[];
}
