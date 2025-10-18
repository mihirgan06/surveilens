export type DetectedObject = {
  class: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  timestamp: number;
};

export type DetectionEvent = {
  type: string;
  confidence: number;
  description: string;
  timestamp: number;
  objects: DetectedObject[];
  metadata: Record<string, any>;
};

export type SceneContext = {
  description: string;
  peopleCount: number;
  activities: string[];
  objects: string[];
  suspiciousActivities: Array<{
    type: string;
    confidence: number;
    description: string;
  }>;
  detectedEvents: string[];
};

