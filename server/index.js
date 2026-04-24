import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import twilio from 'twilio';
import dotenv from 'dotenv';
import { VapiClient } from '@vapi-ai/server-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });


const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Aggressive request logger so we can see EVERY inbound request in real time.
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`➡️  [${ts}] ${req.method} ${req.url}`);
  next();
});

// OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3001/auth/google/callback'
);

// Twilio Client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Persist OAuth tokens to disk so they survive backend restarts.
// Stored next to the server file in a gitignored JSON file.
const TOKEN_STORE_PATH = path.join(__dirname, '.oauth-tokens.json');
function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_STORE_PATH)) {
      const raw = fs.readFileSync(TOKEN_STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      console.log('🔓 Loaded persisted OAuth tokens for', Object.keys(parsed).length, 'node(s)');
      return parsed;
    }
  } catch (err) {
    console.error('⚠️  Failed to load persisted tokens:', err.message);
  }
  return {};
}
function saveTokens() {
  try {
    fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(userTokens, null, 2), 'utf-8');
  } catch (err) {
    console.error('⚠️  Failed to persist tokens:', err.message);
  }
}
const userTokens = loadTokens();

// Rate limiting for VAPI calls to prevent spam
const vapiCallHistory = new Map(); // phoneNumber -> lastCallTimestamp
const VAPI_CALL_COOLDOWN_MS = 60000; // 60 seconds between calls to same number

// Debug: Log loaded credentials
console.log('🔑 Google Client ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Loaded' : '❌ Missing');
console.log('🔐 Google Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Loaded' : '❌ Missing');
console.log('💬 Slack Bot Token:', process.env.SLACK_BOT_TOKEN ? '✅ Loaded' : '❌ Missing');

// Generate auth URL
app.get('/auth/google', (req, res) => {
  const { nodeId } = req.query;
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    redirect_uri: 'http://localhost:3001/auth/google/callback',
    state: nodeId // Pass nodeId through state
  });
  
  res.json({ authUrl });
});

// OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code, state: nodeId } = req.query;
  
  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Store tokens for this node + persist to disk so they survive restarts
    userTokens[nodeId] = tokens;
    saveTokens();
    
    // Close window and notify parent
    res.send(`
      <html>
        <body>
          <h2>Authorization successful You can close this window.</h2>
          <script>
            window.opener.postMessage({ 
              type: 'GMAIL_AUTH_SUCCESS', 
              nodeId: '${nodeId}' 
            }, '*');
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.status(500).send('Authentication failed');
  }
});

// Send email
app.post('/gmail/send', async (req, res) => {
  const { nodeId, to, subject, body } = req.body;
  
  console.log('📧 Gmail send request received:');
  console.log('  NodeId:', nodeId);
  console.log('  To:', to);
  console.log('  Subject:', subject);
  console.log('  Available tokens for nodeIds:', Object.keys(userTokens));
  
  const tokens = userTokens[nodeId];
  if (!tokens) {
    console.error('❌ No tokens found for nodeId:', nodeId);
    return res.status(401).json({ error: 'Not authenticated. Please connect Gmail first.' });
  }
  
  console.log('✅ Tokens found for nodeId:', nodeId);
  
  try {
    oauth2Client.setCredentials(tokens);
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Create email
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      body
    ].join('\n');
    
    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail
      }
    });
    
    res.json({ success: true, message: 'Email sent successfully!' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

// Check auth status
app.get('/gmail/status/:nodeId', (req, res) => {
  const { nodeId } = req.params;
  const isAuthenticated = !!userTokens[nodeId];
  res.json({ authenticated: isAuthenticated });
});

// Send SMS via Twilio
app.post('/sms/send', async (req, res) => {
  const { to, body } = req.body;
  
  console.log('📱 SMS send request received:');
  console.log('  To:', to);
  console.log('  Body:', body);
  
  if (!to || !body) {
    console.error('❌ Missing required fields: to and body');
    return res.status(400).json({ error: 'Missing required fields: to and body' });
  }
  
  try {
    const message = await twilioClient.messages.create({
      body: body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });
    
    console.log('✅ SMS sent successfully! Message SID:', message.sid);
    res.json({ 
      success: true, 
      message: 'SMS sent successfully!',
      messageSid: message.sid
    });
  } catch (error) {
    console.error('❌ Error sending SMS:', error);
    res.status(500).json({ 
      error: 'Failed to send SMS', 
      details: error.message 
    });
  }
});

// Slack Integration Endpoints
// Send Slack message
// Resolve a channel name like "#general" to its id ("C12345...") so we can
// call conversations.join on it. Slack's chat.postMessage accepts the name
// directly, but conversations.join requires the channel id.
async function slackResolveChannelId(channelName) {
  const cleaned = channelName.replace(/^#/, '');
  // Look at the bot's known conversations first.
  let cursor = '';
  for (let i = 0; i < 5; i++) {
    const url = new URL('https://slack.com/api/conversations.list');
    url.searchParams.set('types', 'public_channel,private_channel');
    url.searchParams.set('limit', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    });
    const data = await r.json();
    if (!data.ok) return null;
    const hit = (data.channels || []).find((c) => c.name === cleaned);
    if (hit) return hit.id;
    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  return null;
}

async function postSlackMessage(slackMessage) {
  const r = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(slackMessage),
  });
  return r.json();
}

app.post('/slack/send', async (req, res) => {
  const { nodeId, channel, message, blocks } = req.body;

  console.log('💬 Slack send request received:');
  console.log('  NodeId:', nodeId);
  console.log('  Channel:', channel);
  console.log('  Message:', message);

  if (!process.env.SLACK_BOT_TOKEN) {
    return res.status(401).json({ error: 'Slack bot token not configured' });
  }

  const targetChannel = channel || '#general';
  const slackMessage = {
    channel: targetChannel,
    text: message,
    ...(blocks && { blocks }),
  };

  try {
    let result = await postSlackMessage(slackMessage);

    // Auto-recover from "bot not in channel" by joining and retrying once.
    // chat.postMessage takes #name but conversations.join needs the id, so we
    // resolve the id from conversations.list (requires channels:read scope).
    if (!result.ok && result.error === 'not_in_channel') {
      console.log(`⚠️ Bot is not in ${targetChannel} — attempting auto-join…`);
      const channelId = await slackResolveChannelId(targetChannel);
      if (!channelId) {
        return res.status(400).json({
          error: `Bot is not in ${targetChannel} and the channel could not be located. Either invite the bot with /invite @YourBot in ${targetChannel}, or pick a channel the bot already has access to.`,
        });
      }
      const joinResp = await fetch('https://slack.com/api/conversations.join', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: channelId }),
      });
      const joinJson = await joinResp.json();
      if (!joinJson.ok) {
        console.error('❌ conversations.join failed:', joinJson.error);
        return res.status(400).json({
          error: `Bot could not auto-join ${targetChannel} (${joinJson.error}). Run /invite @YourBot in ${targetChannel} in Slack, then retry.`,
        });
      }
      console.log(`✅ Joined ${targetChannel} (${channelId}). Retrying postMessage…`);
      result = await postSlackMessage({ ...slackMessage, channel: channelId });
    }

    if (result.ok) {
      console.log(`✅ Slack message sent to ${targetChannel}: "${message}"`);
      return res.json({
        success: true,
        message: 'Slack message sent successfully!',
        ts: result.ts,
        channel: targetChannel,
      });
    }

    console.error('❌ Slack API error:', result.error);
    return res.status(400).json({ error: `Slack API error: ${result.error}` });
  } catch (error) {
    console.error('❌ Slack send error:', error);
    res.status(500).json({ error: 'Failed to send Slack message', details: error.message });
  }
});

// Get Slack channels list
app.get('/slack/channels', async (req, res) => {
  if (!process.env.SLACK_BOT_TOKEN) {
    return res.status(401).json({ error: 'Slack bot token not configured' });
  }
  
  try {
    const response = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel', {
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.ok) {
      const channels = result.channels.map(channel => ({
        id: channel.id,
        name: channel.name,
        is_private: channel.is_private
      }));
      res.json({ success: true, channels });
    } else {
      res.status(400).json({ error: `Slack API error: ${result.error}` });
    }
  } catch (error) {
    console.error('❌ Slack channels error:', error);
    res.status(500).json({ error: 'Failed to fetch Slack channels', details: error.message });
  }
});

// Check Slack connection status
app.get('/slack/status/:nodeId', (req, res) => {
  const { nodeId } = req.params;
  const isConfigured = !!process.env.SLACK_BOT_TOKEN;
  res.json({ 
    authenticated: isConfigured,
    configured: isConfigured,
    nodeId: nodeId
  });
});

// VAPI Voice Calling Endpoints
app.post('/vapi/call', async (req, res) => {
  const { phoneNumber, message, voiceId } = req.body;
  
  console.log('📞 VAPI call request received:');
  console.log('  Phone:', phoneNumber);
  console.log('  Message:', message);
  console.log('  Voice:', voiceId);
  console.log('  Using Phone Number ID:', process.env.VAPI_PHONE_NUMBER_ID);
  
  // Rate limiting check
  const now = Date.now();
  const lastCallTime = vapiCallHistory.get(phoneNumber) || 0;
  const timeSinceLastCall = now - lastCallTime;
  
  if (timeSinceLastCall < VAPI_CALL_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((VAPI_CALL_COOLDOWN_MS - timeSinceLastCall) / 1000);
    console.log(`⏳ Rate limit: Call to ${phoneNumber} blocked. Wait ${remainingSeconds}s`);
    return res.status(429).json({ 
      error: 'Rate limit exceeded', 
      message: `Please wait ${remainingSeconds} seconds before calling this number again`,
      remainingSeconds 
    });
  }
  
  if (!process.env.VAPI_PRIVATE_KEY) {
    return res.status(401).json({ error: 'VAPI private key not configured' });
  }

  if (!process.env.VAPI_PHONE_NUMBER_ID) {
    return res.status(401).json({ error: 'VAPI phone number ID not configured. Please add a phone number in VAPI dashboard.' });
  }
  
  try {
    // Initialize VAPI SDK client (like the working implementation)
    const vapi = new VapiClient({
      token: process.env.VAPI_PRIVATE_KEY,
    });

    console.log(`📞 Using VAPI SDK with inline assistant config...`);

    // Map UI voice ids to VAPI's currently-active built-in voices.
    // Active (post-2026 deprecation): Elliot, Rohan, Nico, Kai, Sagar, Godfrey,
    // Neil (M); Savannah, Emma, Clara (F). The legacy set (Paige, Hana, Lily,
    // Kylie, Cole, Harry, Spencer, Neha) was retired and rejects new assistants.
    const VOICE_MAP = {
      // Female
      rachel:    { provider: 'vapi', voiceId: 'Clara' },
      domi:      { provider: 'vapi', voiceId: 'Savannah' },
      bella:     { provider: 'vapi', voiceId: 'Emma' },
      elli:      { provider: 'vapi', voiceId: 'Emma' },
      charlotte: { provider: 'vapi', voiceId: 'Clara' },
      jessica:   { provider: 'vapi', voiceId: 'Emma' },
      // Male
      antoni:    { provider: 'vapi', voiceId: 'Elliot' },
      josh:      { provider: 'vapi', voiceId: 'Kai' },
      arnold:    { provider: 'vapi', voiceId: 'Neil' },
      adam:      { provider: 'vapi', voiceId: 'Kai' },
      sam:       { provider: 'vapi', voiceId: 'Nico' },
      clyde:     { provider: 'vapi', voiceId: 'Kai' },
      callum:    { provider: 'vapi', voiceId: 'Sagar' },
      patrick:   { provider: 'vapi', voiceId: 'Godfrey' },
    };
    const resolvedVoice = VOICE_MAP[voiceId] || { provider: 'vapi', voiceId: 'Clara' };
    console.log(`🔊 Voice resolution: ${voiceId} -> ${resolvedVoice.provider}/${resolvedVoice.voiceId}`);

    // Build an inline assistant so this works on any VAPI account (no hardcoded assistantId required)
    const call = await vapi.calls.create({
      type: 'outboundPhoneCall',
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: {
        number: phoneNumber,
      },
      // System prompt is derived from the caller's own script so the AI stays
      // in character after delivering the first line. The user's script is
      // treated as the source of truth — we do NOT inject any surveillance /
      // security framing unless their script says so.
      assistant: {
        name: 'SurveiLens Alert Bot',
        firstMessage: message,
        firstMessageMode: 'assistant-speaks-first',
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are an AI voice agent placing an outbound phone call. Your opening line (already delivered) was:\n\n' +
                `"${message}"\n\n` +
                'Stay fully in character with that opening line. Match its tone, persona, and subject matter. If the opening line introduces you as a specific person or role (e.g. a delivery driver, a receptionist, an alert bot), you ARE that person. Keep every reply to 1-2 short sentences. Be natural and conversational. If the user says goodbye, bye, or indicates they are done, politely end the call. Do not mention that you are an AI unless directly asked.',
            },
          ],
        },
        voice: resolvedVoice,
        // CRITICAL: without a transcriber the call connects, plays nothing, and
        // immediately hangs up because VAPI has no way to listen for replies.
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en',
        },
        // Resilience: don't sit on a dead line forever, end on natural goodbyes
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: 300,
        endCallPhrases: ['goodbye', 'bye', 'thanks bye', 'have a good day'],
        backgroundSound: 'off',
      },
    });
    
    // Update rate limit tracker
    vapiCallHistory.set(phoneNumber, Date.now());
    console.log('✅ VAPI call initiated successfully using SDK');
    console.log('📞 Call ID:', call.id);
    console.log('📊 Rate limit set for', phoneNumber, '- next call allowed in 60s');
    
    res.json({ 
      success: true, 
      message: 'Call initiated successfully!', 
      callId: call.id,
      call: call
    });
    
  } catch (error) {
    console.error('❌ VAPI call error:', error);
    console.error('  statusCode:', error.statusCode);
    console.error('  message:', error.message);
    console.error('  body:', JSON.stringify(error.body, null, 2));
    console.error('  rawResponse:', error.rawResponse);

    // Handle specific VAPI SDK errors
    if (error.statusCode === 400) {
      return res.status(400).json({
        error: 'Bad request - check phone number format or configuration',
        details: error.body || error.message
      });
    }

    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Unauthorized - check VAPI credentials'
      });
    }

    res.status(500).json({
      error: 'Failed to initiate call',
      details: error.body || error.message || String(error)
    });
  }
});

// Get available VAPI voices
app.get('/vapi/voices', async (req, res) => {
  try {
    // Comprehensive list of ElevenLabs voices that work with VAPI
    const elevenLabsVoices = [
      // Premium Female Voices
      { id: 'rachel', name: 'Rachel - Natural & Conversational (Female)', provider: 'elevenlabs', category: 'female' },
      { id: 'domi', name: 'Domi - Strong & Confident (Female)', provider: 'elevenlabs', category: 'female' },
      { id: 'bella', name: 'Bella - Soft & Gentle (Female)', provider: 'elevenlabs', category: 'female' },
      { id: 'elli', name: 'Elli - Young & Energetic (Female)', provider: 'elevenlabs', category: 'female' },
      { id: 'charlotte', name: 'Charlotte - Professional (Female)', provider: 'elevenlabs', category: 'female' },
      { id: 'jessica', name: 'Jessica - Warm & Friendly (Female)', provider: 'elevenlabs', category: 'female' },
      
      // Premium Male Voices
      { id: 'antoni', name: 'Antoni - Well-Rounded (Male)', provider: 'elevenlabs', category: 'male' },
      { id: 'josh', name: 'Josh - Deep & Professional (Male)', provider: 'elevenlabs', category: 'male' },
      { id: 'arnold', name: 'Arnold - Crisp & Authoritative (Male)', provider: 'elevenlabs', category: 'male' },
      { id: 'adam', name: 'Adam - Deep & Resonant (Male)', provider: 'elevenlabs', category: 'male' },
      { id: 'sam', name: 'Sam - Dynamic & Raspy (Male)', provider: 'elevenlabs', category: 'male' },
      { id: 'clyde', name: 'Clyde - Warm & Rich (Male)', provider: 'elevenlabs', category: 'male' },
      { id: 'callum', name: 'Callum - Intense & Gritty (Male)', provider: 'elevenlabs', category: 'male' },
      { id: 'patrick', name: 'Patrick - Shouty & Energetic (Male)', provider: 'elevenlabs', category: 'male' }
    ];

    console.log('📞 Serving', elevenLabsVoices.length, 'voice options');
    res.json({ voices: elevenLabsVoices });
  } catch (error) {
    console.error('❌ Error fetching voices:', error);
    // Fallback to basic voices if something goes wrong
    res.json({
      voices: [
        { id: 'rachel', name: 'Rachel (Female)', provider: 'elevenlabs' },
        { id: 'antoni', name: 'Antoni (Male)', provider: 'elevenlabs' },
        { id: 'josh', name: 'Josh (Male)', provider: 'elevenlabs' }
      ]
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});
