import { ObjectId } from "mongodb";

export interface GroupLayerPreference {
  _id?: ObjectId;
  groupId: ObjectId;
  userId: ObjectId;
  visibleLayerIds: ObjectId[];
  updatedAt: string;
}
