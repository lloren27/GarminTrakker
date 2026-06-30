import type { FeatureCollection } from "geojson";
import { apiRequest } from "./apiClient";
import type { TrackingRouteResponse } from "../types/tracking";

export type Group = {
  _id?: string;
  name: string;
  owner: string;
  users: string[];
  usersPending: string[];
  inviteCode: string;
};

export type CreatedGroupResponse = {
  message: string;
  groupId: string;
  inviteCode: string;
};

export type JoinedGroupResponse = {
  message: string;
  groupId: string;
  groupName: string;
};

export type GroupLayer = {
  _id: string;
  groupId: string;
  type: "gpx";
  source: string;
  name: string;
  geoJson: FeatureCollection;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type GroupMember = {
  _id: string;
  login: string;
  email: string;
  role: "owner" | "participant";
  locationUpdatedAt?: string;
  garminPaired: boolean;
  garminOnline: boolean;
  garminLastSeenAt?: string;
};

export type GroupMembersResponse = {
  owner: GroupMember;
  participants: GroupMember[];
};

export function getGroups() {
  return apiRequest<Group[]>("/groups");
}

export function createGroup(name: string) {
  return apiRequest<CreatedGroupResponse>("/groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function joinGroup(inviteCode: string) {
  return apiRequest<JoinedGroupResponse>("/groups/join", {
    method: "POST",
    body: JSON.stringify({ inviteCode }),
  });
}

export function uploadGroupRoute(
  groupId: string,
  name: string,
  geoJson: FeatureCollection,
) {
  return apiRequest<GroupLayer>(`/groups/${groupId}/layers`, {
    method: "POST",
    body: JSON.stringify({
      name,
      type: "gpx",
      geoJson,
    }),
  });
}

export function getGroupTracking(groupId: string) {
  return apiRequest<TrackingRouteResponse>(`/groups/${groupId}/tracking`);
}

export function getGroupMembers(groupId: string) {
  return apiRequest<GroupMembersResponse>(`/groups/${groupId}/users`);
}
