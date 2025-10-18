import OpenAI from 'openai';

// Initialize OpenAI client - API key should be set in environment variable
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  dangerouslyAllowBrowser: true // Note: In production, use a backend proxy
});

export interface SceneAnalysis {
  description: string;
  activities: string[];
  peopleCount: number;
  objects: string[];
  suspiciousActivities: {
    type: string;
    confidence: number;
    description: string;
  }[];
  workflowTriggers: string[]; // e.g., ["fighting", "shoplifting", "crowding"]
}

export interface WorkflowRule {
  id: string;
  name: string;
  triggers: string[]; // Keywords to look for in scene analysis
  action: {
    type: 'email' | 'sms' | 'alert' | 'webhook';
    config: any;
  };
  enabled: boolean;
}

// Analyze a frame using GPT-4 Vision
export async function analyzeFrame(
  imageData: string, // base64 encoded image
  context?: string, // Additional context about what to look for
  workflowRules?: WorkflowRule[]
): Promise<SceneAnalysis> {
  try {
    const workflowTriggersList = workflowRules
      ?.filter(r => r.enabled)
      .flatMap(r => r.triggers)
      .join(', ') || '';

    const prompt = `Analyze this surveillance camera frame and provide a detailed analysis.

${context ? `Context: ${context}` : ''}

Please analyze for:
1. What activities are happening in the scene
2. Count of people visible
3. Objects present in the scene
4. Any suspicious or concerning activities (shoplifting, fighting, vandalism, loitering, unattended packages, etc.)
5. Safety concerns or security threats

${workflowTriggersList ? `Also specifically check for these activities: ${workflowTriggersList}` : ''}

Provide your analysis in this JSON format:
{
  "description": "Brief overall description of the scene",
  "activities": ["list of activities observed"],
  "peopleCount": number,
  "objects": ["list of visible objects"],
  "suspiciousActivities": [
    {
      "type": "activity type",
      "confidence": 0.0-1.0,
      "description": "detailed description"
    }
  ],
  "workflowTriggers": ["list of detected trigger keywords from the scene"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using gpt-4o-mini for cost efficiency, upgrade to gpt-4o for better accuracy
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageData}`,
                detail: "low" // Use "high" for more detailed analysis
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.3, // Lower temperature for more consistent analysis
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (content) {
      return JSON.parse(content) as SceneAnalysis;
    }
    
    throw new Error('No response from OpenAI');
  } catch (error) {
    console.error('Error analyzing frame with OpenAI:', error);
    
    // Return a default analysis on error
    return {
      description: 'Analysis failed',
      activities: [],
      peopleCount: 0,
      objects: [],
      suspiciousActivities: [],
      workflowTriggers: []
    };
  }
}

// Analyze scene with historical context for better understanding
export async function analyzeSceneWithContext(
  currentFrame: string,
  previousAnalyses: SceneAnalysis[],
  workflowRules?: WorkflowRule[]
): Promise<SceneAnalysis> {
  const recentContext = previousAnalyses
    .slice(-3)
    .map(a => a.description)
    .join(' → ');

  const contextPrompt = recentContext 
    ? `Previous scene context: ${recentContext}. Look for changes or progression in activities.`
    : undefined;

  return analyzeFrame(currentFrame, contextPrompt, workflowRules);
}

// Check if any workflow rules should be triggered
export function checkWorkflowTriggers(
  analysis: SceneAnalysis,
  rules: WorkflowRule[]
): WorkflowRule[] {
  const triggeredRules: WorkflowRule[] = [];
  
  for (const rule of rules) {
    if (!rule.enabled) continue;
    
    // Check if any of the rule's triggers are present in the analysis
    const isTriggered = rule.triggers.some(trigger => {
      const triggerLower = trigger.toLowerCase();
      
      // Check in activities
      if (analysis.activities.some(a => a.toLowerCase().includes(triggerLower))) {
        return true;
      }
      
      // Check in suspicious activities
      if (analysis.suspiciousActivities.some(s => 
        s.type.toLowerCase().includes(triggerLower) || 
        s.description.toLowerCase().includes(triggerLower)
      )) {
        return true;
      }
      
      // Check in workflow triggers
      if (analysis.workflowTriggers.some(w => w.toLowerCase().includes(triggerLower))) {
        return true;
      }
      
      // Check in description
      if (analysis.description.toLowerCase().includes(triggerLower)) {
        return true;
      }
      
      return false;
    });
    
    if (isTriggered) {
      triggeredRules.push(rule);
    }
  }
  
  return triggeredRules;
}

// Default workflow rules (can be customized by user)
export const defaultWorkflowRules: WorkflowRule[] = [
  {
    id: 'rule-fighting',
    name: 'Fighting Detection',
    triggers: ['fighting', 'violence', 'assault', 'physical altercation'],
    action: {
      type: 'email',
      config: {
        to: 'security@example.com',
        subject: 'URGENT: Fighting detected in surveillance',
        priority: 'high'
      }
    },
    enabled: true
  },
  {
    id: 'rule-shoplifting',
    name: 'Shoplifting Detection',
    triggers: ['shoplifting', 'theft', 'stealing', 'concealing merchandise'],
    action: {
      type: 'alert',
      config: {
        severity: 'high',
        sound: true
      }
    },
    enabled: true
  },
  {
    id: 'rule-weapon',
    name: 'Weapon Detection',
    triggers: ['weapon', 'gun', 'knife', 'armed'],
    action: {
      type: 'email',
      config: {
        to: 'police@example.com',
        subject: 'CRITICAL: Weapon detected',
        priority: 'critical'
      }
    },
    enabled: true
  },
  {
    id: 'rule-vandalism',
    name: 'Vandalism Detection',
    triggers: ['vandalism', 'graffiti', 'property damage', 'breaking'],
    action: {
      type: 'alert',
      config: {
        severity: 'medium'
      }
    },
    enabled: true
  },
  {
    id: 'rule-fire',
    name: 'Fire/Smoke Detection',
    triggers: ['fire', 'smoke', 'flames', 'burning'],
    action: {
      type: 'email',
      config: {
        to: 'emergency@example.com',
        subject: 'EMERGENCY: Fire detected',
        priority: 'critical'
      }
    },
    enabled: true
  },
  {
    id: 'rule-crowding',
    name: 'Unusual Crowding',
    triggers: ['crowding', 'large group', 'mob', 'gathering'],
    action: {
      type: 'alert',
      config: {
        severity: 'medium'
      }
    },
    enabled: true
  },
  {
    id: 'rule-fall',
    name: 'Person Fall/Medical Emergency',
    triggers: ['person fallen', 'medical emergency', 'unconscious', 'collapsed'],
    action: {
      type: 'email',
      config: {
        to: 'medical@example.com',
        subject: 'Medical Emergency Detected',
        priority: 'high'
      }
    },
    enabled: true
  }
];
