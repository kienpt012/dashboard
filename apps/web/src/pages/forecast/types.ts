export type ForecastRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type ModelInfo = {
  id?: string; trainedAt?: string | null; sampleCount: number; trainSamples: number; testSamples: number;
  targetCount: number; featureVersion: string; trained: boolean; sourceLabel: string; fallbackReason?: string | null;
  evaluationLabel?: string; history?: { realRows: number; simulatedRows: number };
  simulatedSamples: number;
  metrics: { auc: number | null; accuracy: number; brier: number; confusion: { tp: number; tn: number; fp: number; fn: number } } | null;
  importance: { feature: string; label: string; weight: number; importance: number }[];
};
export type Forecast = {
  applicable?: boolean; reason?: string; targetId: string; title: string; departmentId: string; departmentName: string;
  unit: string; targetValue: number; currentValue: number; direction: string; dueDate: string;
  probability: number; risk: ForecastRisk; riskLabel: string; projectedValue: number;
  interval: { lower: number; upper: number } | null; factors: string[]; sourceLabel: string; model: ModelInfo;
  series: { date: string; actual: number | null; predicted: number | null; lower: number | null; upper: number | null }[];
};
export type ForecastList = { items: Forecast[]; model: ModelInfo; generatedAt: string };
