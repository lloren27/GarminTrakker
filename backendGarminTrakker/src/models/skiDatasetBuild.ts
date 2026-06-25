export type SkiDatasetBuildTarget = string | "all" | "spain" | "failed";
export type SkiDatasetBuildStatus =
  | "idle"
  | "running"
  | "success"
  | "partial_success"
  | "error";
export type SkiDatasetBuildTrigger = "manual" | "scheduled";

export interface SkiDatasetBuildProgress {
  currentStation: string | null;
  currentStationName: string | null;
  phase: string | null;
  completedStations: number;
  totalStations: number;
  percent: number;
}

export interface SkiDatasetBuildStationError {
  station: string;
  stationName?: string;
  message: string;
  at: string;
}

export interface SkiDatasetBuildState {
  status: SkiDatasetBuildStatus;
  target: SkiDatasetBuildTarget | null;
  trigger: SkiDatasetBuildTrigger | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastSuccessAt: string | null;
  error: string | null;
  updatedStations: string[];
  progress: SkiDatasetBuildProgress;
  stationErrors: SkiDatasetBuildStationError[];
}
