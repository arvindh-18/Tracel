import { RawTrace } from '../../trace/normalize';
import { TraceError } from '../../trace/schema';

export interface RunRequest {
  source: string;
  stdin?: string;
  stepLimit?: number;
  /** Short status for the Run button, e.g. "Analyzing code with AI…". */
  onStatus?: (message: string) => void;
}

export type RunProgress = {
  type: 'progress';
  stepCount: number;
};

export type RunResult = {
  type: 'result';
  rawTrace: RawTrace;
};

export type RunEvent = RunProgress | RunResult;

export interface SupportInfo {
  allowedImports?: string[];
  supportedFeatures: string[];
  unsupportedFeatures: string[];
  limitsDescription: string;
}

export interface LanguageAdapter {
  id: 'python' | 'c' | 'cpp';
  displayName: string;
  engineLabel: string;
  fileExtension: string;
  prepare(): Promise<void>;
  run(
    req: RunRequest,
    onProgress?: (stepCount: number) => void
  ): Promise<RawTrace>;
  supportInfo: SupportInfo;
  /** Abandons the run in progress, if any; its promise rejects with RunCancelled. */
  cancel?(): void;
}

export class RunCancelled extends Error {
  constructor() {
    super('Run cancelled');
  }
}

