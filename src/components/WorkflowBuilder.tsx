import { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  type Node,
  type Edge,
  Controls,
  Background,
  BackgroundVariant,
  addEdge,
  type Connection,
  MarkerType,
  Position,
  Handle,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import { useNodesState, useEdgesState } from '@reactflow/core';
import 'reactflow/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Plus, Trash2, Workflow as WorkflowIcon, Zap, GitBranch, Send, Mail, MessageCircle, Phone, Webhook, Database, Camera, Settings } from 'lucide-react';
import { cn } from '../lib/utils';

// Custom Node Component with side handles, settings, and delete button
function CustomNode({ data, id }: { data: any; id: string }) {
  const isExecuting = data.isExecuting || false;
  const isTriggered = data.isTriggered || false;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onDelete) {
      data.onDelete(id);
    }
  };

  const handleSettings = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('⚙️ Settings button clicked! Node ID:', id);
    if (data.onSettings) {
      console.log('✅ Calling onSettings handler with blockType:', data.blockType);
      data.onSettings(id, data.blockType, data.config);
    } else {
      console.log('❌ No onSettings handler found');
    }
  };

  return (
    <div className={cn(
      "relative group transition-all duration-300",
      isExecuting && "animate-pulse",
      isTriggered && "ring-2 ring-green-400 ring-offset-2 ring-offset-slate-950"
    )}>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#60a5fa',
          width: '8px',
          height: '8px',
          border: '2px solid #1e293b',
        }}
      />
      <div className="flex items-center gap-0.5 px-1 py-0.5">
        {data.icon && <data.icon className="w-2.5 h-2.5 flex-shrink-0" />}
        <div className="flex flex-col gap-0 flex-1">
          <span className="font-medium text-[8px] leading-tight">{data.label}</span>
          <Badge 
            variant={
              isExecuting ? 'default' : 
              data.nodeType === 'trigger' ? 'success' : 
              data.nodeType === 'condition' ? 'warning' : 
              'default'
            }
            className={cn(
              "text-[5px] px-0.5 py-0 w-fit leading-tight mt-0.5",
              isExecuting && "bg-green-500 animate-pulse"
            )}
          >
            {isExecuting ? '⚡ RUNNING' : data.badgeLabel}
          </Badge>
        </div>
        <div className="flex gap-0.5">
          {(data.nodeType === 'action' || (data.nodeType === 'trigger' && data.blockType === 'custom_event')) && (
            <button
              onClick={handleSettings}
              className="nodrag nopan bg-slate-700/60 hover:bg-slate-600 rounded p-0.5 transition-colors cursor-pointer"
              title="Configure"
            >
              <Settings className="w-1.5 h-1.5" />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="nodrag nopan bg-red-500/60 hover:bg-red-600 rounded p-0.5 transition-colors cursor-pointer"
            title="Delete"
          >
            <Trash2 className="w-1.5 h-1.5" />
          </button>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#60a5fa',
          width: '8px',
          height: '8px',
          border: '2px solid #1e293b',
        }}
      />
    </div>
  );
}

const nodeTypes = {
  custom: CustomNode,
};

// Block templates with proper icons
const TRIGGER_BLOCKS = [
  { id: 'person_detected', label: 'Person Detected', icon: Zap },
  { id: 'person_entered', label: 'Person Entered', icon: Zap },
  { id: 'person_exited', label: 'Person Exited', icon: Zap },
  { id: 'fight_detected', label: 'Fight Detected', icon: Zap },
  { id: 'robbery_detected', label: 'Robbery Detected', icon: Zap },
  { id: 'suspicious_activity', label: 'Suspicious Activity', icon: Zap },
  { id: 'motion_detected', label: 'Motion Detected', icon: Zap },
  { id: 'object_detected', label: 'Object Detected', icon: Zap },
  { id: 'custom_event', label: 'Custom Event', icon: Zap },
];

const CONDITION_BLOCKS = [
  { id: 'time_filter', label: 'Time Filter', icon: GitBranch },
  { id: 'counter', label: 'Counter', icon: GitBranch },
  { id: 'delay', label: 'Delay', icon: GitBranch },
  { id: 'zone_filter', label: 'Zone Filter', icon: GitBranch },
  { id: 'confidence_check', label: 'Confidence Check', icon: GitBranch },
];

const ACTION_BLOCKS = [
  { id: 'gmail', label: 'Send Gmail', icon: Mail, color: '#fca5a5' }, // Soft red
  { id: 'slack', label: 'Send Slack', icon: MessageCircle, color: '#c4b5fd' }, // Soft purple
  { id: 'sms', label: 'Send SMS', icon: MessageCircle, color: '#7dd3fc' }, // Soft blue
  { id: 'vapi_call', label: 'VAPI Call', icon: Phone, color: '#c084fc' }, // Soft violet
  { id: 'webhook', label: 'Webhook', icon: Webhook, color: '#fcd34d' }, // Soft yellow
  { id: 'database_log', label: 'Log to DB', icon: Database, color: '#86efac' }, // Soft green
  { id: 'save_screenshot', label: 'Screenshot', icon: Camera, color: '#93c5fd' }, // Soft blue
];

interface WorkflowBuilderProps {
  onWorkflowChange?: (nodes: Node[], edges: Edge[]) => void;
  executingNodes?: string[];
}

function WorkflowBuilderInner({ onWorkflowChange, executingNodes = [] }: WorkflowBuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showBlockPanel, setShowBlockPanel] = useState(false);
  const [showGmailConfig, setShowGmailConfig] = useState(false);
  const [gmailConfigNodeId, setGmailConfigNodeId] = useState<string>('');
  const [gmailConfig, setGmailConfig] = useState({
    to: '',
    subject: '',
    body: '',
    authenticated: false
  });
  const [showCustomTriggerConfig, setShowCustomTriggerConfig] = useState(false);
  const [customTriggerNodeId, setCustomTriggerNodeId] = useState<string>('');
  const [customTriggerCondition, setCustomTriggerCondition] = useState('');
  const { project } = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Notify parent of workflow changes
  useEffect(() => {
    if (onWorkflowChange) {
      onWorkflowChange(nodes, edges);
    }
  }, [nodes, edges, onWorkflowChange]);

  // Update node execution states
  useEffect(() => {
    setNodes(nds => nds.map(node => ({
      ...node,
      data: {
        ...node.data,
        isExecuting: executingNodes.includes(node.id)
      }
    })));
  }, [executingNodes, setNodes]);

  // Debug: Log when showGmailConfig changes
  useEffect(() => {
    console.log('📋 showGmailConfig state changed to:', showGmailConfig);
  }, [showGmailConfig]);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('📨 Received message:', event.data, 'from:', event.origin);
      
      // Accept messages from localhost on any port
      if (!event.origin.includes('localhost')) {
        console.log('❌ Rejected message from non-localhost origin');
        return;
      }
      
      if (event.data.type === 'GMAIL_AUTH_SUCCESS') {
        console.log('✅ Gmail auth successful!');
        setGmailConfig(prev => ({ ...prev, authenticated: true, nodeId: event.data.nodeId }));
      } else if (event.data.type === 'GMAIL_AUTH_ERROR') {
        console.error('❌ Gmail auth failed:', event.data.error);
        alert('Authentication failed: ' + event.data.error);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#3b82f6',
          width: 20,
          height: 20,
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  const deleteNodeById = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  const handleNodeSettings = useCallback((nodeId: string, blockType: string, config: any) => {
    console.log('🔧 Settings clicked for node:', nodeId, 'blockType:', blockType);
    
    if (blockType === 'gmail') {
      console.log('📧 Opening Gmail config');
      setGmailConfigNodeId(nodeId);
      setGmailConfig(config || { to: '', subject: '', body: '', authenticated: false });
      setShowGmailConfig(true);
    } else if (blockType === 'custom_event') {
      console.log('🎨 Opening Custom Trigger config');
      setCustomTriggerNodeId(nodeId);
      setCustomTriggerCondition(config?.condition || '');
      setShowCustomTriggerConfig(true);
    } else {
      console.log('⚠️ No configuration UI for blockType:', blockType);
    }
  }, []);

  const addBlock = (
    blockType: string, 
    blockLabel: string, 
    Icon: any, 
    nodeType: 'trigger' | 'condition' | 'action',
    customColor?: string
  ) => {
    const colors = {
      trigger: { 
        bg: 'linear-gradient(135deg, #6ee7b7 0%, #34d399 100%)', 
        border: '#6ee7b7',
        badge: 'TRIGGER'
      },
      condition: { 
        bg: 'linear-gradient(135deg, #fcd34d 0%, #fbbf24 100%)', 
        border: '#fcd34d',
        badge: 'CONDITION'
      },
      action: { 
        bg: customColor ? `linear-gradient(135deg, ${customColor}cc 0%, ${customColor}99 100%)` : 'linear-gradient(135deg, #93c5fd 0%, #60a5fa 100%)', 
        border: customColor ? `${customColor}cc` : '#93c5fd',
        badge: 'ACTION'
      }
    };

    // Get viewport center position
    const viewportCenter = project({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const randomOffset = { x: Math.random() * 100 - 50, y: Math.random() * 100 - 50 };
    
    const newNode: Node = {
      id: `${blockType}_${Date.now()}`,
      type: 'custom',
      position: { 
        x: viewportCenter.x + randomOffset.x, 
        y: viewportCenter.y + randomOffset.y 
      },
      data: { 
        label: blockLabel,
        icon: Icon,
        nodeType,
        blockType,
        badgeLabel: colors[nodeType].badge,
        onDelete: deleteNodeById,
        onSettings: handleNodeSettings,
        config: {}
      },
      style: {
        background: colors[nodeType].bg,
        border: `1px solid ${colors[nodeType].border}`,
        borderRadius: '4px',
        padding: '0',
        color: '#fff',
        width: '85px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
        fontSize: '8px',
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setShowBlockPanel(false);
  };

  const clearWorkflow = () => {
    setNodes([]);
    setEdges([]);
  };

  const handleGmailAuth = async () => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    
    try {
      // First, get the auth URL from the backend
      const res = await fetch(`${backendUrl}/auth/google?nodeId=${gmailConfigNodeId}`);
      const data = await res.json();
      
      // Then open the Google OAuth URL in a popup
      window.open(data.authUrl, '_blank', 'width=500,height=600');
      
      // Listen for auth success
      const checkAuth = setInterval(async () => {
        try {
          const res = await fetch(`${backendUrl}/gmail/status/${gmailConfigNodeId}`);
          const data = await res.json();
          if (data.authenticated) {
            setGmailConfig(prev => ({ ...prev, authenticated: true, nodeId: gmailConfigNodeId }));
            clearInterval(checkAuth);
          }
        } catch (err) {
          console.error('Auth check failed:', err);
        }
      }, 2000);

      // Stop checking after 2 minutes
      setTimeout(() => clearInterval(checkAuth), 120000);
    } catch (err) {
      console.error('Failed to get auth URL:', err);
    }
  };

  const saveGmailConfig = () => {
    // Save config with nodeId included
    const configWithNodeId = { ...gmailConfig, nodeId: gmailConfigNodeId };
    setNodes((nds) =>
      nds.map((node) =>
        node.id === gmailConfigNodeId
          ? { ...node, data: { ...node.data, config: configWithNodeId } }
          : node
      )
    );
    setShowGmailConfig(false);
  };

  const saveCustomTriggerConfig = () => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === customTriggerNodeId
          ? { ...node, data: { ...node.data, config: { condition: customTriggerCondition } } }
          : node
      )
    );
    setShowCustomTriggerConfig(false);
  };

  return (
    <>
      <Card className="border-primary/20 bg-slate-900/50 backdrop-blur relative">
        <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            <WorkflowIcon className="h-5 w-5 text-primary" />
            Workflow Builder
          </CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowBlockPanel(!showBlockPanel)}
              size="sm"
              variant="ghost"
              className="text-blue-400 hover:text-blue-300 hover:bg-slate-800/50"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Block
            </Button>
            <Button
              onClick={clearWorkflow}
              size="sm"
              variant="ghost"
              className="text-red-400 hover:text-red-300 hover:bg-slate-800/50"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Block Selection Panel */}
      {showBlockPanel && (
        <div className="absolute top-16 right-4 z-50 w-72 max-h-[400px] overflow-y-auto">
          <Card className="border-primary/40 bg-slate-800/95 backdrop-blur-xl shadow-2xl">
            <CardContent className="p-3 space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-green-400" />
                  <h3 className="font-semibold text-green-400 text-sm">Trigger Blocks</h3>
                </div>
                <div className="space-y-1.5">
                  {TRIGGER_BLOCKS.map((block) => (
                    <Button
                      key={block.id}
                      onClick={() => addBlock(block.id, block.label, block.icon, 'trigger')}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start hover:bg-green-500/20 hover:border-green-500/40 h-8 text-xs"
                    >
                      <block.icon className="w-3.5 h-3.5 mr-2" />
                      {block.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Send className="h-4 w-4 text-blue-400" />
                  <h3 className="font-semibold text-blue-400 text-sm">Action Blocks</h3>
                </div>
                <div className="space-y-1.5">
                  {ACTION_BLOCKS.map((block) => (
                    <Button
                      key={block.id}
                      onClick={() => addBlock(block.id, block.label, block.icon, 'action', block.color)}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start hover:bg-blue-500/20 hover:border-blue-500/40 h-8 text-xs"
                    >
                      <block.icon className="w-3.5 h-3.5 mr-2" style={{ color: block.color }} />
                      {block.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <CardContent className="p-3">
        <div className="h-[calc(50vh-160px)] rounded-lg border-2 border-primary/20 bg-slate-950/50 overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={() => {}}
            nodeTypes={nodeTypes}
            fitView
            panOnScroll
            panOnScrollSpeed={0.3}
            zoomOnScroll={false}
            panOnDrag={true}
            minZoom={0.5}
            maxZoom={2}
            autoPanOnNodeDrag
            className="bg-slate-950/50"
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#3b82f6', strokeWidth: 2.5 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#3b82f6',
              },
            }}
          >
            <Background 
              variant={BackgroundVariant.Dots} 
              gap={20} 
              size={1} 
              color="hsl(217, 91%, 20%)" 
            />
            <Controls className="bg-slate-800 border-primary/20" />
          </ReactFlow>
        </div>
      </CardContent>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none mt-16">
          <div className="text-center text-muted-foreground">
            <WorkflowIcon className="h-10 w-10 mx-auto mb-2 text-primary/20" />
            <p className="text-sm">Click "Add Block" to start</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Connect blocks by dragging from right to left handles</p>
          </div>
        </div>
      )}
      </Card>

      {/* Gmail Configuration Modal */}
      {showGmailConfig && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
          onClick={() => setShowGmailConfig(false)}
        >
          <Card 
            className="w-[450px] max-h-[80vh] overflow-y-auto border-blue-500/30 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b border-blue-500/20 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4 text-blue-400" />
                  Configure Gmail
                </CardTitle>
                <button
                  onClick={() => setShowGmailConfig(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4 pb-4">
              {/* OAuth Section */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Authentication</label>
                {gmailConfig.authenticated ? (
                  <div className="w-full px-3 py-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm text-center">
                    ✓ Connected to Gmail
                  </div>
                ) : (
                  <Button onClick={handleGmailAuth} className="w-full" size="sm">
                    <Mail className="h-3.5 w-3.5 mr-2" />
                    Sign in with Google
                  </Button>
                )}
              </div>

              {/* Email Configuration */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Recipient Email</label>
                <input
                  type="email"
                  value={gmailConfig.to}
                  onChange={(e) => setGmailConfig({ ...gmailConfig, to: e.target.value })}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Subject</label>
                <input
                  type="text"
                  value={gmailConfig.subject}
                  onChange={(e) => setGmailConfig({ ...gmailConfig, subject: e.target.value })}
                  placeholder="Alert: {{event_type}}"
                  className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Message Body</label>
                <textarea
                  value={gmailConfig.body}
                  onChange={(e) => setGmailConfig({ ...gmailConfig, body: e.target.value })}
                  placeholder="Event detected: {{event_description}}"
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={saveGmailConfig} 
                  className="flex-1" 
                  size="sm"
                  disabled={!gmailConfig.authenticated || !gmailConfig.to}
                >
                  Save
                </Button>
                <Button 
                  onClick={() => setShowGmailConfig(false)} 
                  variant="ghost" 
                  className="flex-1"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Custom Trigger Configuration Modal */}
      {showCustomTriggerConfig && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
          onClick={() => setShowCustomTriggerConfig(false)}
        >
          <Card 
            className="w-[500px] max-h-[80vh] overflow-y-auto border-green-500/30 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b border-green-500/20 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-4 w-4 text-green-400" />
                  Configure Custom Trigger
                </CardTitle>
                <button
                  onClick={() => setShowCustomTriggerConfig(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 pb-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">Trigger Condition</label>
                <p className="text-xs text-slate-400">
                  Describe what you want to detect. The AI will match this condition against the video analysis.
                </p>
                <textarea
                  value={customTriggerCondition}
                  onChange={(e) => setCustomTriggerCondition(e.target.value)}
                  placeholder="Example: someone stealing something, person running away, car parked illegally, etc."
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 resize-none"
                />
              </div>

              <div className="bg-slate-950/50 border border-slate-700 rounded p-3 space-y-2">
                <div className="text-xs font-medium text-slate-300">Examples:</div>
                <div className="space-y-1 text-xs text-slate-400">
                  <div>• "Someone stealing merchandise"</div>
                  <div>• "Person running away quickly"</div>
                  <div>• "Multiple people fighting"</div>
                  <div>• "Someone leaving a bag unattended"</div>
                  <div>• "Person wearing a mask inside"</div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={saveCustomTriggerConfig} 
                  className="flex-1" 
                  size="sm"
                  disabled={!customTriggerCondition.trim()}
                >
                  Save
                </Button>
                <Button 
                  onClick={() => setShowCustomTriggerConfig(false)} 
                  variant="ghost" 
                  className="flex-1"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export default function WorkflowBuilder(props: WorkflowBuilderProps) {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner {...props} />
    </ReactFlowProvider>
  );
}
