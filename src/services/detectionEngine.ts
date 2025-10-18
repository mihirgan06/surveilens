import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import OpenAI from 'openai';
import type { DetectedObject, DetectionEvent, SceneContext } from '../types/detectionTypes';

// Re-export types
export type { DetectedObject, DetectionEvent, SceneContext } from '../types/detectionTypes';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  dangerouslyAllowBrowser: true
});

// Detection Engine Class
export class DetectionEngine {
  private cocoModel: cocoSsd.ObjectDetection | null = null;
  private previousObjects: DetectedObject[] = [];
  private detectionHistory: DetectedObject[][] = [];
  private eventHistory: DetectionEvent[] = [];
  private lastAIAnalysis: number = 0;
  private aiAnalysisInterval: number = 3000; // 3 seconds - much faster

  // Initialize the detection models
  async initialize() {
    console.log('🚀 Initializing Detection Engine...');
    this.cocoModel = await cocoSsd.load();
    console.log('✅ COCO-SSD Model loaded');
  }

  // Layer 1: Fast local object detection (runs every frame)
  async detectObjects(
    videoElement: HTMLVideoElement | HTMLCanvasElement
  ): Promise<DetectedObject[]> {
    if (!this.cocoModel) {
      throw new Error('Detection model not initialized');
    }

    const predictions = await this.cocoModel.detect(videoElement);
    
    const objects: DetectedObject[] = predictions.map(pred => ({
      class: pred.class,
      confidence: pred.score,
      bbox: pred.bbox as [number, number, number, number],
      timestamp: Date.now()
    }));

    // Store in history
    this.previousObjects = objects;
    this.detectionHistory.push(objects);
    if (this.detectionHistory.length > 30) {
      this.detectionHistory.shift(); // Keep last 30 frames
    }

    return objects;
  }

  // Layer 2: AI-powered scene understanding (runs periodically)
  async analyzeScene(
    frameData: string, // base64 image
    forceAnalysis: boolean = false
  ): Promise<SceneContext | null> {
    const now = Date.now();
    
    // Only analyze if enough time has passed or forced
    if (!forceAnalysis && (now - this.lastAIAnalysis) < this.aiAnalysisInterval) {
      return null;
    }

    this.lastAIAnalysis = now;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are a CRITICAL SECURITY AI analyzing surveillance footage. Your job is to detect threats IMMEDIATELY and ACCURATELY.

🚨 PRIORITY DETECTION (flag these FIRST if present):
1. ROBBERY/BREAK-IN: Multiple people in dark clothing, hoods, masks, aggressive movement, forcing entry, pushing people
2. VIOLENCE/FIGHTING: Physical altercations, aggressive body language, weapons
3. SHOPLIFTING: Concealing items, looking around nervously, stuffing items in bags/clothing
4. VANDALISM: Breaking things, spray painting, destroying property
5. WEAPONS: Guns, knives, bats, any threatening objects
6. MEDICAL EMERGENCY: ONLY if person is CLEARLY injured, bleeding, on the ground, collapsed, or being attacked. DO NOT flag just for concerned facial expressions or someone sitting normally.

⚠️ SECONDARY CONCERNS:
- Loitering (ONLY if person standing still for extended time, NOT if actively moving)
- Unattended bags
- Crowding
- After-hours activity
- Suspicious behavior patterns

RULES:
- If you see hooded figures in dark clothing forcing entry or pushing people → ROBBERY (high confidence 0.9+)
- If you see physical contact or aggression → FIGHTING (high confidence 0.9+)
- Don't call it "loitering" if people are ACTIVELY MOVING or doing something aggressive
- MEDICAL EMERGENCY requires VISIBLE injury, blood, person on ground, or physical attack - NOT just facial expressions
- A concerned face, worried look, or someone sitting/standing normally is NOT a medical emergency
- Be decisive and accurate - security depends on it

Return JSON:
{
  "description": "What is happening RIGHT NOW",
  "peopleCount": number,
  "activities": ["specific actions people are taking"],
  "objects": ["visible objects"],
  "suspiciousActivities": [
    {
      "type": "robbery_detected" | "fighting_detected" | "shoplifting_suspected" | "loitering_detected" | "vandalism_detected" | "weapon_detected" | "medical_emergency",
      "confidence": 0.0-1.0 (be HIGH if obvious),
      "description": "detailed description"
    }
  ],
  "detectedEvents": ["robbery_detected", "fighting_detected", "person_entered", etc.]
}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${frameData}`,
                  detail: "low"
                }
              }
            ]
          }
        ],
        max_tokens: 600,
        temperature: 0.2,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (content) {
        const analysis = JSON.parse(content) as SceneContext;
        
        // Generate events based on AI analysis
        this.generateEvents(analysis);
        
        return analysis;
      }
    } catch (error) {
      console.error('AI Analysis Error:', error);
    }

    return null;
  }

  // Generate workflow-triggerable events from analysis
  private generateEvents(context: SceneContext) {
    const events: DetectionEvent[] = [];

    // Generate events for each detected activity
    context.detectedEvents.forEach(eventType => {
      events.push({
        type: eventType,
        confidence: 0.8,
        description: context.description,
        timestamp: Date.now(),
        objects: this.previousObjects,
        metadata: {
          peopleCount: context.peopleCount,
          activities: context.activities
        }
      });
    });

    // Generate events for suspicious activities
    context.suspiciousActivities.forEach(activity => {
      events.push({
        type: activity.type,
        confidence: activity.confidence,
        description: activity.description,
        timestamp: Date.now(),
        objects: this.previousObjects,
        metadata: {
          peopleCount: context.peopleCount
        }
      });
    });

    // Add to event history
    this.eventHistory.push(...events);
    if (this.eventHistory.length > 100) {
      this.eventHistory = this.eventHistory.slice(-100);
    }
  }

  // Analyze motion and changes between frames
  detectMotion(): {
    hasMotion: boolean;
    motionLevel: 'low' | 'medium' | 'high';
    description: string;
  } {
    if (this.detectionHistory.length < 2) {
      return { hasMotion: false, motionLevel: 'low', description: 'Insufficient data' };
    }

    const current = this.detectionHistory[this.detectionHistory.length - 1];
    const previous = this.detectionHistory[this.detectionHistory.length - 2];

    // Compare person positions
    const currentPeople = current.filter(obj => obj.class === 'person');
    const previousPeople = previous.filter(obj => obj.class === 'person');

    if (currentPeople.length === 0 && previousPeople.length === 0) {
      return { hasMotion: false, motionLevel: 'low', description: 'No people detected' };
    }

    // Detect new people entering
    if (currentPeople.length > previousPeople.length) {
      return {
        hasMotion: true,
        motionLevel: 'high',
        description: `${currentPeople.length - previousPeople.length} new person(s) entered`
      };
    }

    // Detect people leaving
    if (currentPeople.length < previousPeople.length) {
      return {
        hasMotion: true,
        motionLevel: 'medium',
        description: `${previousPeople.length - currentPeople.length} person(s) left`
      };
    }

    // Detect movement
    if (currentPeople.length > 0 && previousPeople.length > 0) {
      const avgMovement = this.calculateAverageMovement(currentPeople, previousPeople);
      
      if (avgMovement > 100) {
        return { hasMotion: true, motionLevel: 'high', description: 'Rapid movement detected' };
      } else if (avgMovement > 30) {
        return { hasMotion: true, motionLevel: 'medium', description: 'Moderate movement detected' };
      } else if (avgMovement > 5) {
        return { hasMotion: true, motionLevel: 'low', description: 'Slow movement detected' };
      }
    }

    return { hasMotion: false, motionLevel: 'low', description: 'No significant motion' };
  }

  private calculateAverageMovement(
    current: DetectedObject[],
    previous: DetectedObject[]
  ): number {
    if (current.length === 0 || previous.length === 0) return 0;

    let totalMovement = 0;
    const count = Math.min(current.length, previous.length);

    for (let i = 0; i < count; i++) {
      const [x1, y1] = current[i].bbox;
      const [x2, y2] = previous[i].bbox;
      const distance = Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
      totalMovement += distance;
    }

    return totalMovement / count;
  }

  // Get recent events (for workflow triggers)
  getRecentEvents(seconds: number = 10): DetectionEvent[] {
    const cutoff = Date.now() - (seconds * 1000);
    return this.eventHistory.filter(event => event.timestamp > cutoff);
  }

  // Get all unique event types detected
  getDetectedEventTypes(): string[] {
    const types = new Set(this.eventHistory.map(e => e.type));
    return Array.from(types);
  }

  // Clear history
  clearHistory() {
    this.detectionHistory = [];
    this.eventHistory = [];
    this.previousObjects = [];
  }
}

// Singleton instance
export const detectionEngine = new DetectionEngine();
