import type { Node, Edge } from 'reactflow';
import type { DetectionEvent, SceneContext } from '../types/detectionTypes';
import OpenAI from 'openai';

const DEFAULT_SLACK_TEMPLATE = [
  '[Surveilens] Security issue detected',
  'Issue: {{event_type}}',
  'Details: {{event_description}}',
  'Time: {{timestamp}}',
  'Confidence: {{confidence}}',
  'Action: Please investigate as soon as possible.'
].join('\n');

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

    if (events.length === 0) {
      console.log('⚠️ No events to check against custom trigger');
      return false;
    }

    console.log('🎨 Checking custom trigger condition:', condition);

    try {
      const eventSummary = events.map(e => 
        `- ${e.type.replace(/_/g, ' ')} (${(e.confidence * 100).toFixed(0)}% confidence): ${e.description}`
      ).join('\n');

      // Build context string
      let contextInfo = `DETECTED EVENTS:\n${eventSummary}`;
      
      if (sceneContext) {
        contextInfo += `\n\nSCENE CONTEXT:\n`;
        contextInfo += `Description: ${sceneContext.description}\n`;
        contextInfo += `People Count: ${sceneContext.peopleCount}\n`;
        contextInfo += `Activities: ${sceneContext.activities.join(', ')}`;
      }

      const prompt = `You are a surveillance AI evaluating if a custom trigger condition matches detected events.

${contextInfo}

USER'S CUSTOM TRIGGER CONDITION:
"${condition}"

TASK: Determine if the detected events or scene match the user's trigger condition. Be flexible with interpretation - if the events are semantically similar or related to the condition, it should match.

Examples:
- If condition is "someone stealing" and events show "robbery detected" or "person concealing items", that's a MATCH
- If condition is "fight" and events show "fighting detected" or "violence detected", that's a MATCH  
- If condition is "person wearing mask" and events mention "masked individual", that's a MATCH
- If condition is "person enters" and events show "person entered", that's a MATCH

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
      // Use BFS to group nodes by level for parallel execution
      const nodeLevels = this.getNodesByLevel(triggerNodeId, nodes, edges);
      console.log(`📦 Will execute ${nodeLevels.flat().length} action nodes in ${nodeLevels.length} levels`);
      
      for (let levelIndex = 0; levelIndex < nodeLevels.length; levelIndex++) {
        const levelNodes = nodeLevels[levelIndex];
        console.log(`\n🔄 LEVEL ${levelIndex + 1}: Executing ${levelNodes.length} nodes in parallel`);

        // Show ALL nodes in this level as executing simultaneously
        execution.activeNodes = levelNodes.map(n => n.id);
        this.notifyExecutionUpdate(execution);

        // Wait for visual feedback to show
        await new Promise(resolve => setTimeout(resolve, 300));

        // Execute all nodes at this level in parallel
        const levelResults = await Promise.allSettled(
          levelNodes.map(async (node, i) => {
            console.log(`  ⚡ [Level ${levelIndex + 1}, Node ${i + 1}/${levelNodes.length}] Executing: ${node.data.label} (${node.data.blockType})`);
            try {
              await this.executeNode(node, event);
              console.log(`  ✅ [Level ${levelIndex + 1}, Node ${i + 1}/${levelNodes.length}] Completed: ${node.data.label}`);
              return { success: true, node };
            } catch (error) {
              console.error(`  ❌ [Level ${levelIndex + 1}, Node ${i + 1}/${levelNodes.length}] Failed: ${node.data.label}`, error);
              return { success: false, node, error };
            }
          })
        );

        // Check if any condition failed
        const failedCondition = levelResults.find(
          (result) =>
            result.status === 'fulfilled' &&
            !result.value.success &&
            result.value.node.data.nodeType === 'condition'
        );

        if (failedCondition) {
          console.log('🛑 Workflow stopped: Condition failed');
          execution.status = 'failed';
          execution.activeNodes = [];
          this.notifyExecutionUpdate(execution);
          return;
        }

        // Keep the nodes highlighted for a moment after completion
        await new Promise(resolve => setTimeout(resolve, 700));

        console.log(`✅ Level ${levelIndex + 1} completed`);
      }

      execution.status = 'completed';
      execution.activeNodes = [];
      this.notifyExecutionUpdate(execution);
      
      console.log('\n✅ Workflow completed:', workflowId);
      console.log(`📊 Executed ${nodeLevels.flat().length} total actions across ${nodeLevels.length} levels\n`);
    } catch (error) {
      console.error('❌ Workflow execution failed:', error);
      execution.status = 'failed';
      this.notifyExecutionUpdate(execution);
    }
  }

  /**
   * Evaluate if a condition node passes
   */
  private evaluateCondition(node: Node): boolean {
    const nodeType = node.data.blockType;
    const config = node.data.config || {};

    console.log(`🔍 Evaluating condition: ${nodeType}`, config);

    if (!config.enabled) {
      console.log('⚠️ Condition is disabled, skipping');
      return true; // If disabled, always pass
    }

    if (nodeType === 'time_condition') {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

      // Check if current day is in allowed days
      const daysOfWeek = config.daysOfWeek || [1, 2, 3, 4, 5]; // Default to weekdays
      if (!daysOfWeek.includes(currentDay)) {
        console.log(`❌ Time condition failed: Current day (${currentDay}) not in allowed days`, daysOfWeek);
        return false;
      }

      // Check if current time is within range
      if (currentTime < config.startTime || currentTime > config.endTime) {
        console.log(`❌ Time condition failed: Current time ${currentTime} not between ${config.startTime} and ${config.endTime}`);
        return false;
      }

      console.log(`✅ Time condition passed: ${currentTime} on day ${currentDay}`);
      return true;
    }

    if (nodeType === 'location_condition') {
      // For named zones, we'll assume the location matches for now
      // In a real implementation, you would check against actual camera location data
      if (config.locationType === 'zone') {
        console.log(`✅ Location condition passed: Zone "${config.zoneName}" (simulated)`);
        return true; // Simulated - always pass for zones
      }

      // For GPS coordinates, you would check browser geolocation or camera metadata
      // This is a placeholder implementation
      console.log(`✅ Location condition passed: GPS coordinates (simulated)`);
      return true; // Simulated - always pass for GPS
    }

    console.log('⚠️ Unknown condition type, defaulting to pass');
    return true;
  }

  /**
   * Execute a single node (action block or condition)
   */
  private async executeNode(node: Node, event: DetectionEvent): Promise<void> {
    const nodeType = node.data.blockType;
    const config = node.data.config || {};

    console.log(`⚡ Executing ${nodeType} node:`, node.data.label);

    // Handle condition nodes
    if (node.data.nodeType === 'condition') {
      const conditionPassed = this.evaluateCondition(node);
      if (!conditionPassed) {
        throw new Error(`Condition failed: ${node.data.label}`);
      }
      console.log(`✅ Condition passed: ${node.data.label}`);
      return; // Conditions don't execute actions, just evaluate
    }

    switch (nodeType) {
      case 'gmail':
        await this.sendGmail(config, event);
        break;
      
      case 'sms':
        await this.sendSMS(config, event);
        break;
      
      case 'slack':
        await this.sendSlack(config, event);
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
   * Get nodes grouped by level using BFS for parallel execution
   */
  private getNodesByLevel(startNodeId: string, nodes: Node[], edges: Edge[]): Node[][] {
    console.log('🔗 Finding nodes by level starting from:', startNodeId);
    console.log('📊 Total nodes:', nodes.length, 'Total edges:', edges.length);
    
    const levels: Node[][] = [];
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; level: number }> = [{ nodeId: startNodeId, level: 0 }];

    while (queue.length > 0) {
      const { nodeId: currentId, level } = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      // Find edges from this node
      const outgoingEdges = edges.filter(e => e.source === currentId);
      console.log(`📍 Node ${currentId} (Level ${level}) has ${outgoingEdges.length} outgoing edges`);
      
      for (const edge of outgoingEdges) {
        const targetNode = nodes.find(n => n.id === edge.target);
        if (targetNode && !visited.has(edge.target)) {
          console.log(`  ➡️ Level ${level + 1}: ${targetNode.data.label} (${targetNode.data.blockType})`);
          
          if (targetNode.data.nodeType !== 'trigger') {
            // Ensure the level array exists
            if (!levels[level]) {
              levels[level] = [];
            }
            levels[level].push(targetNode);
            queue.push({ nodeId: edge.target, level: level + 1 });
          }
        }
      }
    }

    console.log('✅ Found', levels.flat().length, 'nodes across', levels.length, 'levels');
    levels.forEach((levelNodes, i) => {
      console.log(`  Level ${i + 1}:`, levelNodes.map(n => n.data.label).join(', '));
    });
    
    return levels;
  }

  /**
   * Get all nodes connected to a trigger node (legacy method, kept for compatibility)
   */
  /**
   * Action implementations
   */
  private async sendGmail(config: any, event: DetectionEvent): Promise<void> {
    console.log('📧 sendGmail called with config:', {
      authenticated: config.authenticated,
      to: config.to,
      nodeId: config.nodeId,
      hasSubject: !!config.subject,
      hasBody: !!config.body
    });
    
    if (!config.authenticated) {
      console.error('❌ Gmail not authenticated! Please authenticate first.');
      return;
    }
    
    if (!config.to) {
      console.error('❌ Gmail recipient not configured!');
      return;
    }

    const subject = this.replaceVariables(config.subject, event);
    const body = this.replaceVariables(config.body, event);
    
    console.log('📧 Sending email to:', config.to);
    console.log('📧 Subject:', subject);
    console.log('📧 Body:', body);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const payload = {
        nodeId: config.nodeId,
        to: config.to,
        subject,
        body
      };
      
      console.log('📧 Sending to backend:', `${backendUrl}/gmail/send`, payload);
      
      const response = await fetch(`${backendUrl}/gmail/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseData = await response.text();
      console.log('📧 Backend response:', response.status, responseData);

      if (response.ok) {
        console.log('✅✅✅ Email sent successfully! ✅✅✅');
      } else {
        console.error('❌ Failed to send email. Status:', response.status, 'Response:', responseData);
      }
    } catch (error) {
      console.error('❌ Email error:', error);
    }
  }

  private async sendSlack(config: any, event: DetectionEvent): Promise<void> {
    console.log('💬 sendSlack called with config:', config);
    console.log('💬 sendSlack called with event:', event);
    
    if (!config.configured || !config.channel) {
      console.log('⚠️ Slack not configured - configured:', config.configured, 'channel:', config.channel);
      return;
    }

    const messageTemplate = config.message?.trim() || DEFAULT_SLACK_TEMPLATE;
    const message = this.replaceVariables(messageTemplate, event);
    const channel = config.channel;
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

    console.log('💬 Sending Slack message to channel:', channel);
    console.log('💬 Message content:', message);

    try {
      const response = await fetch(`${backendUrl}/slack/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: config.nodeId,
          channel,
          message
        })
      });

      if (response.ok) {
        console.log('💬 Slack message sent successfully');
      } else {
        console.error('❌ Failed to send Slack message:', await response.text());
      }
    } catch (error) {
      console.error('❌ Slack error:', error);
    }
  }

  private async sendSMS(config: any, event: DetectionEvent): Promise<void> {
    console.log('📱 sendSMS called with config:', {
      to: config.to,
      hasBody: !!config.body
    });

    if (!config.to) {
      console.error('❌ SMS recipient not configured!');
      return;
    }

    if (!config.body) {
      console.error('❌ SMS body not configured!');
      return;
    }

    const body = this.replaceVariables(config.body, event);

    console.log('📱 Sending SMS to:', config.to);
    console.log('📱 Body:', body);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const payload = {
        to: config.to,
        body
      };

      console.log('📱 Sending to backend:', `${backendUrl}/sms/send`, payload);

      const response = await fetch(`${backendUrl}/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseData = await response.text();
      console.log('📱 Backend response:', response.status, responseData);

      if (response.ok) {
        console.log('✅✅✅ SMS sent successfully! ✅✅✅');
      } else {
        console.error('❌ Failed to send SMS. Status:', response.status, 'Response:', responseData);
      }
    } catch (error) {
      console.error('❌ SMS error:', error);
    }
  }

  private async makeVAPICall(config: any, event: DetectionEvent): Promise<void> {
    console.log('📞 makeVAPICall called with config:', config);
    console.log('📞 Config keys:', Object.keys(config || {}));
    console.log('📞 Has phoneNumber?', !!config?.phoneNumber);
    console.log('📞 Has message?', !!config?.message);
    console.log('📞 Has voiceId?', !!config?.voiceId);
    
    if (!config || !config.phoneNumber) {
      console.error('❌ ❌ ❌ VAPI BLOCK NOT CONFIGURED! ❌ ❌ ❌');
      console.error('❌ Please click the settings icon (⚙️) on the VAPI Call block');
      console.error('❌ Enter your phone number, message, and select a voice');
      console.error('❌ Then click Save');
      return;
    }
    
    const message = this.replaceVariables(config.message, event);
    const phoneNumber = config.phoneNumber;
    const voiceId = config.voiceId || 'rachel';
    
    console.log('📞 Initiating VAPI call to:', phoneNumber);
    console.log('📞 Message:', message);
    console.log('📞 Voice:', voiceId);
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/vapi/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          message,
          voiceId
        })
      });
      
      const responseData = await response.json();
      
      if (response.ok) {
        console.log('✅✅✅ VAPI call initiated successfully! ✅✅✅');
        console.log('Call ID:', responseData.callId);
      } else {
        console.error('❌ Failed to initiate VAPI call:', responseData.error);
      }
    } catch (error) {
      console.error('❌ VAPI call error:', error);
    }
  }

  private async callWebhook(config: any, _event: DetectionEvent): Promise<void> {
    console.log('🔗 Webhook would be called:', config);
    // TODO: Implement webhook POST
  }

  private async logToDatabase(_config: any, event: DetectionEvent): Promise<void> {
    console.log('💾 Database log:', event);
    // TODO: Implement database logging
  }

  private async saveScreenshot(config: any, _event: DetectionEvent): Promise<void> {
    console.log('📸 Screenshot would be saved:', config);
    // TODO: Implement screenshot capture
  }

  /**
   * Replace variables in templates
   */
  private replaceVariables(template: string, event: DetectionEvent): string {
    const formattedEventType = event.type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    return template
      .replace(/\{\{event_type\}\}/g, formattedEventType)
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

