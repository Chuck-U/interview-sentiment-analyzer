export type AnalyzeChunkInput = {
  readonly chunkId: string;
  readonly sessionId: string;
};

export type FinalizeAnalysisInput = {
  readonly sessionId: string;
};

export type AnalysisProvider = {
  analyzeChunk(input: AnalyzeChunkInput): Promise<void>;
  finalizeSession(input: FinalizeAnalysisInput): Promise<void>;
};
