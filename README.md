# SurveiLens - AI Surveillance System

An enterprise-grade AI-powered surveillance system that combines real-time object detection with OpenAI GPT-4 Vision for intelligent scene understanding, automated threat detection, and workflow automation.

## Features

### 🎥 CCTV Dashboard
- **Multi-Camera View**: Monitor multiple camera feeds from a centralized dashboard
- **Video Library**: Pre-loaded demo videos with automatic thumbnail generation
- **Per-Camera Workflows**: Each camera feed saves its own automation workflows
- **Click-to-Analyze**: Select any camera feed to view detailed AI analysis

### 🤖 Dual AI Detection System
- **Layer 1 - Local Object Detection**:
  - Fast, real-time bounding boxes using TensorFlow.js COCO-SSD
  - 80+ object classes detected every frame
  - Zero API calls - runs entirely in browser

- **Layer 2 - OpenAI Scene Understanding**:
  - GPT-4 Vision analyzes scene context every 3 seconds
  - Detects complex behaviors and threats
  - Structured JSON output with confidence scores

### 🚨 Intelligent Threat Detection
- Fighting and violence detection
- Robbery and theft behaviors
- Weapon detection (guns, knives)
- Medical emergencies (person fallen)
- Vandalism and property damage
- Suspicious loitering
- Custom event detection with natural language

### ⚡ Visual Workflow Builder
- **Drag-and-Drop Interface**: Build automation workflows with no code
- **Trigger Blocks**: Person detected, fight detected, robbery, custom events
- **Condition Blocks**: Time of day, location zones
- **Action Blocks**:
  - Send Gmail alerts
  - Send Slack messages
  - Send SMS via Twilio
  - Make VAPI phone calls
  - Trigger webhooks
  - Log to database
  - Save screenshots
- **Workflow Persistence**: Each camera automatically saves its workflow configuration

### 📹 Video Sources
- **Live Camera Feed**: Real-time webcam monitoring
- **Video Upload**: Analyze pre-recorded surveillance footage
- **Video Library**: Demo videos with automatic thumbnail generation

## Tech Stack

- **Frontend**: React 19 with TypeScript, React Router for navigation
- **AI/ML**:
  - TensorFlow.js with COCO-SSD for local object detection
  - OpenAI GPT-4o-mini for scene understanding and context analysis
- **Workflow Canvas**: ReactFlow for visual workflow builder
- **Backend**: Express.js for OAuth and external integrations
- **Integrations**: Google APIs (Gmail), Slack SDK, Twilio
- **State Management**: React hooks with localStorage persistence
- **Styling**: Tailwind CSS with custom components
- **Build Tool**: Vite

## Getting Started

### Prerequisites

- Node.js 18+ installed
- OpenAI API key for AI scene analysis (get one at https://platform.openai.com)
- A webcam for live camera feed (optional)
- Modern browser with WebRTC support

### Installation

1. Clone and navigate to the project directory:
```bash
git clone <repository-url>
cd surveilens
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file in the root directory:
```bash
# Required - OpenAI API key for scene analysis
VITE_OPENAI_API_KEY=sk-your-api-key-here

# Optional - Backend integrations
VITE_BACKEND_URL=http://localhost:3001

# Gmail OAuth (optional)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Slack integration (optional)
SLACK_BOT_TOKEN=xoxb-your-token

# Twilio SMS (optional)
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890
```

4. Start the development servers:

**Frontend + Backend:**
```bash
npm run dev:all
```

**Or start separately:**
```bash
# Frontend (port 5173)
npm run dev

# Backend (port 3001) - for Gmail/Slack/SMS integrations
npm run backend
```

5. Open your browser and navigate to `http://localhost:5173`

## Usage

### CCTV Dashboard

1. **Home Page**: Opens to the CCTV Dashboard showing all camera feeds
2. **View Cameras**: See thumbnails of all available camera angles
3. **Click Camera**: Select any camera to view detailed AI analysis
4. **Navigation**: Use top nav bar to switch between Dashboard and Detection views

### Adding Demo Videos

1. Place .mp4 or .mov files in `public/videos/`
2. Update the camera list in `src/pages/VideoLibraryDashboard.tsx`:
```typescript
const CAMERA_FEEDS: LibraryVideo[] = [
  {
    id: 'camera-1',
    name: 'Camera 1 - Front Counter',
    videoPath: '/videos/your-video.mov',
    description: 'Front counter and register area',
  },
];
```
3. Thumbnails are automatically generated from the videos

### Building Workflows

1. **Select a Camera** from the CCTV Dashboard
2. **Scroll to Workflow Builder** at the bottom of the page
3. **Add Trigger Block**: Click "Add Block" → Select a trigger (e.g., "Fight Detected")
4. **Add Condition** (optional): Add time/location conditions
5. **Add Action Block**: Select action (e.g., "Send Gmail")
6. **Configure Action**: Click ⚙️ on the action block to configure
7. **Connect Blocks**: Drag from right handle to left handle to connect
8. **Auto-Save**: Workflow automatically saves for this camera

### Workflow Persistence

- Each camera feed saves its own workflow automatically
- Workflows are stored in browser localStorage
- Switch between cameras - each remembers its workflow
- Works for uploaded videos and live camera too

### Live Camera Feed

1. Navigate to Detection page
2. Click "Camera" button
3. Grant camera permissions
4. AI analysis starts automatically
5. Build workflows specific to your live camera

## Architecture

### Detection Pipeline

```
Video Frame (requestAnimationFrame loop)
    ↓
COCO-SSD Detection → DetectedObject[] → Bounding boxes drawn
    ↓ (every 3 seconds)
GPT-4 Vision Analysis → SceneContext
    ↓
generateEvents() → DetectionEvent[]
    ↓
checkWorkflowTriggers() → Execute matching workflows
```

### Workflow Execution

- Uses BFS (Breadth-First Search) to group nodes into execution levels
- Nodes at the same level execute in **parallel** (Promise.allSettled)
- Visual feedback shows all executing nodes simultaneously
- 30-second cooldown per trigger to prevent spam

### Storage & Persistence

- **Workflows**: Browser localStorage (per camera/video)
- **OAuth Tokens**: Backend in-memory Map (lost on restart)
- **Video Cache**: Blob URLs cached during session

## Project Structure

```
surveilens/
├── src/
│   ├── components/
│   │   ├── TopNavigation.tsx      # Navigation bar
│   │   ├── WorkflowBuilder.tsx    # Visual workflow editor
│   │   └── ui/                    # Reusable UI components
│   ├── pages/
│   │   └── VideoLibraryDashboard.tsx  # CCTV Dashboard
│   ├── services/
│   │   ├── detectionEngine.ts     # AI detection logic
│   │   └── workflowEngine.ts      # Workflow execution
│   ├── types/
│   │   ├── detectionTypes.ts      # Detection type definitions
│   │   └── workflowTypes.ts       # Workflow type definitions
│   ├── App.tsx                    # Main detection page
│   └── main.tsx                   # Router setup
├── server/
│   └── index.js                   # Express backend
├── public/
│   └── videos/                    # Demo video storage
└── CLAUDE.md                      # AI assistant guidelines
```

## Integration Setup

### Gmail OAuth

1. Create project at [Google Cloud Console](https://console.cloud.google.com)
2. Enable Gmail API
3. Create OAuth 2.0 credentials
4. Add to `.env.local`
5. Configure redirect URI: `http://localhost:3001/oauth/google/callback`

### Slack Integration

1. Create app at [Slack API](https://api.slack.com/apps)
2. Add Bot Token Scopes: `chat:write`, `channels:read`
3. Install app to workspace
4. Copy Bot Token to `.env.local`

### Twilio SMS

1. Sign up at [Twilio](https://www.twilio.com)
2. Get phone number
3. Copy Account SID, Auth Token to `.env.local`

## Performance Notes

- **Object Detection**: Runs entirely in browser, ~30 FPS on modern hardware
- **AI Analysis**: Rate-limited to every 3 seconds to manage API costs
- **Workflow Execution**: Parallel execution for optimal performance
- **Best Performance**: Modern browser with dedicated GPU

## Browser Support

- Chrome/Edge 90+ (recommended)
- Firefox 88+
- Safari 14+
- Requires WebRTC for live camera

## License

MIT