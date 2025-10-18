import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { detectionEngine } from './services/detectionEngine';
import type { DetectedObject, DetectionEvent, SceneContext } from './types/detectionTypes';
import WorkflowBuilder from './components/WorkflowBuilder';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Video, Upload, Shield, AlertTriangle, Eye, Brain, Camera, VideoOff } from 'lucide-react';
import { workflowEngine } from './services/workflowEngine';
import { ToastContainer, useToast } from './components/ui/toast';
import type { Node, Edge } from 'reactflow';

// Helper functions for workflow persistence
const saveWorkflowToStorage = (videoId: string, nodes: Node[], edges: Edge[]) => {
  try {
    // Clean nodes: remove non-serializable data (icon components, callbacks)
    const cleanNodes = nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        icon: undefined,  // Remove icon component
        onDelete: undefined,  // Remove callbacks
        onSettings: undefined,
        isExecuting: undefined,  // Remove runtime state
        isTriggered: undefined,
      }
    }));

    const workflows = JSON.parse(localStorage.getItem('surveilens_workflows') || '{}');
    workflows[videoId] = { nodes: cleanNodes, edges, timestamp: Date.now() };
    localStorage.setItem('surveilens_workflows', JSON.stringify(workflows));
    console.log('💾 Workflow saved for:', videoId, '| Nodes:', nodes.length, '| Edges:', edges.length);
  } catch (err) {
    console.error('❌ Failed to save workflow:', err);
  }
};

const loadWorkflowFromStorage = (videoId: string): { nodes: Node[]; edges: Edge[] } | null => {
  try {
    const workflows = JSON.parse(localStorage.getItem('surveilens_workflows') || '{}');
    const workflow = workflows[videoId];
    if (workflow) {
      console.log('📂 Workflow loaded for:', videoId, '| Nodes:', workflow.nodes.length, '| Edges:', workflow.edges.length);
      // Note: Icon and callbacks will be re-added by WorkflowBuilder when creating nodes
      return { nodes: workflow.nodes, edges: workflow.edges };
    } else {
      console.log('📂 No saved workflow found for:', videoId);
    }
  } catch (err) {
    console.error('❌ Failed to load workflow:', err);
  }
  return null;
};

function App() {
  const location = useLocation();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [objects, setObjects] = useState<DetectedObject[]>([]);
  const [sceneContext, setSceneContext] = useState<SceneContext | null>(null);
  const [recentEvents, setRecentEvents] = useState<DetectionEvent[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [useLiveCamera, setUseLiveCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [workflowNodes, setWorkflowNodes] = useState<Node[]>([]);
  const [workflowEdges, setWorkflowEdges] = useState<Edge[]>([]);
  const [executingNodes, setExecutingNodes] = useState<string[]>([]);

  const { toasts, addToast, removeToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoUrlRef = useRef<string>('');
  const detectionLoopRef = useRef<number | undefined>(undefined);
  // Cache blob URLs to avoid re-fetching and prevent ERR_FILE_NOT_FOUND errors
  const blobCacheRef = useRef<Map<string, string>>(new Map());

  const hasApiKey = !!import.meta.env.VITE_OPENAI_API_KEY && 
                    import.meta.env.VITE_OPENAI_API_KEY !== 'your_openai_api_key_here';

  useEffect(() => {
    console.log('🤖 Initializing AI detection engine...');
    detectionEngine.initialize().then(() => {
      setIsInitialized(true);
      console.log('✅ Detection Active - AI models loaded successfully');
    }).catch(err => {
      console.error('❌ Failed to initialize detection engine:', err);
      setError('Failed to load AI models. Please check console.');
    });
  }, []);

  // Handle camera stream changes
  useEffect(() => {
    if (cameraStream && videoRef.current && useLiveCamera) {
      console.log('🎥 Setting camera stream to video element');
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().then(() => {
        console.log('▶️ Camera playing');
        setIsPlaying(true);
      }).catch(err => {
        console.error('❌ Play error:', err);
      });
    }
  }, [cameraStream, useLiveCamera]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      // Stop camera if active
      if (cameraStream) {
        stopLiveCamera();
      }

      // Generate video ID from file name
      const videoId = `upload_${file.name}`;
      console.log('📤 Uploaded file:', file.name, '→ VideoID:', videoId);

      // Check if we already have this file cached
      let blobUrl = blobCacheRef.current.get(videoId);

      if (!blobUrl) {
        blobUrl = URL.createObjectURL(file);
        blobCacheRef.current.set(videoId, blobUrl);
      }

      videoUrlRef.current = blobUrl;

      // Load saved workflow if exists
      const savedWorkflow = loadWorkflowFromStorage(videoId);

      // Set video ID BEFORE setting workflow nodes/edges
      setCurrentVideoId(videoId);

      if (savedWorkflow) {
        console.log('✅ Restoring saved workflow');
        setWorkflowNodes(savedWorkflow.nodes);
        setWorkflowEdges(savedWorkflow.edges);
      } else {
        console.log('🆕 Starting with empty workflow');
        setWorkflowNodes([]);
        setWorkflowEdges([]);
      }

      setVideoFile(file);
      setSceneContext(null);
      setRecentEvents([]);
      setObjects([]);
      setError('');
      detectionEngine.clearHistory();
    }
  };

  const handleLibraryVideoSelect = async (videoPath: string) => {
    try {
      // Stop camera if active
      if (cameraStream) {
        stopLiveCamera();
      }

      // Generate video ID from path (use path as unique identifier for library videos)
      const videoId = `library_${videoPath}`;
      console.log('🎬 Loading video:', videoPath, '→ VideoID:', videoId);

      // Check if we already have this video cached
      let blobUrl = blobCacheRef.current.get(videoPath);
      let file: File;

      if (!blobUrl) {
        console.log('📥 Fetching video from:', videoPath);
        // Fetch the video from the public folder
        const response = await fetch(videoPath);
        if (!response.ok) {
          throw new Error(`Failed to load video: ${response.statusText}`);
        }

        // Convert to blob and create a File object
        const blob = await response.blob();
        const fileName = videoPath.split('/').pop() || 'library-video.mp4';
        file = new File([blob], fileName, { type: blob.type });

        // Create and cache blob URL
        blobUrl = URL.createObjectURL(file);
        blobCacheRef.current.set(videoPath, blobUrl);
        console.log('💾 Video cached:', videoPath);
      } else {
        console.log('✅ Using cached video:', videoPath);
        // Re-fetch blob to create File object (we need the File object for state)
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        const fileName = videoPath.split('/').pop() || 'library-video.mp4';
        file = new File([blob], fileName, { type: blob.type });
      }

      // Load saved workflow if exists
      const savedWorkflow = loadWorkflowFromStorage(videoId);

      // Set video ID BEFORE setting workflow nodes/edges
      setCurrentVideoId(videoId);

      if (savedWorkflow) {
        console.log('✅ Restoring saved workflow');
        setWorkflowNodes(savedWorkflow.nodes);
        setWorkflowEdges(savedWorkflow.edges);
      } else {
        console.log('🆕 Starting with empty workflow');
        setWorkflowNodes([]);
        setWorkflowEdges([]);
      }

      // Set video URL and states
      videoUrlRef.current = blobUrl;
      setVideoFile(file);
      setSceneContext(null);
      setRecentEvents([]);
      setObjects([]);
      setError('');
      detectionEngine.clearHistory();
    } catch (err) {
      console.error('Error loading library video:', err);
      setError('Failed to load video from library');
    }
  };

  // Handle video from library dashboard (via route state)
  useEffect(() => {
    const state = location.state as { videoPath?: string } | null;
    if (state?.videoPath) {
      handleLibraryVideoSelect(state.videoPath);
    }
  }, [location.state]);

  // Save workflow to localStorage whenever it changes
  useEffect(() => {
    console.log('🔄 Workflow state changed - VideoID:', currentVideoId, '| Nodes:', workflowNodes.length, '| Edges:', workflowEdges.length);

    if (currentVideoId) {
      // Save even if empty (to persist cleared workflows)
      saveWorkflowToStorage(currentVideoId, workflowNodes, workflowEdges);
    } else {
      console.log('⚠️ No currentVideoId set, skipping save');
    }
  }, [workflowNodes, workflowEdges, currentVideoId]);

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up blob URLs...');
      blobCacheRef.current.forEach((blobUrl) => {
        URL.revokeObjectURL(blobUrl);
      });
      blobCacheRef.current.clear();
    };
  }, []);

  const startLiveCamera = async () => {
    try {
      console.log('📷 Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });
      console.log('✅ Camera access granted', stream);
      console.log('Stream tracks:', stream.getTracks());

      // Generate video ID for live camera
      const videoId = 'live_camera';
      console.log('📹 Starting live camera → VideoID:', videoId);

      // Load saved workflow if exists
      const savedWorkflow = loadWorkflowFromStorage(videoId);

      // Set video ID BEFORE setting workflow nodes/edges
      setCurrentVideoId(videoId);

      if (savedWorkflow) {
        console.log('✅ Restoring saved workflow');
        setWorkflowNodes(savedWorkflow.nodes);
        setWorkflowEdges(savedWorkflow.edges);
      } else {
        console.log('🆕 Starting with empty workflow');
        setWorkflowNodes([]);
        setWorkflowEdges([]);
      }

      setVideoFile(null);
      setSceneContext(null);
      setRecentEvents([]);
      setObjects([]);
      setError('');
      setUseLiveCamera(true);
      setCameraStream(stream);
    } catch (err) {
      console.error('❌ Camera error:', err);
      setError('Failed to access camera: ' + (err as Error).message);
    }
  };

  const stopLiveCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setUseLiveCamera(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsPlaying(false);
    setSceneContext(null);
    setRecentEvents([]);
    setObjects([]);
  };

  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.readyState !== 4) return null;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    return dataUrl.replace('data:image/jpeg;base64,', '');
  };

  const drawBoundingBoxes = (detectedObjects: DetectedObject[]) => {
    if (!overlayCanvasRef.current || !videoRef.current) return;
    
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    detectedObjects.forEach(obj => {
      const [x, y, width, height] = obj.bbox;
      const color = obj.confidence > 0.7 ? '#3b82f6' : '#f59e0b';
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      
      const label = `${obj.class} ${Math.round(obj.confidence * 100)}%`;
      ctx.font = '14px Inter, system-ui, sans-serif';
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 24, textWidth + 12, 24);
      
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + 6, y - 7);
    });
  };

  // Track which events have already triggered workflows
  const triggeredEventsRef = useRef<Set<number>>(new Set());
  const workflowNodesRef = useRef<Node[]>([]);
  const workflowEdgesRef = useRef<Edge[]>([]);
  
  // Cooldown tracking: Map of triggerNodeId -> last trigger timestamp
  const triggerCooldownRef = useRef<Map<string, number>>(new Map());
  const TRIGGER_COOLDOWN_MS = 60000; // 60 second cooldown between triggers to prevent spam calls

  // Function to clear triggered events (for debugging/testing)
  const clearTriggeredEvents = () => {
    console.log('🗑️ Clearing triggered events cache...');
    triggeredEventsRef.current.clear();
    triggerCooldownRef.current.clear();
    console.log('✅ Triggered events cache cleared! You can trigger workflows again.');
  };

  // Expose clearTriggeredEvents globally for console access
  useEffect(() => {
    (window as any).clearTriggeredEvents = clearTriggeredEvents;
    (window as any).clearCooldown = clearTriggeredEvents; // Alias for easier typing
    console.log('🔧 Debug functions available: clearTriggeredEvents() or clearCooldown()');
    return () => {
      delete (window as any).clearTriggeredEvents;
      delete (window as any).clearCooldown;
    };
  }, []);

  // Keep refs updated
  useEffect(() => {
    workflowNodesRef.current = workflowNodes;
    workflowEdgesRef.current = workflowEdges;
  }, [workflowNodes, workflowEdges]);

  // Check if any workflow triggers match the current events
  const checkWorkflowTriggers = useCallback(async (events: DetectionEvent[], currentSceneContext: SceneContext | null) => {
    const nodes = workflowNodesRef.current;
    const edges = workflowEdgesRef.current;
    
    const triggerNodes = nodes.filter(n => n.data.nodeType === 'trigger');
    
    console.log('═══════════════════════════════════════');
    console.log('🔍 WORKFLOW TRIGGER CHECK');
    console.log('Trigger nodes:', triggerNodes.length);
    console.log('Events to check:', events.length);
    console.log('Event types:', events.map(e => e.type));
    console.log('Scene context available:', !!currentSceneContext);
    console.log('═══════════════════════════════════════');
    
    if (triggerNodes.length === 0) {
      console.log('⚠️ No trigger nodes in workflow');
      return;
    }
    
    if (events.length === 0) {
      console.log('⚠️ No events to check');
      return;
    }
    
    for (const triggerNode of triggerNodes) {
      console.log('\n🎯 Checking trigger:', triggerNode.data.label, '(', triggerNode.data.blockType, ')');
      
      try {
        const isTriggered = await workflowEngine.checkTrigger(triggerNode, events, currentSceneContext);
        
        if (isTriggered) {
          const latestEvent = events[events.length - 1];
          
          // Check cooldown: prevent same trigger from firing too frequently
          const now = Date.now();
          const lastTriggerTime = triggerCooldownRef.current.get(triggerNode.id) || 0;
          const timeSinceLastTrigger = now - lastTriggerTime;
          
          if (timeSinceLastTrigger < TRIGGER_COOLDOWN_MS) {
            const remainingCooldown = Math.ceil((TRIGGER_COOLDOWN_MS - timeSinceLastTrigger) / 1000);
            console.log(`⏳ Trigger on cooldown (${remainingCooldown}s remaining), skipping`);
            continue;
          }
          
          // Update cooldown timer
          triggerCooldownRef.current.set(triggerNode.id, now);
          
          console.log('🚨🚨🚨 WORKFLOW TRIGGERED! 🚨🚨🚨');
          console.log('Trigger:', triggerNode.data.label);
          console.log('Event:', latestEvent.type);
          console.log('Description:', latestEvent.description);
          
          // Show toast notification
          addToast({
            type: 'workflow',
            title: `Workflow Triggered: ${triggerNode.data.label}`,
            description: latestEvent.description
          });
          
          // Execute workflow
          await workflowEngine.executeWorkflow(
            nodes,
            edges,
            triggerNode.id,
            latestEvent
          );
        }
      } catch (error) {
        console.error('❌ Error checking trigger:', error);
      }
    }
  }, [addToast]);

  // Subscribe to workflow execution updates
  useEffect(() => {
    const unsubscribe = workflowEngine.onExecutionUpdate((execution) => {
      setExecutingNodes(execution.activeNodes);
      
      if (execution.status === 'completed') {
        addToast({
          type: 'success',
          title: 'Workflow Completed',
          description: `Triggered by ${execution.triggeredBy}`
        });
        setTimeout(() => setExecutingNodes([]), 1000);
      } else if (execution.status === 'failed') {
        addToast({
          type: 'error',
          title: 'Workflow Failed',
          description: 'Check console for details'
        });
        setExecutingNodes([]);
      }
    });
    
    return unsubscribe;
  }, [addToast]);

  const runDetection = async () => {
    console.log('🔄 runDetection called, isPlaying:', isPlaying, 'isInitialized:', isInitialized);
    
    if (!videoRef.current || !isPlaying || !isInitialized) {
      console.log('❌ Detection skipped - video:', !!videoRef.current, 'playing:', isPlaying, 'init:', isInitialized);
      return;
    }

    try {
      console.log('✅ Starting detection...');
      
      const detectedObjects = await detectionEngine.detectObjects(videoRef.current);
      console.log('👁️ Detected', detectedObjects.length, 'objects:', detectedObjects);
      setObjects(detectedObjects);
      
      drawBoundingBoxes(detectedObjects);
      console.log('🎨 Drew bounding boxes');

      const motion = detectionEngine.detectMotion();
      console.log('🏃 Motion:', motion.description);

      if (hasApiKey && !isAnalyzing) {
        const frameData = captureFrame();
        if (frameData) {
          console.log('📸 Captured frame, sending to AI...');
          setIsAnalyzing(true);
          
          detectionEngine.analyzeScene(frameData, false).then(context => {
            if (context) {
              console.log('✅ Got AI Analysis:', context);
              setSceneContext(context);
              
              // Check workflow triggers with NEW scene context
              const latestEvents = detectionEngine.getRecentEvents(30);
              if (workflowNodesRef.current.length > 0 && latestEvents.length > 0) {
                const triggerCount = workflowNodesRef.current.filter(n => n.data.nodeType === 'trigger').length;
                if (triggerCount > 0) {
                  console.log('✅ Calling checkWorkflowTriggers with NEW scene context and', latestEvents.length, 'events');
                  checkWorkflowTriggers(latestEvents, context);
                }
              }
            } else {
              console.log('⏳ Analysis skipped (rate limited)');
            }
            setIsAnalyzing(false);
          }).catch(err => {
            console.error('❌ AI analysis error:', err);
            setError('AI Error: ' + err.message);
            setIsAnalyzing(false);
          });
        } else {
          console.log('⚠️ Failed to capture frame');
        }
      }

      const events = detectionEngine.getRecentEvents(30);
      setRecentEvents(events);

      // Check workflow triggers for new events - always check if we have triggers
      if (workflowNodesRef.current.length > 0) {
        const triggerCount = workflowNodesRef.current.filter(n => n.data.nodeType === 'trigger').length;
        if (triggerCount > 0 && events.length > 0) {
          console.log('✅ Calling checkWorkflowTriggers with', events.length, 'events');
          checkWorkflowTriggers(events, sceneContext);
        }
      }

    } catch (err: any) {
      console.error('Detection error:', err);
      setError(err.message);
    }

    detectionLoopRef.current = requestAnimationFrame(runDetection);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      console.log('▶️ Video started playing (from controls)!');
      setIsPlaying(true);
    };

    const handlePause = () => {
      console.log('⏸️ Video paused (from controls)!');
      setIsPlaying(false);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoFile]);

  useEffect(() => {
    console.log('🎬 Detection loop effect triggered - isPlaying:', isPlaying, 'isInitialized:', isInitialized);
    if (isPlaying && isInitialized) {
      console.log('✅ Starting detection loop!');
      runDetection();
    } else {
      console.log('❌ Not starting detection loop');
    }
    
    return () => {
      if (detectionLoopRef.current) {
        cancelAnimationFrame(detectionLoopRef.current);
      }
    };
  }, [isPlaying, isInitialized]);

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3">
      {/* Header */}
      <header className="max-w-[1800px] mx-auto mb-4 animate-slide-in">
        <Card className="border-primary/20 bg-gradient-to-r from-slate-900/95 to-slate-800/95 backdrop-blur shadow-lg">
          <CardHeader className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-8 w-8 text-primary animate-pulse-slow" />
                <div>
                  <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    AI Surveillance Detection Engine
                  </CardTitle>
                  <CardDescription className="text-base mt-1">
                    Hybrid Detection: YOLOv8 (Real-time) + GPT-4 Vision (Context Understanding)
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      </header>

      {/* Main Content Grid */}
      <main className="max-w-[1800px] mx-auto grid grid-cols-3 gap-4 mb-4 h-[40vh]">
        {/* Video Feed */}
        <Card className="col-span-1 border-primary/20 bg-slate-900/50 backdrop-blur flex flex-col overflow-hidden shadow-xl">
          <CardHeader className="pb-3 flex-shrink-0 border-b border-primary/10">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Video className="h-4 w-4 text-primary" />
                Video Feed
              </CardTitle>
              <div className="flex gap-2">
                {!useLiveCamera ? (
                  <>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="video-upload"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => document.getElementById('video-upload')?.click()}
                      className="text-blue-400 hover:text-blue-300 hover:bg-slate-800/50"
                    >
                      <Upload className="h-4 w-4 mr-1.5" />
                      Upload
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={startLiveCamera}
                      className="text-blue-400 hover:text-blue-300 hover:bg-slate-800/50"
                    >
                      <Camera className="h-4 w-4 mr-1.5" />
                      Camera
                    </Button>
                  </>
                ) : (
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={stopLiveCamera}
                    className="shadow-md"
                  >
                    <VideoOff className="h-3.5 w-3.5 mr-1.5" />
                    Stop Camera
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden flex flex-col p-4">
            {!hasApiKey && (
              <Badge variant="warning" className="w-full mb-3 justify-center py-2">
                <AlertTriangle className="h-4 w-4 mr-2" />
                OpenAI API Key not configured
              </Badge>
            )}

            {error && (
              <Badge variant="destructive" className="w-full mb-3 justify-center py-2">
                Error: {error}
              </Badge>
            )}

            {(videoFile || useLiveCamera) ? (
              <div className="flex flex-col gap-2">
                <div className="relative rounded-lg overflow-hidden bg-black w-full" style={{ height: '350px' }}>
                  <video
                    ref={videoRef}
                    controls={!useLiveCamera}
                    autoPlay={useLiveCamera}
                    playsInline
                    muted={useLiveCamera}
                    className="w-full h-full object-contain"
                    style={useLiveCamera ? { transform: 'scaleX(-1)' } : undefined}
                    {...(!useLiveCamera && { src: videoUrlRef.current })}
                    key={useLiveCamera ? 'live' : videoUrlRef.current}
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  />
                  {useLiveCamera && (
                    <Badge className="absolute top-3 left-3 bg-red-600 text-white z-10 shadow-lg font-semibold">
                      ● LIVE
                    </Badge>
                  )}
                </div>


                {isAnalyzing && (
                  <Badge className="w-full justify-center py-2 animate-pulse">
                    <Brain className="h-4 w-4 mr-2 animate-pulse-slow" />
                    AI Analyzing...
                  </Badge>
                )}
              </div>
            ) : (
              <div className="h-full rounded-lg border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center text-muted-foreground bg-slate-950/50">
                <Video className="h-16 w-16 mb-3 text-primary/50" />
                <p className="text-sm">Upload a video to start detection</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Real-time Detection */}
        <Card className="col-span-1 border-primary/20 bg-slate-900/50 backdrop-blur flex flex-col overflow-hidden shadow-xl">
          <CardHeader className="pb-3 flex-shrink-0 border-b border-primary/10">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Eye className="h-4 w-4 text-primary" />
              Real-Time Detection
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4">
            {!isInitialized ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                  <p className="text-sm">Initializing models...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-primary">
                    Detected Objects ({objects.length})
                  </h4>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    {objects.length > 0 ? (
                      objects.map((obj, index) => (
                        <Badge key={index} variant="outline" className="animate-slide-in">
                          {obj.class} {Math.round(obj.confidence * 100)}%
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No objects detected</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2 text-orange-400">
                    Events ({recentEvents.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {recentEvents.length > 0 ? (
                      recentEvents.map((event, index) => (
                        <div
                          key={index}
                          className="p-3 rounded-lg bg-slate-800/50 border border-primary/20 animate-slide-in"
                        >
                          <p className="font-semibold text-sm text-primary">
                            {event.type.replace(/_/g, ' ').toUpperCase()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {event.description}
                          </p>
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No events detected</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Scene Understanding */}
        <Card className="col-span-1 border-primary/20 bg-slate-900/50 backdrop-blur flex flex-col overflow-hidden shadow-xl">
          <CardHeader className="pb-3 flex-shrink-0 border-b border-primary/10">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Brain className="h-4 w-4 text-primary" />
              AI Scene Understanding
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4">
            {sceneContext ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-cyan-400">Description</h4>
                  <p className="text-sm text-muted-foreground">{sceneContext.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-primary/20">
                    <p className="text-xs text-muted-foreground">People Count</p>
                    <p className="text-2xl font-bold text-primary">{sceneContext.peopleCount}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-primary/20">
                    <p className="text-xs text-muted-foreground">Objects</p>
                    <p className="text-2xl font-bold text-primary">{sceneContext.objects.length}</p>
                  </div>
                </div>

                {sceneContext.activities.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-green-400">Activities</h4>
                    <div className="flex flex-wrap gap-2">
                      {sceneContext.activities.map((activity, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {activity}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {sceneContext.suspiciousActivities && sceneContext.suspiciousActivities.length > 0 && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/50 animate-pulse-slow">
                    <h4 className="text-sm font-semibold mb-2 text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Suspicious Activities
                    </h4>
                    {sceneContext.suspiciousActivities.map((activity, idx) => (
                      <div key={idx} className="mb-2 last:mb-0">
                        <p className="font-semibold text-sm text-destructive">
                          {activity.type}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {activity.description}
                        </p>
                        <Badge variant="destructive" className="mt-1 text-xs">
                          {Math.round(activity.confidence * 100)}% Confidence
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <div className="text-center">
                  <Brain className="h-12 w-12 mx-auto mb-3 text-primary/30" />
                  <p className="text-sm">
                    {!hasApiKey
                      ? 'Configure API key for AI analysis'
                      : !videoFile
                      ? 'Upload a video to start'
                      : !isPlaying
                      ? 'Press play to begin analysis'
                      : 'Waiting for AI analysis...'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Workflow Builder */}
      <div className="max-w-[1800px] mx-auto animate-slide-in h-[calc(50vh-70px)]">
        <WorkflowBuilder
          initialNodes={workflowNodes}
          initialEdges={workflowEdges}
          onWorkflowChange={(nodes, edges) => {
            console.log('🔄 Workflow changed:', nodes.length, 'nodes,', edges.length, 'edges');
            setWorkflowNodes(nodes);
            setWorkflowEdges(edges);
          }}
          executingNodes={executingNodes}
        />
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}

export default App;
