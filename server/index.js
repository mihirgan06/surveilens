import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import twilio from 'twilio';
import dotenv from 'dotenv';

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

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});

