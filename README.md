# AI Surveillance System

A real-time AI-powered surveillance system that combines local object detection with OpenAI GPT-4 Vision for intelligent scene understanding and automated threat detection.

## Features

- **Live Camera Feed**: Real-time object detection from webcam
- **Video Upload Analysis**: Process pre-recorded surveillance footage with AI scene understanding
- **Dual AI Analysis**:
  - **Local Object Detection**: Fast, real-time bounding boxes using TensorFlow.js COCO-SSD
  - **OpenAI Scene Understanding**: GPT-4 Vision analyzes what's actually happening in the scene
- **Intelligent Activity Recognition**:
  - Fighting and violence detection
  - Shoplifting and theft behaviors
  - Weapon detection
  - Fire and smoke alerts
  - Medical emergencies (person fallen)
  - Vandalism and property damage
  - Unusual crowding or gatherings
- **Workflow Automation**: Automatically trigger actions based on detected events (email alerts, etc.)
- **Real-time Scene Description**: Live narration of what's happening in the video
- **Context-Aware Analysis**: AI understands scene progression over time
- **Modern UI**: Clean, responsive interface with real-time updates

## Tech Stack

- **Frontend**: React 19 with TypeScript
- **AI/ML**: 
  - TensorFlow.js with COCO-SSD for local object detection
  - OpenAI GPT-4 Vision for scene understanding and context analysis
- **Styling**: Tailwind CSS
- **Build Tool**: Vite

## Getting Started

### Prerequisites

- Node.js 18+ installed
- OpenAI API key for AI scene analysis (get one at https://platform.openai.com)
- A webcam for live camera feed (optional)
- Modern browser with WebRTC support

### Installation

1. Navigate to the project directory:
```bash
cd surveillance-ai
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

## Usage

### Setting up OpenAI API Key

1. When you first load the app, you'll see a prompt to enter your OpenAI API key
2. Enter your API key in the input field (it will be stored locally in your browser)
3. The AI analysis will automatically start once a valid key is provided

### Live Camera Surveillance

1. Click "Start Camera" to begin live monitoring
2. The system will automatically detect objects and analyze for suspicious activities
3. Alerts will appear in the right panel when threats are detected

### Video Upload Analysis

1. Switch to the "Upload Video" tab
2. Enter your OpenAI API key if not already done
3. Click "Upload Video" and select a surveillance video file
4. Click play to begin analysis
5. Watch the right panel for real-time AI scene descriptions
6. The AI will describe what's happening in the video as it plays
7. Suspicious activities will trigger alerts automatically

## Detection Capabilities

### Objects Detected
- People
- Bags/Backpacks
- Vehicles
- Animals
- Various everyday objects (80+ classes from COCO dataset)

### AI-Detected Activities (via OpenAI GPT-4 Vision)
- **Fighting/Violence**: Physical altercations and aggressive behavior
- **Shoplifting**: Concealment of merchandise, suspicious behavior near products
- **Weapons**: Detection of guns, knives, or other dangerous objects
- **Fire/Smoke**: Early detection of fire hazards
- **Medical Emergencies**: Person fallen, unconscious individuals
- **Vandalism**: Property damage, graffiti
- **Crowding**: Unusual gatherings or mob formation
- **Custom Triggers**: Configure your own workflow triggers for specific scenarios

## Security Alerts

The system generates three types of alerts:
- **Info** (Blue): Low-priority informational alerts
- **Warning** (Yellow): Medium-priority suspicious activities
- **Danger** (Red): High-priority security threats requiring immediate attention

## Performance Notes

- The object detection model runs entirely in the browser using TensorFlow.js
- Processing speed depends on your device's capabilities
- For best performance, use a modern browser and dedicated GPU

## Future Improvements

- Add facial recognition for known individuals
- Implement zone-based monitoring (restricted areas)
- Add network storage for alert history
- Integrate with security systems and IoT devices
- Support for multiple camera feeds
- Advanced ML models for better shoplifting detection

## License

MIT