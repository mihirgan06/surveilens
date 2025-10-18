import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import twilio from 'twilio';
import dotenv from 'dotenv';
import { VapiClient } from '@vapi-ai/server-sdk';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

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

// Store user tokens for OAuth flows (Gmail)
const userTokens = {};

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
    
    // Store tokens for this node
    userTokens[nodeId] = tokens;
    
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
app.post('/slack/send', async (req, res) => {
  const { nodeId, channel, message, blocks } = req.body;
  
  console.log('💬 Slack send request received:');
  console.log('  NodeId:', nodeId);
  console.log('  Channel:', channel);
  console.log('  Message:', message);
  
  if (!process.env.SLACK_BOT_TOKEN) {
    return res.status(401).json({ error: 'Slack bot token not configured' });
  }
  
  try {
    const slackMessage = {
      channel: channel || '#general',
      text: message,
      ...(blocks && { blocks })
    };
    
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(slackMessage)
    });
    
    const result = await response.json();
    
    if (result.ok) {
      console.log('✅ Slack message sent successfully');
      res.json({ success: true, message: 'Slack message sent successfully!', ts: result.ts });
    } else {
      console.error('❌ Slack API error:', result.error);
      res.status(400).json({ error: `Slack API error: ${result.error}` });
    }
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

    console.log(`📞 Using VAPI SDK with Riley assistant (proven to work)...`);
    
    // Make the call using Riley assistant (same as working VC-voice-agent)
    const call = await vapi.calls.create({
      type: 'outboundPhoneCall',
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: {
        number: phoneNumber,
      },
      assistantId: '11182291-6fa9-46d2-8127-5a8b4536e00e', // Riley assistant (new VAPI account)
      // Override Riley's default message with custom surveillance alert
      assistantOverrides: {
        firstMessage: message
      }
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
      details: error.message || String(error) 
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

