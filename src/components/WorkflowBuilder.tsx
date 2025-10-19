import { useState, useCallback, useEffect, useRef } from 'react';
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
  ReactFlowProvider,
  ConnectionMode,
} from 'reactflow';
import { useNodesState, useEdgesState } from '@reactflow/core';
import 'reactflow/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Plus, Trash2, Workflow as WorkflowIcon, Zap, Send, Mail, MessageCircle, Phone, Webhook, Database, Camera, Settings, Clock, MapPin, Filter } from 'lucide-react';
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
    console.log('⚙️ Node data:', { 
      blockType: data.blockType, 
      nodeType: data.nodeType, 
      label: data.label,
      hasConfig: !!data.config,
      hasOnSettings: !!data.onSettings
    });
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
          {(data.nodeType === 'action' || data.nodeType === 'condition' || (data.nodeType === 'trigger' && data.blockType === 'custom_event')) && (
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
  { id: 'time_condition', label: 'Time Condition', icon: Clock, color: '#fcd34d' }, // Yellow
  { id: 'location_condition', label: 'Location Condition', icon: MapPin, color: '#fbbf24' }, // Amber
];

const ACTION_BLOCKS = [
  { id: 'gmail', label: 'Send Gmail', icon: Mail, color: '#fca5a5' }, // Soft red
  { id: 'slack', label: 'Send Slack', icon: MessageCircle, color: '#c4b5fd' }, // Soft purple
  { id: 'sms', label: 'Send SMS', icon: MessageCircle, color: '#7dd3fc' }, // Soft blue
  { id: 'vapi_call', label: 'Call', icon: Phone, color: '#c084fc' }, // Soft violet
  { id: 'webhook', label: 'Webhook', icon: Webhook, color: '#fcd34d' }, // Soft yellow
  { id: 'database_log', label: 'Log to DB', icon: Database, color: '#86efac' }, // Soft green
  { id: 'save_screenshot', label: 'Screenshot', icon: Camera, color: '#93c5fd' }, // Soft blue
];

interface WorkflowBuilderProps {
  onWorkflowChange?: (nodes: Node[], edges: Edge[]) => void;
  executingNodes?: string[];
  initialNodes?: Node[];
  initialEdges?: Edge[];
}

function WorkflowBuilderInner({ 
  onWorkflowChange, 
  executingNodes = [],
  initialNodes = [],
  initialEdges = []
}: WorkflowBuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [showBlockPanel, setShowBlockPanel] = useState(false);
  const [showGmailConfig, setShowGmailConfig] = useState(false);
  const [gmailConfigNodeId, setGmailConfigNodeId] = useState<string>('');
  const [gmailConfig, setGmailConfig] = useState({
    to: '',
    subject: '',
    body: '',
    authenticated: false
  });
  const [showSlackConfig, setShowSlackConfig] = useState(false);
  const [slackConfigNodeId, setSlackConfigNodeId] = useState<string>('');
  const [slackConfig, setSlackConfig] = useState({
    channel: '',
    message: '',
    configured: false
  });
  const [showCustomEventConfig, setShowCustomEventConfig] = useState(false);
  const [customEventConfigNodeId, setCustomEventConfigNodeId] = useState<string>('');
  const [customEventConfig, setCustomEventConfig] = useState({
    condition: '',
    fuzzyThreshold: 70
  });
  const [showSmsConfig, setShowSmsConfig] = useState(false);
  const [smsConfigNodeId, setSmsConfigNodeId] = useState<string>('');
  const [smsConfig, setSmsConfig] = useState({
    to: '',
    body: ''
  });
  const [showVapiConfig, setShowVapiConfig] = useState(false);
  const [vapiConfigNodeId, setVapiConfigNodeId] = useState<string>('');
  const [vapiConfig, setVapiConfig] = useState({
    phoneNumber: '',
    message: '',
    voiceId: 'rachel'
  });
  const [availableVoices, setAvailableVoices] = useState<any[]>([]);
  const [showTimeConditionConfig, setShowTimeConditionConfig] = useState(false);
  const [timeConditionConfigNodeId, setTimeConditionConfigNodeId] = useState<string>('');
  const [timeConditionConfig, setTimeConditionConfig] = useState({
    startTime: '09:00',
    endTime: '17:00',
    daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday by default
    enabled: true
  });
  const [showLocationConditionConfig, setShowLocationConditionConfig] = useState(false);
  const [locationConditionConfigNodeId, setLocationConditionConfigNodeId] = useState<string>('');
  const [locationConditionConfig, setLocationConditionConfig] = useState({
    locationType: 'zone', // 'zone' or 'gps'
    zoneName: 'Front Door',
    latitude: 0,
    longitude: 0,
    radius: 100, // meters
    enabled: true
  });

  // Refs for tracking previous props and sync state
  const prevInitialNodesRef = useRef<Node[]>([]);
  const prevInitialEdgesRef = useRef<Edge[]>([]);
  const isSyncingRef = useRef(false);

  // Note: This useEffect is moved after restoreNodeData definition
  // It will be added after restoreNodeData is defined

  // Notify parent of workflow changes (but not during sync to prevent loops)
  useEffect(() => {
    if (onWorkflowChange && !isSyncingRef.current) {
      console.log('📤 Notifying parent of workflow change:', nodes.length, 'nodes,', edges.length, 'edges');
      onWorkflowChange(nodes, edges);
    } else if (isSyncingRef.current) {
      console.log('🚫 Skipping parent notification during sync');
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

  // Debug: Log when showCustomEventConfig changes
  useEffect(() => {
    console.log('🎯 showCustomEventConfig state changed to:', showCustomEventConfig);
    console.log('🎯 customEventConfig:', customEventConfig);
  }, [showCustomEventConfig, customEventConfig]);

  // Debug: Log when showVapiConfig changes
  useEffect(() => {
    console.log('📞 showVapiConfig state changed to:', showVapiConfig);
    console.log('📞 vapiConfig:', vapiConfig);
    console.log('📞 availableVoices:', availableVoices?.length || 0, 'voices');
  }, [showVapiConfig, vapiConfig, availableVoices]);

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

  // Track which edge is being dragged and if it was reconnected
  const edgeUpdateSuccessful = useRef<boolean>(false);

  const onEdgeUpdate = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      console.log('✅ Edge reconnected successfully');
      edgeUpdateSuccessful.current = true;
      
      // Only update if we have valid source and target
      if (!newConnection.source || !newConnection.target) {
        console.log('❌ Invalid connection, will delete edge');
        return;
      }
      
      setEdges((eds) => {
        const edgeIndex = eds.findIndex((e) => e.id === oldEdge.id);
        if (edgeIndex !== -1) {
          const updatedEdges = [...eds];
          updatedEdges[edgeIndex] = {
            ...oldEdge,
            source: newConnection.source as string,
            target: newConnection.target as string,
            ...(newConnection.sourceHandle && { sourceHandle: newConnection.sourceHandle }),
            ...(newConnection.targetHandle && { targetHandle: newConnection.targetHandle }),
          };
          return updatedEdges;
        }
        return eds;
      });
    },
    [setEdges]
  );

  const onEdgeUpdateStart = useCallback((_: any, edge: Edge) => {
    console.log('🎯 Edge drag started:', edge.id);
    edgeUpdateSuccessful.current = false;
  }, []);

  const onEdgeUpdateEnd = useCallback(
    (_: any, edge: Edge) => {
      console.log('🎯 Edge drag ended. Was reconnected?', edgeUpdateSuccessful.current);
      
      // If edge wasn't successfully reconnected, delete it
      if (!edgeUpdateSuccessful.current) {
        console.log('❌ Edge dropped without reconnecting - deleting:', edge.id);
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }
      
      // Reset for next drag
      edgeUpdateSuccessful.current = false;
    },
    [setEdges]
  );

  const deleteNodeById = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  const handleNodeSettings = useCallback((nodeId: string, blockType: string, config: any) => {
    console.log('🔧 Settings clicked for node:', nodeId, 'blockType:', blockType);
    console.log('🔍 Config received:', config);
    
    if (blockType === 'gmail') {
      console.log('📧 Opening Gmail config');
      setGmailConfigNodeId(nodeId);
      setGmailConfig(config || { to: '', subject: '', body: '', authenticated: false });
      console.log('🚀 Setting showGmailConfig to TRUE');
      setShowGmailConfig(true);
      console.log('✨ showGmailConfig should now be true');
    } else if (blockType === 'sms') {
      console.log('📱 Opening SMS config');
      setSmsConfigNodeId(nodeId);
      setSmsConfig(config || { to: '', body: '' });
      setShowSmsConfig(true);
    } else if (blockType === 'vapi_call') {
      console.log('📞 Opening VAPI Call config');
      console.log('📞 Setting vapiConfigNodeId to:', nodeId);
      setVapiConfigNodeId(nodeId);
      const vapiConfigToSet = config || { phoneNumber: '', message: '', voiceId: 'rachel' };
      console.log('📞 Setting vapiConfig to:', vapiConfigToSet);
      setVapiConfig(vapiConfigToSet);
      console.log('📞 Setting showVapiConfig to TRUE');
      setShowVapiConfig(true);
      console.log('📞 VAPI modal should now appear!');
      // Fetch available voices
      console.log('📞 Fetching available voices...');
      fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/vapi/voices`)
        .then(res => res.json())
        .then(data => {
          console.log('📞 Voices fetched successfully:', data.voices?.length || 0, 'voices');
          setAvailableVoices(data.voices || []);
        })
        .catch(err => console.error('❌ Failed to fetch voices:', err));
    } else if (blockType === 'slack') {
      console.log('💬 Opening Slack config');
      setSlackConfigNodeId(nodeId);
      setSlackConfig(config || { channel: '', message: '', configured: false });
      setShowSlackConfig(true);
    } else if (blockType === 'custom_event') {
      console.log('🎯 Opening Custom Event config');
      setCustomEventConfigNodeId(nodeId);
      setCustomEventConfig(config || { condition: '', fuzzyThreshold: 70 });
      setShowCustomEventConfig(true);
    } else if (blockType === 'time_condition') {
      console.log('⏰ Opening Time Condition config');
      setTimeConditionConfigNodeId(nodeId);
      setTimeConditionConfig(config || { startTime: '09:00', endTime: '17:00', daysOfWeek: [1, 2, 3, 4, 5], enabled: true });
      setShowTimeConditionConfig(true);
    } else if (blockType === 'location_condition') {
      console.log('📍 Opening Location Condition config');
      setLocationConditionConfigNodeId(nodeId);
      setLocationConditionConfig(config || { locationType: 'zone', zoneName: 'Front Door', latitude: 0, longitude: 0, radius: 100, enabled: true });
      setShowLocationConditionConfig(true);
    } else {
      console.log('⚠️ Unknown block type:', blockType);
    }
  }, []);

  // Helper function to restore node data with icons and handlers
  const restoreNodeData = useCallback((node: Node) => {
    // Find the icon based on blockType
    let Icon = null;
    
    // Check trigger blocks
    const triggerBlock = TRIGGER_BLOCKS.find(b => b.id === node.data?.blockType);
    if (triggerBlock) {
      Icon = triggerBlock.icon;
    }
    
    // Check condition blocks
    if (!Icon) {
      const conditionBlock = CONDITION_BLOCKS.find(b => b.id === node.data?.blockType);
      if (conditionBlock) {
        Icon = conditionBlock.icon;
      }
    }
    
    // Check action blocks
    if (!Icon) {
      const actionBlock = ACTION_BLOCKS.find(b => b.id === node.data?.blockType);
      if (actionBlock) {
        Icon = actionBlock.icon;
      }
    }

    return {
      ...node,
      data: {
        ...node.data,
        icon: Icon,
        onDelete: deleteNodeById,
        onSettings: handleNodeSettings,
      },
    };
  }, [deleteNodeById, handleNodeSettings]);

  // Sync internal state with initialNodes/initialEdges when they change (but prevent infinite loop)
  useEffect(() => {
    console.log('🔍 Sync check - initialNodes:', initialNodes.length, 'initialEdges:', initialEdges.length);
    console.log('🔍 Current state - nodes:', nodes.length, 'edges:', edges.length);
    console.log('🔍 Previous - nodes:', prevInitialNodesRef.current.length, 'edges:', prevInitialEdgesRef.current.length);

    const nodesChanged = JSON.stringify(initialNodes) !== JSON.stringify(prevInitialNodesRef.current);
    const edgesChanged = JSON.stringify(initialEdges) !== JSON.stringify(prevInitialEdgesRef.current);

    console.log('🔍 Changed? Nodes:', nodesChanged, 'Edges:', edgesChanged);

    // IMPORTANT: Don't sync if initialNodes is empty but we already have nodes
    // This prevents React Strict Mode double-render from wiping the workflow
    if (initialNodes.length === 0 && nodes.length > 0) {
      console.log('🚫 Rejecting empty initialNodes sync - would wipe existing workflow!');
      return;
    }

    if (nodesChanged || edgesChanged) {
      console.log('📥 SYNCING with new initial workflow - Nodes:', initialNodes.length, '| Edges:', initialEdges.length);

      // Set sync flag to prevent triggering onWorkflowChange during sync
      isSyncingRef.current = true;

      // Restore nodes with icons and handlers
      const restoredNodes = initialNodes.map(node => restoreNodeData(node));
      console.log('✅ Restored', restoredNodes.length, 'nodes with icons/handlers');

      setNodes(restoredNodes);
      setEdges(initialEdges);

      // Update refs
      prevInitialNodesRef.current = initialNodes;
      prevInitialEdgesRef.current = initialEdges;

      // Reset flag after ALL React updates complete (use longer timeout)
      setTimeout(() => {
        console.log('🏁 Sync complete, re-enabling parent notifications');
        isSyncingRef.current = false;
      }, 100);
    } else {
      console.log('⏭️ No sync needed - workflow unchanged');
    }
  }, [initialNodes, initialEdges, nodes.length, setNodes, setEdges, restoreNodeData]);

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

    // Find an empty spot in the visible viewport
    const findEmptyPosition = () => {
      const NODE_WIDTH = 85;
      const NODE_HEIGHT = 50;
      const PADDING = 20;
      const GRID_SIZE = 120; // Space between potential positions

      // Try positions in a grid pattern, starting from top-left of viewport
      const startX = 50;
      const startY = 50;
      const maxColumns = 6;
      const maxRows = 4;

      for (let row = 0; row < maxRows; row++) {
        for (let col = 0; col < maxColumns; col++) {
          const testX = startX + (col * GRID_SIZE);
          const testY = startY + (row * GRID_SIZE);

          // Check if this position overlaps with any existing node
          const overlaps = nodes.some(node => {
            const dx = Math.abs(node.position.x - testX);
            const dy = Math.abs(node.position.y - testY);
            return dx < (NODE_WIDTH + PADDING) && dy < (NODE_HEIGHT + PADDING);
          });

          if (!overlaps) {
            return { x: testX, y: testY };
          }
        }
      }

      // If no empty spot found, place it offset from the last node or use default
      if (nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1];
        return { x: lastNode.position.x + 150, y: lastNode.position.y + 50 };
      }

      // Default position if no nodes exist
      return { x: 100, y: 100 };
    };

    const position = findEmptyPosition();
    
    const newNode: Node = {
      id: `${blockType}_${Date.now()}`,
      type: 'custom',
      position,
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

  const handleGmailAuth = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log('📧 handleGmailAuth called with nodeId:', gmailConfigNodeId);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    
    try {
      console.log('🌐 Fetching auth URL from:', `${backendUrl}/auth/google?nodeId=${gmailConfigNodeId}`);
      
      // First, get the auth URL from the backend
      const res = await fetch(`${backendUrl}/auth/google?nodeId=${gmailConfigNodeId}`);
      const data = await res.json();
      
      console.log('🔗 Got auth URL response:', data);
      
      if (data.authUrl) {
        // Open in a popup window instead of the current window
        const authWindow = window.open(data.authUrl, 'gmail-auth', 'width=500,height=600,menubar=no,toolbar=no,location=no,status=no');
        console.log('🪟 Opened auth popup window');
    
    // Listen for auth success
    const checkAuth = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/gmail/status/${gmailConfigNodeId}`);
        const data = await res.json();
        if (data.authenticated) {
              console.log('✅ Gmail authenticated successfully!');
              setGmailConfig(prev => ({ ...prev, authenticated: true, nodeId: gmailConfigNodeId }));
          clearInterval(checkAuth);
              if (authWindow && !authWindow.closed) {
                authWindow.close();
              }
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      }
    }, 2000);

    // Stop checking after 2 minutes
    setTimeout(() => clearInterval(checkAuth), 120000);
      } else {
        console.error('❌ No authUrl in response:', data);
      }
    } catch (err) {
      console.error('❌ Failed to get auth URL:', err);
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

  const saveCustomEventConfig = () => {
    if (!customEventConfig.condition?.trim()) {
      alert('Please enter a trigger condition');
      return;
    }
    
    setNodes((nds) =>
      nds.map((node) =>
        node.id === customEventConfigNodeId
          ? { ...node, data: { ...node.data, config: customEventConfig } }
          : node
      )
    );
    setShowCustomEventConfig(false);
  };

  const saveSmsConfig = () => {
    if (!smsConfig.to?.trim()) {
      alert('Please enter a phone number');
      return;
    }

    if (!smsConfig.body?.trim()) {
      alert('Please enter a message body');
      return;
    }

    setNodes((nds) =>
      nds.map((node) =>
        node.id === smsConfigNodeId
          ? { ...node, data: { ...node.data, config: smsConfig } }
          : node
      )
    );
    setShowSmsConfig(false);
  };

  const saveTimeConditionConfig = () => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === timeConditionConfigNodeId
          ? { ...node, data: { ...node.data, config: timeConditionConfig } }
          : node
      )
    );
    setShowTimeConditionConfig(false);
  };

  const saveLocationConditionConfig = () => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === locationConditionConfigNodeId
          ? { ...node, data: { ...node.data, config: locationConditionConfig } }
          : node
      )
    );
    setShowLocationConditionConfig(false);
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
                  <Filter className="h-4 w-4 text-yellow-400" />
                  <h3 className="font-semibold text-yellow-400 text-sm">Condition Blocks</h3>
                </div>
                <div className="space-y-1.5">
                  {CONDITION_BLOCKS.map((block) => (
                    <Button
                      key={block.id}
                      onClick={() => addBlock(block.id, block.label, block.icon, 'condition', block.color)}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start hover:bg-yellow-500/20 hover:border-yellow-500/40 h-8 text-xs"
                    >
                      <block.icon className="w-3.5 h-3.5 mr-2" style={{ color: block.color }} />
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
            onEdgeUpdate={onEdgeUpdate}
            onEdgeUpdateStart={onEdgeUpdateStart}
            onEdgeUpdateEnd={onEdgeUpdateEnd}
            onNodeClick={() => {}}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            edgesFocusable={true}
            edgesUpdatable={true}
            deleteKeyCode="Backspace"
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

    {/* Custom Event Configuration Modal */}
    {showCustomEventConfig && (
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
        onClick={() => setShowCustomEventConfig(false)}
      >
        <Card 
          className="w-[450px] max-h-[80vh] overflow-y-auto border-green-500/30 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <CardHeader className="border-b border-green-500/20 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-green-400" />
                Configure Custom Event
              </CardTitle>
              <button
                onClick={() => setShowCustomEventConfig(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 pb-4">
            {/* Event Label */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Event to Detect</label>
              <input
                type="text"
                value={customEventConfig.condition}
                onChange={(e) => setCustomEventConfig({ ...customEventConfig, condition: e.target.value })}
                placeholder="e.g., person sitting on floor"
                className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
              />
              <p className="text-xs text-slate-400">Describe what you want to detect in natural language</p>
            </div>

            {/* Fuzzy Threshold Slider */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Fuzzy Matching Threshold: {customEventConfig.fuzzyThreshold}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={customEventConfig.fuzzyThreshold}
                onChange={(e) => setCustomEventConfig({ ...customEventConfig, fuzzyThreshold: parseInt(e.target.value) })}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>More Lenient (0%)</span>
                <span>Stricter (100%)</span>
              </div>
              <p className="text-xs text-slate-400">
                Lower = matches similar activities (e.g., "sitting" matches "sitting on floor" at 70%)
              </p>
            </div>

            {/* Example */}
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-xs font-medium text-green-400 mb-1">AI-Powered Matching Examples:</p>
              <p className="text-xs text-slate-300">
                • "someone stealing" → triggers on "robbery detected"<br/>
                • "person sitting on floor" → triggers on "person sitting"<br/>
                • "fight happening" → triggers on "violence detected"<br/>
                The AI understands semantic similarity at the threshold level you set.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                onClick={saveCustomEventConfig} 
                className="flex-1" 
                size="sm"
                disabled={!customEventConfig.condition?.trim()}
              >
                Save
              </Button>
              <Button 
                onClick={() => setShowCustomEventConfig(false)} 
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

    {/* SMS Configuration Modal */}
    {showSmsConfig && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
        onClick={() => setShowSmsConfig(false)}
        >
          <Card 
          className="w-[450px] max-h-[80vh] overflow-y-auto border-purple-500/30 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
          <CardHeader className="border-b border-purple-500/20 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-4 w-4 text-purple-400" />
                Configure SMS
                </CardTitle>
                <button
                onClick={() => setShowSmsConfig(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </CardHeader>
          <CardContent className="space-y-3 pt-4 pb-4">
            {/* Phone Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Phone Number</label>
              <input
                type="tel"
                value={smsConfig.to}
                onChange={(e) => setSmsConfig({ ...smsConfig, to: e.target.value })}
                placeholder="+1234567890"
                className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
              />
              <p className="text-xs text-slate-400">Include country code (e.g., +1 for US)</p>
            </div>

            {/* Message Body */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Message</label>
                <textarea
                value={smsConfig.body}
                onChange={(e) => setSmsConfig({ ...smsConfig, body: e.target.value })}
                placeholder="Alert: {{event_type}} detected at {{timestamp}}"
                  rows={4}
                className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 resize-none"
                />
                <p className="text-xs text-slate-400">
                Variables: <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">{'{{event_type}}'}</code> <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">{'{{event_description}}'}</code>
              </p>
              </div>

            <div className="flex gap-2 pt-2">
              <Button 
                onClick={saveSmsConfig} 
                className="flex-1" 
                size="sm"
                disabled={!smsConfig.to || !smsConfig.body}
              >
                Save
              </Button>
              <Button 
                onClick={() => setShowSmsConfig(false)} 
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

    {/* VAPI Call Configuration Modal */}
    {showVapiConfig && (
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
        onClick={() => setShowVapiConfig(false)}
      >
        <Card 
          className="w-[450px] max-h-[80vh] overflow-y-auto border-purple-500/30 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <CardHeader className="border-b border-purple-500/20 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="h-4 w-4 text-purple-400" />
                Configure Voice Call
              </CardTitle>
              <button
                onClick={() => setShowVapiConfig(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 pb-4">
            {/* Phone Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Phone Number to Call</label>
              <input
                type="tel"
                value={vapiConfig.phoneNumber}
                onChange={(e) => {
                  let value = e.target.value.replace(/[^\d+]/g, ''); // Only digits and +
                  // Auto-add +1 if user starts typing without +
                  if (value && !value.startsWith('+')) {
                    value = '+1' + value;
                  }
                  setVapiConfig({ ...vapiConfig, phoneNumber: value });
                }}
                placeholder="+19255772134"
                className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
              />
              <p className="text-xs text-slate-400">
                {vapiConfig.phoneNumber && !vapiConfig.phoneNumber.startsWith('+') ? 
                  <span className="text-red-400">⚠️ Must include country code (e.g., +1 for US)</span> :
                  <span>Format: +19255772134</span>
                }
              </p>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Message to Speak</label>
                <textarea
                value={vapiConfig.message}
                onChange={(e) => setVapiConfig({ ...vapiConfig, message: e.target.value })}
                placeholder="Alert: {{event_type}} detected at {{timestamp}}. Please check your surveillance system."
                rows={3}
                className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 resize-none"
              />
              <p className="text-xs text-slate-400">
                Variables: <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">{'{{event_type}}'}</code> <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">{'{{event_description}}'}</code>
              </p>
              </div>

            {/* Voice Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Voice</label>
              <select
                value={vapiConfig.voiceId}
                onChange={(e) => setVapiConfig({ ...vapiConfig, voiceId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
              >
                {availableVoices && availableVoices.length > 0 ? (
                  availableVoices.map((voice) => (
                    <option key={voice.id} value={voice.id} className="bg-slate-900">
                      {voice.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="rachel" className="bg-slate-900">Rachel (Female) - Loading...</option>
                    <option value="domi" className="bg-slate-900">Domi (Female)</option>
                    <option value="bella" className="bg-slate-900">Bella (Female)</option>
                    <option value="antoni" className="bg-slate-900">Antoni (Male)</option>
                    <option value="josh" className="bg-slate-900">Josh (Male)</option>
                  </>
                )}
              </select>
              <p className="text-xs text-slate-400">Select the voice for the call</p>
                </div>

            <div className="flex gap-2 pt-2">
              <Button 
                onClick={() => {
                  setNodes((nds) =>
                    nds.map((node) =>
                      node.id === vapiConfigNodeId
                        ? { ...node, data: { ...node.data, config: vapiConfig } }
                        : node
                    )
                  );
                  setShowVapiConfig(false);
                }} 
                className="flex-1" 
                size="sm"
                disabled={!vapiConfig.phoneNumber || !vapiConfig.message}
              >
                Save
              </Button>
              <Button 
                onClick={() => setShowVapiConfig(false)} 
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

    {/* Time Condition Configuration Modal */}
    {showTimeConditionConfig && (
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
        onClick={() => setShowTimeConditionConfig(false)}
      >
        <Card
          className="w-[450px] max-h-[80vh] overflow-y-auto border-yellow-500/30 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <CardHeader className="border-b border-yellow-500/20 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-yellow-400" />
                Configure Time Condition
              </CardTitle>
              <button
                onClick={() => setShowTimeConditionConfig(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 pb-4">
            {/* Time Range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Start Time</label>
                <input
                  type="time"
                  value={timeConditionConfig.startTime}
                  onChange={(e) => setTimeConditionConfig({ ...timeConditionConfig, startTime: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">End Time</label>
                <input
                  type="time"
                  value={timeConditionConfig.endTime}
                  onChange={(e) => setTimeConditionConfig({ ...timeConditionConfig, endTime: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
                />
              </div>
            </div>

            {/* Days of Week */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Active Days</label>
              <div className="grid grid-cols-7 gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                  <button
                    key={day}
                    onClick={() => {
                      const days = timeConditionConfig.daysOfWeek || [];
                      const newDays = days.includes(index)
                        ? days.filter(d => d !== index)
                        : [...days, index].sort();
                      setTimeConditionConfig({ ...timeConditionConfig, daysOfWeek: newDays });
                    }}
                    className={cn(
                      "px-2 py-1.5 text-xs font-medium rounded transition-colors",
                      (timeConditionConfig.daysOfWeek || []).includes(index)
                        ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                        : "bg-slate-800/50 text-slate-400 border border-slate-700 hover:border-slate-600"
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">Select which days this condition is active</p>
            </div>

            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-300">Enable Condition</p>
                <p className="text-xs text-slate-400">Workflow will only continue if time matches</p>
              </div>
              <button
                onClick={() => setTimeConditionConfig({ ...timeConditionConfig, enabled: !timeConditionConfig.enabled })}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors",
                  timeConditionConfig.enabled ? "bg-yellow-500" : "bg-slate-600"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                  timeConditionConfig.enabled ? "translate-x-7" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Example */}
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-xs font-medium text-yellow-400 mb-1">Example:</p>
              <p className="text-xs text-slate-300">
                Workflow will only execute between {timeConditionConfig.startTime} and {timeConditionConfig.endTime} on selected days
              </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                onClick={saveTimeConditionConfig}
                  className="flex-1" 
                  size="sm"
                >
                  Save
                </Button>
                <Button 
                onClick={() => setShowTimeConditionConfig(false)}
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

    {/* Location Condition Configuration Modal */}
    {showLocationConditionConfig && (
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
        onClick={() => setShowLocationConditionConfig(false)}
      >
        <Card
          className="w-[450px] max-h-[80vh] overflow-y-auto border-yellow-500/30 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <CardHeader className="border-b border-yellow-500/20 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-yellow-400" />
                Configure Location Condition
              </CardTitle>
              <button
                onClick={() => setShowLocationConditionConfig(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 pb-4">
            {/* Location Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Location Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setLocationConditionConfig({ ...locationConditionConfig, locationType: 'zone' })}
                  className={cn(
                    "px-3 py-2 text-sm font-medium rounded transition-colors",
                    locationConditionConfig.locationType === 'zone'
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                      : "bg-slate-800/50 text-slate-400 border border-slate-700 hover:border-slate-600"
                  )}
                >
                  Named Zone
                </button>
                <button
                  onClick={() => setLocationConditionConfig({ ...locationConditionConfig, locationType: 'gps' })}
                  className={cn(
                    "px-3 py-2 text-sm font-medium rounded transition-colors",
                    locationConditionConfig.locationType === 'gps'
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                      : "bg-slate-800/50 text-slate-400 border border-slate-700 hover:border-slate-600"
                  )}
                >
                  GPS Coordinates
                </button>
              </div>
            </div>

            {/* Zone Name (if zone type) */}
            {locationConditionConfig.locationType === 'zone' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Zone Name</label>
                <select
                  value={locationConditionConfig.zoneName}
                  onChange={(e) => setLocationConditionConfig({ ...locationConditionConfig, zoneName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
                >
                  <option value="Front Door">Front Door</option>
                  <option value="Parking Lot">Parking Lot</option>
                  <option value="Loading Dock">Loading Dock</option>
                  <option value="Cash Register">Cash Register</option>
                  <option value="Storage Room">Storage Room</option>
                  <option value="Office">Office</option>
                </select>
                <p className="text-xs text-slate-400">Select a predefined location zone</p>
              </div>
            )}

            {/* GPS Coordinates (if GPS type) */}
            {locationConditionConfig.locationType === 'gps' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={locationConditionConfig.latitude}
                      onChange={(e) => setLocationConditionConfig({ ...locationConditionConfig, latitude: parseFloat(e.target.value) || 0 })}
                      placeholder="37.7749"
                      className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={locationConditionConfig.longitude}
                      onChange={(e) => setLocationConditionConfig({ ...locationConditionConfig, longitude: parseFloat(e.target.value) || 0 })}
                      placeholder="-122.4194"
                      className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Radius (meters)</label>
                  <input
                    type="number"
                    value={locationConditionConfig.radius}
                    onChange={(e) => setLocationConditionConfig({ ...locationConditionConfig, radius: parseInt(e.target.value) || 100 })}
                    className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
                  />
                  <p className="text-xs text-slate-400">Trigger within this distance from coordinates</p>
                </div>
              </>
            )}

            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-300">Enable Condition</p>
                <p className="text-xs text-slate-400">Workflow will only continue if location matches</p>
              </div>
              <button
                onClick={() => setLocationConditionConfig({ ...locationConditionConfig, enabled: !locationConditionConfig.enabled })}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors",
                  locationConditionConfig.enabled ? "bg-yellow-500" : "bg-slate-600"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                  locationConditionConfig.enabled ? "translate-x-7" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Example */}
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-xs font-medium text-yellow-400 mb-1">Example:</p>
              <p className="text-xs text-slate-300">
                {locationConditionConfig.locationType === 'zone'
                  ? `Workflow will only execute when camera is in "${locationConditionConfig.zoneName}" zone`
                  : `Workflow will only execute within ${locationConditionConfig.radius}m of the specified coordinates`
                }
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={saveLocationConditionConfig}
                className="flex-1"
                size="sm"
              >
                Save
              </Button>
              <Button
                onClick={() => setShowLocationConditionConfig(false)}
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

    {/* Slack Configuration Modal */}
    {showSlackConfig && (
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
        onClick={() => setShowSlackConfig(false)}
      >
        <Card 
          className="w-[450px] max-h-[80vh] overflow-y-auto border-green-500/30 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <CardHeader className="border-b border-green-500/20 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-4 w-4 text-green-400" />
                Configure Slack
              </CardTitle>
              <button
                onClick={() => setShowSlackConfig(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 pb-4">
            {/* Channel Configuration */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Channel</label>
              <input
                type="text"
                value={slackConfig.channel}
                onChange={(e) => setSlackConfig({ ...slackConfig, channel: e.target.value })}
                placeholder="#general or #alerts"
                className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            {/* Message Template */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Message Template</label>
              <textarea
                value={slackConfig.message}
                onChange={(e) => setSlackConfig({ ...slackConfig, message: e.target.value })}
                placeholder="🚨 SURVEILLANCE ALERT: {{event_type}}&#10;📝 Description: {{event_description}}&#10;⏰ Time: {{timestamp}}&#10;🎯 Confidence: {{confidence}}"
                rows={4}
                className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 resize-none"
              />
              <div className="text-xs text-slate-400">
                Available variables: {'{{event_type}}'}, {'{{event_description}}'}, {'{{timestamp}}'}, {'{{confidence}}'}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                onClick={() => {
                  const updatedConfig = { ...slackConfig, configured: true, nodeId: slackConfigNodeId };
                  setNodes((nds) => nds.map((node) => 
                    node.id === slackConfigNodeId 
                      ? { ...node, data: { ...node.data, config: updatedConfig } }
                      : node
                  ));
                  setShowSlackConfig(false);
                }} 
                className="flex-1" 
                size="sm"
                disabled={!slackConfig.channel || !slackConfig.message}
              >
                Save Configuration
              </Button>
              <Button 
                onClick={() => setShowSlackConfig(false)} 
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
