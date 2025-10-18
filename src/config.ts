// Configuration for the surveillance system
export const config = {
  // OpenAI API Key - Set this to use AI-powered scene analysis
  openaiApiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  
  // How often to send frames to OpenAI for analysis (in seconds)
  aiAnalysisInterval: 5, // Analyze every 5 seconds to manage API costs
  
  // Enable/disable features
  features: {
    localObjectDetection: true, // TensorFlow.js COCO-SSD
    aiSceneAnalysis: true, // OpenAI GPT-4 Vision
    audioAlerts: true,
    workflowAutomation: true
  },
  
  // API rate limiting
  rateLimits: {
    maxFramesPerMinute: 12, // Max frames to send to OpenAI per minute
    cooldownPeriod: 5000 // Cooldown in ms between API calls
  }
};

// Helper to check if OpenAI is configured
export function isOpenAIConfigured(): boolean {
  return !!config.openaiApiKey && config.openaiApiKey !== 'your_openai_api_key_here';
}
