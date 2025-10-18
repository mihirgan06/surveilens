const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json());

// Debug: Log loaded credentials
console.log('🔑 Client ID:', process.env.VITE_GOOGLE_CLIENT_ID ? '✅ Loaded' : '❌ Missing');
console.log('🔐 Client Secret:', process.env.VITE_GOOGLE_CLIENT_SECRET ? '✅ Loaded' : '❌ Missing');

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
  
  res.redirect(authUrl);
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 OAuth server running on http://localhost:${PORT}`);
});

