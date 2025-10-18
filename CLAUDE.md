# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An AI-powered surveillance system that combines real-time object detection with OpenAI GPT-4 Vision for intelligent scene understanding and automated threat detection. Features a visual workflow builder for creating automated responses (email, SMS, Slack) to detected events.

## Development Commands

### Frontend
```bash
npm run dev              # Start Vite dev server (port 5173)
npm run build            # TypeScript compilation + Vite build
npm run lint             # Run ESLint
npm run preview          # Preview production build
```

### Backend
```bash
npm run backend          # Start Express backend (port 3001)
npm run oauth            # Run OAuth server (server.cjs)
npm run dev:all          # Run frontend + backend concurrently
```

## Architecture

### Two-Layer AI Detection System

The system uses a **dual-layer detection architecture** that separates fast local detection from deep AI analysis:

**Layer 1: Fast Local Detection** (`detectionEngine.ts`)
- Runs every frame using TensorFlow.js COCO-SSD
- Detects 80+ object classes (people, bags, vehicles, etc.)
- Provides bounding boxes rendered on overlay canvas
- Zero API calls - entirely browser-based

**Layer 2: AI Scene Understanding** (`detectionEngine.ts`)
- Runs periodically (3-second intervals) using GPT-4 Vision
- Analyzes scene context and suspicious behaviors
- Detects: robbery, fighting, shoplifting, weapons, medical emergencies, vandalism, loitering
- Generates `DetectionEvent[]` that trigger workflows
- Uses structured JSON output with confidence scores

### Event Generation Flow

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

### Workflow System Architecture

The workflow system (`workflowEngine.ts`) enables visual automation:

**Execution Model:**
- Uses BFS (Breadth-First Search) to group nodes into levels
- Nodes at the same level execute **in parallel** (Promise.allSettled)
- Visual feedback shows all executing nodes simultaneously
- 30-second cooldown per trigger to prevent spam

**Trigger Matching:**
- Direct match: `eventType === triggerType` (case-insensitive)
- Alias matching: "person_detected" matches "PERSON_ENTERED", "fight_detected" matches "VIOLENCE"
- Custom triggers: Uses LLM semantic matching (GPT-4o-mini evaluates if event matches user's custom condition)

**Node Types:**
- **Trigger**: person_detected, fight_detected, robbery_detected, custom_event, etc.
- **Condition**: time_condition (time range + days of week), location_condition (zones/GPS)
- **Action**: gmail, slack, sms, webhook, vapi_call, database_log, save_screenshot

### Backend (`server/index.js`)

Express server handling external integrations:
- **Gmail**: OAuth2 flow + sending via Google APIs
- **Slack**: Bot token authentication + channel messaging
- **Twilio**: SMS sending
- **Token storage**: In-memory Map (nodeId → tokens) - **lost on restart**

### Key Components

**`App.tsx`** (Main orchestrator)
- Manages video playback (file upload or live camera via WebRTC)
- Runs detection loop via `requestAnimationFrame`
- Checks workflow triggers on each AI analysis
- Subscribes to workflow execution updates for visual feedback

**`WorkflowBuilder.tsx`** (ReactFlow canvas)
- Drag-and-drop workflow editor
- Block categories: Triggers, Conditions, Actions
- Configuration panels for each block type
- OAuth flows for Gmail/Slack integrated into UI

**`detectionEngine.ts`** (Singleton)
- `initialize()`: Loads COCO-SSD model
- `detectObjects(videoElement)`: Frame-by-frame detection
- `analyzeScene(base64Image)`: GPT-4 Vision analysis with rate limiting
- `generateEvents(sceneContext)`: Converts AI analysis to DetectionEvent[]
- `getRecentEvents(seconds)`: Returns events for workflow matching

**`workflowEngine.ts`** (Singleton)
- `checkTrigger(node, events, sceneContext)`: Matches triggers against events
- `executeWorkflow(nodes, edges, triggerNodeId, event)`: BFS-based parallel execution
- `evaluateCondition(node)`: Time/location condition logic
- `replaceVariables(template, event)`: Variable substitution for messages

## Type System

**Core Detection Types** (`src/types/detectionTypes.ts`)
- `DetectedObject`: COCO-SSD result (class, confidence, bbox, timestamp)
- `DetectionEvent`: High-level event from AI (type, confidence, description, objects, metadata)
- `SceneContext`: GPT-4 Vision output (description, peopleCount, activities, suspiciousActivities[], detectedEvents[])

**Workflow Types** (`src/types/workflowTypes.ts`)
- `WorkflowNode`: Workflow block (id, type, subtype, label, config, position)
- `TriggerType`: Enum of trigger types
- `ActionType`: Enum of action types
- `WorkflowExecution`: Runtime execution state (workflowId, activeNodes[], status)

## Environment Variables

Required in `.env.local`:

```bash
# OpenAI (required for AI scene analysis)
VITE_OPENAI_API_KEY=sk-...

# Backend URL (optional, defaults to http://localhost:3001)
VITE_BACKEND_URL=http://localhost:3001

# Gmail integration
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Slack integration
SLACK_BOT_TOKEN=xoxb-...

# Twilio SMS
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
```

## Detection Loop Implementation

The detection loop (`App.tsx`) runs via `requestAnimationFrame`:

1. `detectObjects()` on current video frame
2. `drawBoundingBoxes()` on overlay canvas
3. `captureFrame()` → base64 image
4. `analyzeScene()` if 3+ seconds elapsed (rate limited)
5. `getRecentEvents(30)` from detection engine
6. `checkWorkflowTriggers()` if workflows configured
7. Schedule next frame via `requestAnimationFrame`

**Important**: Detection loop starts when `isPlaying && isInitialized` both true.

## Common Development Patterns

### Adding a New Action Block

1. Add to `ActionType` enum in `src/types/workflowTypes.ts`
2. Implement handler in `workflowEngine.ts` `executeNode()` switch statement
3. Add block definition to `WorkflowBuilder.tsx` `availableBlocks` array
4. If requires backend, add endpoint to `server/index.js`

### Adding a New Trigger Type

1. Add to `TriggerType` enum in `src/types/workflowTypes.ts`
2. Add trigger block to `WorkflowBuilder.tsx` `availableBlocks` array
3. Update `checkTrigger()` in `workflowEngine.ts` for alias matching
4. Ensure GPT-4 Vision prompt in `detectionEngine.ts` can generate that event type

### Modifying AI Detection Behavior

Edit the GPT-4 Vision system prompt in `detectionEngine.ts` → `analyzeScene()` method (lines 81-120). The prompt controls:
- Which activities to detect
- Confidence thresholds
- Event naming conventions
- JSON response structure

**Note**: Event types from `detectedEvents[]` must match trigger types or aliases in `workflowEngine.ts`.

### Debugging Workflows

Browser console functions (exposed in `App.tsx`):
```javascript
clearTriggeredEvents()  // Clear trigger cache
clearCooldown()         // Alias for above
```

Use these when testing workflows repeatedly without waiting 30 seconds.

## Important Implementation Details

### Trigger Cooldown System

Prevents the same trigger from firing multiple times:
- 30-second cooldown per trigger node (tracked by node ID)
- Stored in `triggerCooldownRef` Map in `App.tsx`
- Can be cleared via `clearCooldown()` in console

### Parallel Workflow Execution

Workflows execute in levels (BFS traversal):
- `getNodesByLevel()` groups nodes by graph distance from trigger
- All nodes at same level execute simultaneously via `Promise.allSettled()`
- 300ms delay before execution + 700ms delay after for visual clarity
- Failed conditions halt entire workflow

### Variable Substitution

Messages support template variables (`workflowEngine.ts` `replaceVariables()`):
- `{{event_type}}`: Event type (e.g., "ROBBERY_DETECTED")
- `{{event_description}}`: AI-generated description
- `{{timestamp}}`: Formatted date/time
- `{{confidence}}`: Confidence percentage

### OAuth Token Storage

Backend stores tokens in-memory:
- Map of `nodeId → OAuth tokens`
- **Tokens lost on server restart**
- Each Gmail/Slack block gets unique nodeId for separate auth

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **UI**: Custom components using class-variance-authority + Lucide icons
- **Workflow Canvas**: ReactFlow
- **AI/ML**: TensorFlow.js (COCO-SSD), OpenAI GPT-4 Vision (gpt-4o-mini)
- **Backend**: Express, Google APIs, Twilio, Slack SDK
- **State**: React hooks (no external state library)
