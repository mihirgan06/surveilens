import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Video, Play } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface LibraryVideo {
  id: string;
  name: string;
  videoPath: string;
  description?: string;
}

// Component to automatically generate thumbnail from video
function VideoThumbnail({ videoPath, alt }: { videoPath: string; alt: string }) {
  const [thumbnail, setThumbnail] = useState<string>('');
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const handleLoadedData = () => {
      // Seek to 1 second (or 10% of duration, whichever is smaller)
      const seekTime = Math.min(1, video.duration * 0.1);
      video.currentTime = seekTime;
    };

    const handleSeeked = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setThumbnail(dataUrl);
    };

    const handleError = () => {
      setError(true);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
    };
  }, [videoPath]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full text-slate-500">
        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <>
      {/* Hidden video element for thumbnail generation */}
      <video
        ref={videoRef}
        src={videoPath}
        className="hidden"
        muted
        playsInline
      />
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />
      {/* Display thumbnail or loading state */}
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={alt}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full text-slate-500">
          <div className="animate-pulse">
            <Video className="w-16 h-16" />
          </div>
        </div>
      )}
    </>
  );
}

// CCTV Camera Feeds - simulating multiple camera angles in a location
const CAMERA_FEEDS: LibraryVideo[] = [
  {
    id: 'camera-1',
    name: 'Camera 1 - Front Counter',
    videoPath: '/videos/no gun rob.mov',
    description: 'Front counter and register area',
  },
  {
    id: 'camera-2',
    name: 'Camera 2 - Main Floor',
    videoPath: '/videos/store rob.mov',
    description: 'Main store floor and aisles',
  },
  {
    id: 'camera-3',
    name: 'Camera 3 - Entrance',
    videoPath: '/videos/street robbery.mov',
    description: 'Entrance and exterior view',
  },
];

export function VideoLibraryDashboard() {
  const navigate = useNavigate();

  const handleVideoSelect = (videoPath: string) => {
    // Navigate to detection page with video path in state
    navigate('/detection', { state: { videoPath } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">CCTV Dashboard</h1>
          <p className="text-slate-400">Monitor multiple camera feeds with AI-powered threat detection</p>
        </div>

        {/* Camera Feed Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CAMERA_FEEDS.map((video) => (
            <Card
              key={video.id}
              className="group cursor-pointer overflow-hidden border-slate-700 hover:border-blue-500/50 transition-all duration-200 bg-slate-900/50 hover:bg-slate-900/70 hover:shadow-xl hover:shadow-blue-500/10"
              onClick={() => handleVideoSelect(video.videoPath)}
            >
              <CardContent className="p-0">
                {/* Thumbnail Container */}
                <div className="relative aspect-video w-full bg-slate-800 overflow-hidden">
                  <VideoThumbnail videoPath={video.videoPath} alt={video.name} />

                  {/* Play Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/40">
                    <div className="w-20 h-20 rounded-full bg-blue-500/90 flex items-center justify-center transform group-hover:scale-110 transition-transform duration-200">
                      <Play className="w-10 h-10 text-white ml-1" fill="currentColor" />
                    </div>
                  </div>
                </div>

                {/* Video Info */}
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-white mb-1">{video.name}</h3>
                  {video.description && (
                    <p className="text-sm text-slate-400">{video.description}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
