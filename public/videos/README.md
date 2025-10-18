# Video Library - Demo Videos

This directory contains preset demo videos for the Video Library feature.

## Directory Structure

```
public/videos/
├── README.md (this file)
├── robbery-demo.mp4
├── shoplifting-demo.mp4
├── fight-demo.mp4
└── package-theft-demo.mp4
```

## How to Add Your Demo Videos

### 1. Add Video Files
Place your `.mp4` video files in this directory (`public/videos/`):
- Example: `robbery-demo.mp4`
- Videos can be any length, but shorter demos (30-60 seconds) work best

### 2. Update the Video Library Configuration

Edit the file: `src/components/VideoLibraryModal.tsx`

Find the `DEMO_VIDEOS` array (around line 108) and update it with your video information:

```typescript
const DEMO_VIDEOS: LibraryVideo[] = [
  {
    id: 'demo-1',
    name: 'Robbery Demo',              // Display name
    videoPath: '/videos/robbery-demo.mp4',  // Path to video file
  },
  {
    id: 'demo-2',
    name: 'Shoplifting Demo',
    videoPath: '/videos/shoplifting-demo.mp4',
  },
  // Add more videos here...
];
```

### ✨ Automatic Thumbnail Generation

**No need to create thumbnails manually!** The Video Library automatically extracts thumbnails from your video files:
- Thumbnails are generated from the video at 1 second (or 10% of duration)
- Shows a loading animation while generating
- Falls back to a video icon if the video can't be loaded

## Current Demo Videos

The Video Library is pre-configured with these example videos:
- Robbery Demo
- Shoplifting Demo
- Fight Detection Demo
- Package Theft Demo

Replace these with your actual demo videos by following the steps above.
