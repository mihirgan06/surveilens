import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import type { Detection, SuspiciousActivity } from '../types/detection';

let model: cocoSsd.ObjectDetection | null = null;

export async function loadModel() {
  if (!model) {
    model = await cocoSsd.load();
  }
  return model;
}

export async function detectObjects(
  video: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
): Promise<Detection[]> {
  const model = await loadModel();
  const predictions = await model.detect(video);
  
  return predictions.map(pred => ({
    class: pred.class,
    score: pred.score,
    bbox: pred.bbox as [number, number, number, number],
    timestamp: new Date()
  }));
}

// Analyze detections for suspicious activities
export function analyzeSuspiciousActivity(
  detections: Detection[],
  previousDetections: Detection[]
): SuspiciousActivity[] {
  const activities: SuspiciousActivity[] = [];
  
  // Check for multiple people in restricted hours (example: after 10 PM)
  const currentHour = new Date().getHours();
  const peopleCount = detections.filter(d => d.class === 'person').length;
  
  if (currentHour >= 22 || currentHour <= 6) {
    if (peopleCount > 0) {
      activities.push({
        type: 'after-hours-activity',
        confidence: 0.8,
        description: `${peopleCount} person(s) detected during restricted hours`,
        timestamp: new Date()
      });
    }
  }
  
  // Check for suspicious objects combinations
  const hasBackpack = detections.some(d => d.class === 'backpack');
  const hasPerson = detections.some(d => d.class === 'person');
  const hasMultiplePeople = detections.filter(d => d.class === 'person').length > 2;
  
  if (hasBackpack && !hasPerson) {
    activities.push({
      type: 'unattended-bag',
      confidence: 0.7,
      description: 'Unattended bag detected - potential security risk',
      timestamp: new Date()
    });
  }
  
  // Check for crowding
  if (hasMultiplePeople) {
    activities.push({
      type: 'crowding',
      confidence: 0.6,
      description: `Unusual crowding detected - ${peopleCount} people in frame`,
      timestamp: new Date()
    });
  }
  
  // Check for rapid movement (comparing with previous detections)
  if (previousDetections.length > 0 && detections.length > 0) {
    const currentPersons = detections.filter(d => d.class === 'person');
    const previousPersons = previousDetections.filter(d => d.class === 'person');
    
    if (currentPersons.length > 0 && previousPersons.length > 0) {
      // Simple motion detection based on position change
      const currentPos = currentPersons[0].bbox;
      const prevPos = previousPersons[0].bbox;
      
      const distance = Math.sqrt(
        Math.pow(currentPos[0] - prevPos[0], 2) + 
        Math.pow(currentPos[1] - prevPos[1], 2)
      );
      
      if (distance > 100) { // Threshold for rapid movement
        activities.push({
          type: 'rapid-movement',
          confidence: 0.5,
          description: 'Rapid movement detected - possible running or suspicious behavior',
          timestamp: new Date()
        });
      }
    }
  }
  
  // Check for weapons or dangerous objects (note: COCO-SSD has limited classes)
  const dangerousObjects = ['knife', 'scissors'];
  const hasDangerousObject = detections.some(d => 
    dangerousObjects.includes(d.class.toLowerCase())
  );
  
  if (hasDangerousObject) {
    activities.push({
      type: 'dangerous-object',
      confidence: 0.9,
      description: 'Potentially dangerous object detected',
      timestamp: new Date()
    });
  }
  
  return activities;
}

// Shoplifting detection logic (simplified)
export function detectShoplifting(
  detections: Detection[],
  detectionHistory: Detection[][]
): SuspiciousActivity | null {
  // This is a simplified example - real shoplifting detection would need more sophisticated analysis
  
  const recentHistory = detectionHistory.slice(-10); // Last 10 frames
  
  // Check for person near valuable items
  const hasPerson = detections.some(d => d.class === 'person');
  const hasHandbag = detections.some(d => d.class === 'handbag' || d.class === 'backpack');
  
  // Check for concealment behavior patterns
  if (hasPerson && hasHandbag) {
    // Check if person's position is changing rapidly (potential concealment)
    const personMovements = recentHistory.map(frame => 
      frame.filter(d => d.class === 'person')
    ).filter(persons => persons.length > 0);
    
    if (personMovements.length >= 5) {
      // Analyze movement patterns
      const positions = personMovements.map(persons => persons[0].bbox);
      let suspiciousMovement = false;
      
      // Check for erratic movement patterns
      for (let i = 1; i < positions.length; i++) {
        const dx = positions[i][0] - positions[i-1][0];
        const dy = positions[i][1] - positions[i-1][1];
        
        if (Math.abs(dx) > 50 || Math.abs(dy) > 50) {
          suspiciousMovement = true;
          break;
        }
      }
      
      if (suspiciousMovement) {
        return {
          type: 'potential-shoplifting',
          confidence: 0.6,
          description: 'Suspicious behavior detected - potential shoplifting activity',
          timestamp: new Date()
        };
      }
    }
  }
  
  return null;
}
