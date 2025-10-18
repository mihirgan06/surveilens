# Quick Start Guide

## Test the AI Surveillance System

### 1. Start the Application
```bash
cd surveillance-ai
npm run dev
```

### 2. Open in Browser
Navigate to: http://localhost:5173

### 3. Test Video Upload with AI Analysis

1. Click on the **"Upload Video"** tab
2. You'll see a yellow box asking for your OpenAI API key
3. Enter your OpenAI API key (starts with `sk-`)
4. Click **"Upload Video"** and select any surveillance footage
5. Click the **Play button** to start analysis

### What You'll See:

**Left Panel - Video Player:**
- The video will play with bounding boxes around detected objects
- Real-time object labels (person, bag, etc.) with confidence scores

**Right Panel - AI Scene Analysis:**
- **What's Happening**: Real-time description of the scene
- **Activities Detected**: List of activities the AI observes
- **Scene Details**: People count and objects present
- **Suspicious Activities**: Any concerning behaviors detected
- **Workflow Triggers**: Keywords that would trigger automated actions

The AI analyzes the video every 5 seconds and provides intelligent context about what's happening, such as:
- "Two people walking through a parking lot"
- "Person appears to be concealing items in their bag"
- "Multiple individuals engaged in physical altercation"
- "Person has fallen and appears to need medical assistance"

### Test Scenarios

The AI can detect:
- **Fighting**: Upload footage with physical altercations
- **Shoplifting**: Upload retail surveillance with theft
- **Crowding**: Upload footage with large gatherings
- **Medical emergencies**: Upload footage with someone falling
- **Suspicious behavior**: Any unusual activity patterns

### Workflow Automation (Future Integration)

The system is designed to trigger automated workflows when specific events are detected:
- Email security when fighting is detected
- Alert store management for shoplifting
- Call emergency services for medical emergencies
- Send notifications for any custom triggers you configure

### API Key Note

The OpenAI API key is only stored in your browser's session. For production use, this should be handled securely on a backend server.

### Cost Considerations

- Each frame analysis costs approximately $0.001-0.002 with GPT-4o-mini
- The system analyzes every 5 seconds by default (configurable)
- For a 1-minute video: ~12 API calls ≈ $0.012-0.024
