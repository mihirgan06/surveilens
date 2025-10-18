# 🚀 SurveiLens Local Setup Guide

## ✅ Current Status
- ✅ Dependencies installed
- ✅ Development server running on http://localhost:5173
- ✅ OAuth server running on http://localhost:3001
- ✅ Environment file created (.env.local)

## 🔑 Required API Keys

### 1. OpenAI API Key (Required for AI Analysis)
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Edit `.env.local` and replace `your_openai_api_key_here` with your actual key:
   ```
   VITE_OPENAI_API_KEY=sk-your-actual-key-here
   ```

### 2. Google OAuth (Optional - for Gmail integration)
1. Go to https://console.developers.google.com/
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Add credentials to `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

## 🎯 How to Use

### 1. Open the Application
- Navigate to: http://localhost:5173
- You should see the SurveiLens dashboard

### 2. Test Video Upload Analysis
1. Click "Upload Video" button
2. Select any surveillance footage or test video
3. Click play to start analysis
4. Watch the AI analyze the scene in real-time

### 3. Test Live Camera (if available)
1. Click "Camera" button
2. Allow camera permissions
3. Watch real-time object detection

### 4. Create Workflows
1. Use the drag-and-drop workflow builder at the bottom
2. Add trigger nodes (e.g., "Person Detected", "Fighting")
3. Connect to action nodes (e.g., Gmail alerts)
4. Test the automation

## 🔧 Troubleshooting

### If AI Analysis Doesn't Work:
- Check that your OpenAI API key is correctly set in `.env.local`
- Restart the dev server: `npm run dev`

### If Gmail Integration Doesn't Work:
- Ensure Google OAuth credentials are set
- Make sure OAuth server is running: `npm run oauth`

### If Camera Doesn't Work:
- Check browser permissions
- Try a different browser
- Use video upload instead

## 📊 What You'll See

**Left Panel**: Video feed with bounding boxes around detected objects
**Middle Panel**: Real-time object detection results
**Right Panel**: AI scene analysis with intelligent descriptions
**Bottom Panel**: Workflow builder for automation

## 🎬 Test Scenarios

Try uploading videos with:
- People walking around
- Multiple people in frame
- Suspicious activities
- Crowded scenes
- Empty scenes

The AI will provide intelligent analysis of what's happening!

## 🚀 Next Steps

1. Add your OpenAI API key to `.env.local`
2. Open http://localhost:5173
3. Upload a test video
4. Watch the AI analyze the scene
5. Create custom workflows
6. Test the automation features

Enjoy exploring your AI surveillance system! 🎉
