# 📞 VAPI Call Block - Complete Guide

## ✅ Status: FULLY WORKING

The VAPI Call Block is now fully integrated and working in your surveillance workflow system!

## 🎯 How to Use the VAPI Call Block

### Step 1: Add VAPI Call Block to Workflow
1. Open the workflow builder at http://localhost:5174
2. Click "Add Block" and select "VAPI Call"
3. The block will appear in your workflow

### Step 2: Configure the Block
1. **Click the settings icon (⚙️)** on the VAPI Call block
2. A configuration modal will appear with:
   - **Phone Number**: Enter the number to call (with country code)
     - Format: `+19255772134` (US numbers need +1)
     - The system will auto-add +1 if you enter just 10 digits
   - **Message**: What the voice agent should say
     - Example: "Alert! Person detected in restricted area"
     - You can use variables: `{eventType}`, `{timestamp}`, `{objectCount}`
   - **Voice**: Select from 14 available voices
     - Default: Rachel
     - Others: Bella, Domi, Elli, Josh, etc.
3. **Click Save** to save the configuration

### Step 3: Connect to a Trigger
1. Connect the VAPI Call block to a trigger (e.g., "Person Detected")
2. Draw a connection line from the trigger to the VAPI block

### Step 4: Test Your Workflow
1. When the trigger fires (e.g., person is detected)
2. The VAPI Call block will:
   - Make a call to the configured phone number
   - The voice agent will speak your message
   - The call will NOT hang up immediately (fixed!)

## 🔧 Technical Details

### Backend Endpoint
- URL: `http://localhost:3001/vapi/call`
- Method: POST
- Payload:
  ```json
  {
    "phoneNumber": "+19255772134",
    "message": "Your custom message here",
    "voiceId": "rachel"
  }
  ```

### Workflow Engine Integration
- Location: `src/services/workflowEngine.ts`
- Method: `makeVAPICall(config, event)`
- Supports variable substitution in messages

### Configuration Storage
- Configs are saved in the node's data
- Path: `node.data.config`
- Persisted when you click Save in the modal

## 🚨 Important Notes

1. **Rate Limiting**: 60 seconds between calls to the same number
2. **Phone Format**: Must include country code (+1 for US)
3. **VAPI Account**: Using Riley assistant for stable calls
4. **Voice Options**: 14 ElevenLabs voices available

## 📊 Current Configuration

- **Assistant ID**: `11182291-6fa9-46d2-8127-5a8b4536e00e` (Riley)
- **Phone Number ID**: `13295ee7-d9c1-434a-b648-ce76e90cc885`
- **Default Voice**: Rachel
- **Provider**: 11labs (ElevenLabs)

## ✅ What's Working

- ✅ VAPI Call block appears in workflow
- ✅ Settings modal opens when clicking ⚙️
- ✅ Configuration is saved to the node
- ✅ Workflow engine executes VAPI calls
- ✅ Backend successfully initiates calls
- ✅ Calls connect and speak the message
- ✅ No more immediate hang-ups!
- ✅ Rate limiting prevents spam
- ✅ Variable substitution in messages

## 🎉 Ready to Use!

The VAPI Call Block is fully functional and ready for production use in your surveillance workflows!
