import type { Node, Edge } from 'reactflow';
import type { DetectionEvent, SceneContext } from '../types/detectionTypes';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

export interface WorkflowExecution {
  workflowId: string;
  triggeredBy: string;
  timestamp: number;
  status: 'running' | 'completed' | 'failed';
  activeNodes: string[];
}

class WorkflowEngine {
  private executions: Map<string, WorkflowExecution> = new Map();
  private executionCallbacks: ((execution: WorkflowExecution) => void)[] = [];

  /**
   * Check if a trigger node matches the current events/context
   */
  async checkTrigger(
    triggerNode: Node,
    events: DetectionEvent[],
    sceneContext: SceneContext | null
  ): Promise<boolean> {
    const triggerType = triggerNode.data.blockType;
    
    console.log('🔍 Checking trigger:', triggerType, 'against', events.length, 'events');
    console.log('📋 Event types present:', events.map(e => e.type));

    // For custom triggers, use LLM matching
    if (triggerType === 'custom_event') {
      console.log('🎨 Custom trigger detected, using LLM matching');
      return await this.checkCustomTrigger(
        triggerNode.data.config?.condition || '',
        events,
        sceneContext
      );
    }

    // Normalize trigger type to uppercase for matching
    const normalizedTrigger = triggerType.toUpperCase();
    
    // Check if any event matches this trigger
    const matched = events.some(e => {
      const eventType = e.type.toUpperCase();
      
      // Direct match
      if (eventType === normalizedTrigger) {
        console.log('✅ Direct match:', eventType, '===', normalizedTrigger);
        return true;
      }
      
      // Handle aliases and variations
      if (triggerType === 'person_detected' || triggerType === 'person_entered') {
        const personMatch = eventType.includes('PERSON') && (eventType.includes('ENTERED') || eventType.includes('DETECTED'));
        if (personMatch) {
          console.log('✅ Person match:', eventType);
          return true;
        }
      }
      
      if (triggerType === 'fight_detected') {
        const fightMatch = eventType.includes('FIGHT') || eventType.includes('VIOLENCE');
        if (fightMatch) {
          console.log('✅ Fight match:', eventType);
          return true;
        }
      }
      
      if (triggerType === 'robbery_detected') {
        const robberyMatch = eventType.includes('ROBBERY') || eventType.includes('BREAK');
        if (robberyMatch) {
          console.log('✅ Robbery match:', eventType);
          return true;
        }
      }
      
      if (triggerType === 'suspicious_activity') {
        const suspiciousMatch = eventType.includes('SUSPICIOUS') || eventType.includes('LOITERING') || eventType.includes('SHOPLIFTING');
        if (suspiciousMatch) {
          console.log('✅ Suspicious activity match:', eventType);
          return true;
        }
      }
      
      if (triggerType === 'object_detected') {
        // Any event counts as object detected
        console.log('✅ Object detected (any event):', eventType);
        return true;
      }
      
      return false;
    });

    if (matched) {
      console.log('🎯 Trigger MATCHED:', triggerType);
    } else {
      console.log('❌ No match for trigger:', triggerType);
    }

    return matched;
  }

  /**
   * Use LLM to check if custom trigger condition matches
   */
  private async checkCustomTrigger(
    condition: string,
    events: DetectionEvent[],
    sceneContext: SceneContext | null
  ): Promise<boolean> {
    if (!condition) {
      console.log('⚠️ Custom trigger has no condition defined');
      return false;
    }

    if (!sceneContext) {
      console.log('⚠️ No scene context available for custom trigger');
      return false;
    }

    console.log('🎨 Checking custom trigger condition:', condition);

    try {
      const eventSummary = events.length > 0 
        ? events.map(e => `- ${e.type} (${(e.confidence * 100).toFixed(0)}% confidence): ${e.description}`).join('\n')
        : 'No specific events detected';

      const prompt = `You are a surveillance AI evaluating if a custom trigger condition matches the current scene.

CURRENT SCENE DESCRIPTION:
${sceneContext.description}

DETECTED EVENTS:
${eventSummary}

PEOPLE COUNT: ${sceneContext.peopleCount}
ACTIVITIES: ${sceneContext.activities.join(', ')}

USER'S CUSTOM TRIGGER CONDITION:
"${condition}"

TASK: Determine if the current scene/events match the user's trigger condition. Be flexible with interpretation - if the scene is semantically similar or related to the condition, it should match.

Examples:
- If condition is "someone stealing" and scene shows "person concealing items", that's a MATCH
- If condition is "fight" and scene shows "physical altercation", that's a MATCH
- If condition is "person enters" and scene shows "new person detected", that's a MATCH

Respond with ONLY "YES" or "NO".`;

      console.log('🤖 Sending custom trigger check to AI...');

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0
      });

      const answer = response.choices[0].message.content?.trim().toUpperCase();
      const matched = answer === 'YES';
      
      console.log(matched ? '✅ Custom trigger MATCHED' : '❌ Custom trigger did NOT match');
      
      return matched;
    } catch (error) {
      console.error('❌ Error checking custom trigger:', error);
      return false;
    }
  }

  /**
   * Execute a workflow when triggered
   */
  async executeWorkflow(
    nodes: Node[],
    edges: Edge[],
    triggerNodeId: string,
    event: DetectionEvent
  ): Promise<void> {
    const workflowId = `workflow_${Date.now()}`;
    
    console.log('🚀 Executing workflow triggered by:', triggerNodeId);
    
    const execution: WorkflowExecution = {
      workflowId,
      triggeredBy: triggerNodeId,
      timestamp: Date.now(),
      status: 'running',
      activeNodes: [triggerNodeId]
    };

    this.executions.set(workflowId, execution);
    this.notifyExecutionUpdate(execution);

    try {
      // Find connected nodes
      const connectedNodes = this.getConnectedNodes(triggerNodeId, nodes, edges);
      
      for (const node of connectedNodes) {
        execution.activeNodes = [node.id];
        this.notifyExecutionUpdate(execution);
        
        await this.executeNode(node, event);
        
        // Wait a bit for visual feedback
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      execution.status = 'completed';
      execution.activeNodes = [];
      this.notifyExecutionUpdate(execution);
      
      console.log('✅ Workflow completed:', workflowId);
    } catch (error) {
      console.error('❌ Workflow execution failed:', error);
      execution.status = 'failed';
      this.notifyExecutionUpdate(execution);
    }
  }

  /**
   * Execute a single node (action block)
   */
  private async executeNode(node: Node, event: DetectionEvent): Promise<void> {
    const nodeType = node.data.blockType;
    const config = node.data.config || {};
    
    console.log(`⚡ Executing ${nodeType} node:`, node.data.label);

    switch (nodeType) {
      case 'gmail':
        await this.sendGmail(config, event);
        break;
      
      case 'slack':
        await this.sendSlack(config, event);
        break;
      
      case 'sms':
        await this.sendSMS(config, event);
        break;
      
      case 'vapi_call':
        await this.makeVAPICall(config, event);
        break;
      
      case 'webhook':
        await this.callWebhook(config, event);
        break;
      
      case 'database_log':
        await this.logToDatabase(config, event);
        break;
      
      case 'save_screenshot':
        await this.saveScreenshot(config, event);
        break;
      
      default:
        console.log('⚠️ Unknown node type:', nodeType);
    }
  }

  /**
   * Get all nodes connected to a trigger node
   */
  private getConnectedNodes(startNodeId: string, nodes: Node[], edges: Edge[]): Node[] {
    console.log('🔗 Finding nodes connected to:', startNodeId);
    console.log('📊 Total nodes:', nodes.length, 'Total edges:', edges.length);
    
    const connected: Node[] = [];
    const visited = new Set<string>();
    const queue = [startNodeId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      // Find edges from this node
      const outgoingEdges = edges.filter(e => e.source === currentId);
      console.log(`📍 Node ${currentId} has ${outgoingEdges.length} outgoing edges`);
      
      for (const edge of outgoingEdges) {
        const targetNode = nodes.find(n => n.id === edge.target);
        if (targetNode) {
          console.log(`  ➡️ Connected to: ${targetNode.data.label} (${targetNode.data.blockType})`);
          if (targetNode.data.nodeType !== 'trigger') {
            connected.push(targetNode);
            queue.push(edge.target);
          }
        }
      }
    }

    console.log('✅ Found', connected.length, 'connected nodes:', connected.map(n => n.data.label));
    return connected;
  }

  /**
   * Action implementations
   */
  private async sendGmail(config: any, event: DetectionEvent): Promise<void> {
    if (!config.authenticated || !config.to) {
      console.log('⚠️ Gmail not configured');
      return;
    }

    const subject = this.replaceVariables(config.subject, event);
    const body = this.replaceVariables(config.body, event);

    try {
      const response = await fetch('http://localhost:3001/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: config.nodeId,
          to: config.to,
          subject,
          body
        })
      });

      if (response.ok) {
        console.log('📧 Email sent successfully');
      } else {
        console.error('❌ Failed to send email:', await response.text());
      }
    } catch (error) {
      console.error('❌ Email error:', error);
    }
  }

  private async sendSlack(config: any, event: DetectionEvent): Promise<void> {
    console.log('💬 Slack message would be sent:', config);
    // TODO: Implement Slack webhook
  }

  private async sendSMS(config: any, event: DetectionEvent): Promise<void> {
    console.log('📱 SMS would be sent:', config);
    // TODO: Implement Twilio SMS
  }

  private async makeVAPICall(config: any, event: DetectionEvent): Promise<void> {
    console.log('📞 VAPI call would be made:', config);
    // TODO: Implement VAPI voice call
  }

  private async callWebhook(config: any, event: DetectionEvent): Promise<void> {
    console.log('🔗 Webhook would be called:', config);
    // TODO: Implement webhook POST
  }

  private async logToDatabase(config: any, event: DetectionEvent): Promise<void> {
    console.log('💾 Database log:', event);
    // TODO: Implement database logging
  }

  private async saveScreenshot(config: any, event: DetectionEvent): Promise<void> {
    console.log('📸 Screenshot would be saved:', config);
    // TODO: Implement screenshot capture
  }

  /**
   * Replace variables in templates
   */
  private replaceVariables(template: string, event: DetectionEvent): string {
    return template
      .replace(/\{\{event_type\}\}/g, event.type)
      .replace(/\{\{event_description\}\}/g, event.description)
      .replace(/\{\{timestamp\}\}/g, new Date(event.timestamp).toLocaleString())
      .replace(/\{\{confidence\}\}/g, (event.confidence * 100).toFixed(0) + '%');
  }

  /**
   * Subscribe to execution updates
   */
  onExecutionUpdate(callback: (execution: WorkflowExecution) => void): () => void {
    this.executionCallbacks.push(callback);
    return () => {
      const index = this.executionCallbacks.indexOf(callback);
      if (index > -1) this.executionCallbacks.splice(index, 1);
    };
  }

  private notifyExecutionUpdate(execution: WorkflowExecution): void {
    this.executionCallbacks.forEach(cb => cb(execution));
  }
}

export const workflowEngine = new WorkflowEngine();

