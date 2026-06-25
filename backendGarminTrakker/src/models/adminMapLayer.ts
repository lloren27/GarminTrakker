import { ObjectId } from "mongodb";

export type AdminMapLayerType = "geojson" | "gpx" | "kml";
export type AdminMapLayerSource = "url" | "inline" | "upload";

export interface AdminMapLayerExtraction {
  status: "success" | "error";
  fetchedAt: string;
  featureCount: number;
  error?: string;
}

export interface AdminMapLayer {
  _id?: ObjectId;
  type: AdminMapLayerType;
  source: AdminMapLayerSource;
  name: string;
  description?: string;
  sourceUrl?: string;
  geoJson: Record<string, unknown>;
  isActive: boolean;
  extraction: AdminMapLayerExtraction;
  createdBy: ObjectId;
  updatedBy: ObjectId;
  createdAt: string;
  updatedAt: string;
}
