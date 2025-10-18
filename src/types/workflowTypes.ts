// Workflow Types

export type WorkflowNodeType = 'trigger' | 'condition' | 'action';

export type TriggerType = 
  | 'person_detected'
  | 'person_entered'
  | 'person_exited'
  | 'suspicious_activity'
  | 'fight_detected'
  | 'robbery_detected'
  | 'motion_detected'
  | 'object_detected'
  | 'custom_event';

export type ConditionType =
  | 'time_filter'
  | 'counter'
  | 'delay'
  | 'zone_filter'
  | 'confidence_check';

export type ActionType =
  | 'gmail'
  | 'slack'
  | 'sms'
  | 'vapi_call'
  | 'webhook'
  | 'database_log'
  | 'save_screenshot';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  subtype: TriggerType | ConditionType | ActionType;
  label: string;
  config: Record<string, any>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  enabled: boolean;
}

