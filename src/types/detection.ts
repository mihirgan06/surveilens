export interface Detection {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  timestamp: Date;
}

export interface Alert {
  id: string;
  type: 'warning' | 'danger' | 'info';
  message: string;
  timestamp: Date;
  detections: Detection[];
}

export interface SuspiciousActivity {
  type: string;
  confidence: number;
  description: string;
  timestamp: Date;
  frame?: string; // base64 encoded frame
}
