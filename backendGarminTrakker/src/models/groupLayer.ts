import { ObjectId } from "mongodb";

export type GroupLayerType = "gpx";
export type GroupLayerSource = "user_upload" | "admin_catalog" | "system";

export interface GroupLayer {
  _id?: ObjectId;
  groupId: ObjectId;
  type: GroupLayerType;
  source: GroupLayerSource;
  name: string;
  geoJson: Record<string, unknown>;
  createdBy: ObjectId;
  createdAt: string;
  updatedAt: string;
}
