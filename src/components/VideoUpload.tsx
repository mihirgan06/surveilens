import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Upload, Play, Pause, RotateCcw, FileVideo, AlertTriangle, Brain, Eye } from 'lucide-react';
import { detectObjects, analyzeSuspiciousActivity, detectShoplifting } from '../utils/detection';
import { Detection, SuspiciousActivity, Alert } from '../types/detection';
import { analyzeSceneWithContext, SceneAnalysis, defaultWorkflowRules, checkWorkflowTriggers } from '../services/openai';
import { config, isOpenAIConfigured } from '../config';

interface VideoUploadProps {
  onAlert: (alert: Alert) => void;
}

export const VideoUpload: React.FC<VideoUploadProps> = ({ onAlert }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [detectionHistory, setDetectionHistory] = useState<Detection[][]>([]);
  const [allActivities, setAllActivities] = useState<SuspiciousActivity[]>([]);
  const [processedFrames, setProcessedFrames] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const animationIdRef = useRef<number>();
  
  // OpenAI Analysis States
  const [aiAnalysis, setAiAnalysis] = useState<SceneAnalysis | null>(null);
  const [aiAnalysisHistory, setAiAnalysisHistory] = useState<SceneAnalysis[]>([]);
  const [isAnalyzingWithAI, setIsAnalyzingWithAI] = useState(false);
  const [lastAIAnalysisTime, setLastAIAnalysisTime] = useState(0);
  const [apiKey, setApiKey] = useState(config.openaiApiKey);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      if (videoRef.current) {
        videoRef.current.src = url;
        videoRef.current.load();
      }
      // Reset states
      setDetections([]);
      setDetectionHistory([]);
      setAllActivities([]);
      setProcessedFrames(0);
      setTotalFrames(0);
      setIsPlaying(false);
      setIsProcessing(false);
      setAiAnalysis(null);
      setAiAnalysisHistory([]);
    }
  };

  // Capture current frame as base64
  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.readyState !== 4) return null;
    
    // Create a temporary canvas for capture
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 640; // Reduce size for API
    tempCanvas.height = 480;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) return null;
    
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    
    // Convert to base64
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);
    return dataUrl.replace('data:image/jpeg;base64,', '');
  }, []);

  // Analyze frame with OpenAI
  const analyzeWithOpenAI = useCallback(async () => {
    if (!apiKey || apiKey === '') {
      console.log('OpenAI API key not configured');
      return;
    }

    const frameData = captureFrame();
    if (!frameData) return;

    setIsAnalyzingWithAI(true);
    
    try {
      const analysis = await analyzeSceneWithContext(
        frameData,
        aiAnalysisHistory,
        defaultWorkflowRules
      );
      
      setAiAnalysis(analysis);
      setAiAnalysisHistory(prev => [...prev.slice(-10), analysis]); // Keep last 10 analyses
      
      // Check workflow triggers
      const triggeredRules = checkWorkflowTriggers(analysis, defaultWorkflowRules);
      
      // Generate alerts for triggered workflows
      triggeredRules.forEach(rule => {
        onAlert({
          id: `ai-alert-${Date.now()}-${Math.random()}`,
          type: 'danger',
          message: `AI Detected: ${rule.name} - ${analysis.description}`,
          timestamp: new Date(),
          detections: []
        });
      });
      
      // Generate alerts for high-confidence suspicious activities
      analysis.suspiciousActivities
        .filter(a => a.confidence > 0.7)
        .forEach(activity => {
          onAlert({
            id: `ai-suspicious-${Date.now()}-${Math.random()}`,
            type: activity.confidence > 0.8 ? 'danger' : 'warning',
            message: `AI Analysis: ${activity.description}`,
            timestamp: new Date(),
            detections: []
          });
        });
      
    } catch (error) {
      console.error('Error analyzing with OpenAI:', error);
    } finally {
      setIsAnalyzingWithAI(false);
    }
  }, [apiKey, captureFrame, aiAnalysisHistory, onAlert]);

  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !isProcessing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (ctx && video.readyState === 4 && !video.paused && !video.ended) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        // Local object detection (always runs)
        const newDetections = await detectObjects(video);
        setDetections(newDetections);

        // Update detection history
        setDetectionHistory(prev => {
          const updated = [...prev, newDetections];
          return updated.slice(-30);
        });

        // Draw bounding boxes
        newDetections.forEach(detection => {
          const [x, y, width, height] = detection.bbox;
          
          ctx.strokeStyle = detection.score > 0.7 ? '#10b981' : '#f59e0b';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, width, height);
          
          ctx.fillStyle = detection.score > 0.7 ? '#10b981' : '#f59e0b';
          ctx.fillRect(x, y - 20, width, 20);
          ctx.fillStyle = 'white';
          ctx.font = '14px Arial';
          ctx.fillText(
            `${detection.class} (${Math.round(detection.score * 100)}%)`,
            x + 5,
            y - 5
          );
        });

        // OpenAI Analysis (rate-limited)
        const currentTimeMs = Date.now();
        const timeSinceLastAnalysis = currentTimeMs - lastAIAnalysisTime;
        
        if (apiKey && timeSinceLastAnalysis >= config.rateLimits.cooldownPeriod && !isAnalyzingWithAI) {
          setLastAIAnalysisTime(currentTimeMs);
          analyzeWithOpenAI();
        }

        setProcessedFrames(prev => prev + 1);
      } catch (err) {
        console.error('Detection error:', err);
      }

      // Continue processing
      animationIdRef.current = requestAnimationFrame(processFrame);
    } else if (video.ended) {
      setIsProcessing(false);
      setIsPlaying(false);
    }
  }, [isProcessing, apiKey, lastAIAnalysisTime, isAnalyzingWithAI, analyzeWithOpenAI]);

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
        setIsProcessing(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
        setIsProcessing(true);
      }
    }
  };

  const resetVideo = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
      setIsPlaying(false);
      setIsProcessing(false);
      setDetections([]);
      setDetectionHistory([]);
      setAllActivities([]);
      setProcessedFrames(0);
      setAiAnalysis(null);
      setAiAnalysisHistory([]);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (isProcessing) {
      processFrame();
    }

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isProcessing, processFrame]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setTotalFrames(Math.floor(video.duration * 30)); // Assuming 30 fps
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [videoFile]);

  return (
    <div className="flex gap-6">
      {/* Left side - Video player */}
      <div className="flex-1 bg-gray-900 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <FileVideo className="w-6 h-6" />
            Video Analysis
          </h2>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Upload Video
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* API Key Input */}
        {!apiKey && (
          <div className="mb-4 p-4 bg-yellow-500/20 border border-yellow-500 rounded-lg">
            <p className="text-yellow-400 mb-2">Enter OpenAI API Key for AI Analysis:</p>
            <input
              type="password"
              placeholder="sk-..."
              className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg"
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        )}

        {videoFile ? (
          <>
            <div className="relative">
              <video
                ref={videoRef}
                className="w-full rounded-lg hidden"
                controls={false}
              />
              <canvas
                ref={canvasRef}
                className="w-full rounded-lg"
              />
              
              {/* Video controls */}
              <div className="mt-4 bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-4 mb-3">
                  <button
                    onClick={togglePlayPause}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={resetVideo}
                    className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <div className="flex-1">
                    <div className="bg-gray-700 rounded-full h-2 relative">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${(currentTime / duration) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
                
                <div className="flex justify-between text-gray-400 text-sm">
                  <span>Processing frame {processedFrames} / ~{totalFrames}</span>
                  {isAnalyzingWithAI && (
                    <span className="text-blue-400 flex items-center gap-1">
                      <Brain className="w-4 h-4 animate-pulse" />
                      AI Analyzing...
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Local Detection results */}
            <div className="mt-4 bg-gray-800 rounded-lg p-4">
              <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Object Detection (Local)
              </h3>
              {detections.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {detections.map((detection, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-blue-600/20 border border-blue-500 text-blue-400 rounded-full text-sm"
                    >
                      {detection.class} ({Math.round(detection.score * 100)}%)
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">
                  {isProcessing ? 'Analyzing...' : 'Start playback to begin analysis'}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="bg-gray-800 rounded-lg h-96 flex items-center justify-center">
            <div className="text-center">
              <Upload className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No video uploaded</p>
              <p className="text-gray-500 text-sm mt-2">
                Upload surveillance footage to analyze what's happening
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right side - AI Scene Analysis */}
      <div className="w-96 bg-gray-900 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Brain className="w-6 h-6" />
          AI Scene Analysis
        </h2>

        {aiAnalysis ? (
          <div className="space-y-4">
            {/* Current Scene Description */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-blue-400 font-medium mb-2">What's Happening:</h3>
              <p className="text-gray-300">{aiAnalysis.description}</p>
            </div>

            {/* Activities */}
            {aiAnalysis.activities.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-green-400 font-medium mb-2">Activities Detected:</h3>
                <ul className="space-y-1">
                  {aiAnalysis.activities.map((activity, idx) => (
                    <li key={idx} className="text-gray-300 text-sm flex items-start">
                      <span className="text-green-400 mr-2">•</span>
                      {activity}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* People & Objects */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-purple-400 font-medium mb-2">Scene Details:</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">People Count:</span>
                  <span className="text-white">{aiAnalysis.peopleCount}</span>
                </div>
                {aiAnalysis.objects.length > 0 && (
                  <div>
                    <span className="text-gray-400">Objects:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {aiAnalysis.objects.map((obj, idx) => (
                        <span key={idx} className="px-2 py-1 bg-purple-600/20 text-purple-300 rounded text-xs">
                          {obj}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Suspicious Activities */}
            {aiAnalysis.suspiciousActivities.length > 0 && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-4">
                <h3 className="text-red-400 font-medium mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Suspicious Activities
                </h3>
                <div className="space-y-2">
                  {aiAnalysis.suspiciousActivities.map((activity, idx) => (
                    <div key={idx} className="text-red-300 text-sm">
                      <div className="font-medium">{activity.type}</div>
                      <div className="text-red-200/80">{activity.description}</div>
                      <div className="text-red-400/60 text-xs mt-1">
                        Confidence: {Math.round(activity.confidence * 100)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Workflow Triggers */}
            {aiAnalysis.workflowTriggers.length > 0 && (
              <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4">
                <h3 className="text-yellow-400 font-medium mb-2">Workflow Triggers:</h3>
                <div className="flex flex-wrap gap-2">
                  {aiAnalysis.workflowTriggers.map((trigger, idx) => (
                    <span key={idx} className="px-2 py-1 bg-yellow-600/30 text-yellow-300 rounded text-sm">
                      {trigger}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <Brain className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">
              {!apiKey 
                ? 'Enter OpenAI API key to enable AI analysis'
                : !videoFile
                ? 'Upload a video to start'
                : !isPlaying
                ? 'Press play to begin AI analysis'
                : 'Waiting for AI analysis...'}
            </p>
            {apiKey && videoFile && isPlaying && (
              <p className="text-gray-500 text-xs mt-2">
                AI analyzes every {config.rateLimits.cooldownPeriod / 1000} seconds
              </p>
            )}
          </div>
        )}

        {/* Analysis History */}
        {aiAnalysisHistory.length > 1 && (
          <div className="mt-4 bg-gray-800 rounded-lg p-4">
            <h3 className="text-gray-400 font-medium mb-2 text-sm">Recent Analysis History:</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {aiAnalysisHistory.slice(-5).reverse().map((analysis, idx) => (
                <div key={idx} className="text-gray-500 text-xs border-l-2 border-gray-700 pl-2">
                  {analysis.description}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};