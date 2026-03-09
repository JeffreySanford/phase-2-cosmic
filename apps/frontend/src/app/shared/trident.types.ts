export type ExecutionBlockStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export interface SchedulingBlock {
  id: string;
  startTime: string;
  endTime: string;
  subarray: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionBlock {
  id: string;
  schedulingBlockId: string;
  status: ExecutionBlockStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  result?: Record<string, unknown>;
}

export interface SubarrayConfiguration {
  id: string;
  antennas: string[];
  mode?: string;
  parameters?: Record<string, unknown>;
}

export interface SpectralConfiguration {
  band: string;
  centerFrequencyHz?: number;
  channelWidth: number;
  numChannels?: number;
}

export interface FspAllocation {
  fspId: string;
  startTime: string;
  endTime: string;
  params?: Record<string, unknown>;
}

export interface FspAllocationPlan {
  planId: string;
  subarray: string;
  allocations: FspAllocation[];
}
