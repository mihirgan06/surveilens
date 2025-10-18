const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

const app = express();

// Enhanced CORS configuration to handle all frontend ports
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174', 
    'http://localhost:5175',
    'http://localhost:3000',
    'http://localhost:8080'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

// Debug: Log loaded credentials
console.log('🔑 Google Client ID:', process.env.VITE_GOOGLE_CLIENT_ID ? '✅ Loaded' : '❌ Missing');
console.log('🔐 Google Client Secret:', process.env.VITE_GOOGLE_CLIENT_SECRET ? '✅ Loaded' : '❌ Missing');
console.log('💬 Slack Bot Token:', process.env.SLACK_BOT_TOKEN ? '✅ Loaded' : '❌ Missing');

const oauth2Client = new google.auth.OAuth2(
  process.env.VITE_GOOGLE_CLIENT_ID,
  process.env.VITE_GOOGLE_CLIENT_SECRET,
  'http://localhost:3001/auth/google/callback'
);

// Store tokens temporarily (in production, use a database)
const tokens = new Map();

// Generate auth URL
app.get('/auth/google', (req, res) => {
  const { nodeId } = req.query;
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
    state: nodeId, // Pass nodeId through state
  });
  
  res.json({ authUrl });
});

// OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code, state: nodeId } = req.query;
  
  try {
    const { tokens: authTokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(authTokens);
    
    // Store tokens with nodeId
    tokens.set(nodeId, authTokens);
    
    // Redirect back to frontend with success
    res.send(`
      <html>
        <body>
          <h2>✅ Authentication Successful!</h2>
          <p>You can close this window and return to the app.</p>
          <script>
            window.opener.postMessage({ 
              type: 'GMAIL_AUTH_SUCCESS', 
              nodeId: '${nodeId}',
              authenticated: true 
            }, '*');
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.send(`
      <html>
        <body>
          <h2>❌ Authentication Failed</h2>
          <p>Error: ${error.message}</p>
          <script>
            window.opener.postMessage({ 
              type: 'GMAIL_AUTH_ERROR', 
              error: '${error.message}' 
            }, '*');
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  }
});

// Send email endpoint
app.post('/api/send-email', async (req, res) => {
  const { nodeId, to, subject, body } = req.body;
  
  try {
    const authTokens = tokens.get(nodeId);
    if (!authTokens) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    oauth2Client.setCredentials(authTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const message = [
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${subject}`,
      '',
      body,
    ].join('\n');
    
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message });
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 OAuth server running on http://localhost:${PORT}`);
});

