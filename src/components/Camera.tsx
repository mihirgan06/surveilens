import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera as CameraIcon, CameraOff, AlertTriangle } from 'lucide-react';
import { detectObjects, analyzeSuspiciousActivity, detectShoplifting } from '../utils/detection';
import { Detection, SuspiciousActivity, Alert } from '../types/detection';

interface CameraProps {
  onAlert: (alert: Alert) => void;
}

export const Camera: React.FC<CameraProps> = ({ onAlert }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [detectionHistory, setDetectionHistory] = useState<Detection[][]>([]);
  const [suspiciousActivities, setSuspiciousActivities] = useState<SuspiciousActivity[]>([]);
  const [error, setError] = useState<string>('');
  const streamRef = useRef<MediaStream | null>(null);
  const animationIdRef = useRef<number>();

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 640, 
          height: 480 
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
        setError('');
      }
    } catch (err) {
      setError('Failed to access camera. Please ensure camera permissions are granted.');
      console.error('Error accessing camera:', err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }
    setIsStreaming(false);
    setDetections([]);
    setSuspiciousActivities([]);
  };

  const detectFrame = useCallback(async () => {
    if (videoRef.current && isStreaming && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (ctx && video.readyState === 4) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        try {
          // Detect objects
          const newDetections = await detectObjects(video);
          setDetections(newDetections);
          
          // Update detection history
          setDetectionHistory(prev => {
            const updated = [...prev, newDetections];
            return updated.slice(-30); // Keep last 30 frames
          });
          
          // Draw bounding boxes
          newDetections.forEach(detection => {
            const [x, y, width, height] = detection.bbox;
            
            // Draw box
            ctx.strokeStyle = detection.score > 0.7 ? '#10b981' : '#f59e0b';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);
            
            // Draw label
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
          
          // Analyze for suspicious activities
          if (detectionHistory.length > 0) {
            const activities = analyzeSuspiciousActivity(
              newDetections,
              detectionHistory[detectionHistory.length - 1]
            );
            
            // Check for shoplifting
            const shopliftingAlert = detectShoplifting(newDetections, detectionHistory);
            if (shopliftingAlert) {
              activities.push(shopliftingAlert);
            }
            
            if (activities.length > 0) {
              setSuspiciousActivities(activities);
              
              // Generate alerts for high-confidence suspicious activities
              activities.filter(a => a.confidence > 0.7).forEach(activity => {
                onAlert({
                  id: `alert-${Date.now()}-${Math.random()}`,
                  type: activity.confidence > 0.8 ? 'danger' : 'warning',
                  message: activity.description,
                  timestamp: activity.timestamp,
                  detections: newDetections
                });
              });
            }
          }
        } catch (err) {
          console.error('Detection error:', err);
        }
      }
      
      // Continue detection loop
      animationIdRef.current = requestAnimationFrame(detectFrame);
    }
  }, [isStreaming, detectionHistory, onAlert]);

  useEffect(() => {
    if (isStreaming) {
      detectFrame();
    }
    
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isStreaming, detectFrame]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="bg-gray-900 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <CameraIcon className="w-6 h-6" />
          Live Camera Feed
        </h2>
        <button
          onClick={isStreaming ? stopCamera : startCamera}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isStreaming 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isStreaming ? (
            <>
              <CameraOff className="w-5 h-5 inline mr-2" />
              Stop Camera
            </>
          ) : (
            <>
              <CameraIcon className="w-5 h-5 inline mr-2" />
              Start Camera
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-400 p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <div className="relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full rounded-lg ${!isStreaming ? 'hidden' : ''}`}
        />
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ display: isStreaming ? 'block' : 'none' }}
        />
        
        {!isStreaming && !error && (
          <div className="bg-gray-800 rounded-lg h-96 flex items-center justify-center">
            <div className="text-center">
              <CameraOff className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Camera is not active</p>
              <p className="text-gray-500 text-sm mt-2">Click "Start Camera" to begin surveillance</p>
            </div>
          </div>
        )}
      </div>

      {isStreaming && (
        <div className="mt-4 space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Detected Objects</h3>
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
              <p className="text-gray-500 text-sm">No objects detected</p>
            )}
          </div>

          {suspiciousActivities.length > 0 && (
            <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4">
              <h3 className="text-yellow-400 font-medium mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Suspicious Activities Detected
              </h3>
              <div className="space-y-2">
                {suspiciousActivities.map((activity, idx) => (
                  <div key={idx} className="text-yellow-300 text-sm">
                    <span className="font-medium">{activity.type}:</span> {activity.description}
                    <span className="text-yellow-400/70 ml-2">
                      (Confidence: {Math.round(activity.confidence * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
