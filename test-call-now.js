import dotenv from 'dotenv';
import { VapiClient } from '@vapi-ai/server-sdk';

dotenv.config({ path: '.env.local' });

async function testCall() {
  console.log('📞 Testing VAPI call...\n');
  
  const phoneNumber = '+19255772134';
  const message = 'Yo my name is Suriya. I am a computer science student at New York University.';
  
  console.log(`Calling: ${phoneNumber}`);
  console.log(`Message: "${message}"\n`);
  
  try {
    const vapi = new VapiClient({
      token: process.env.VAPI_PRIVATE_KEY,
    });
    
    const call = await vapi.calls.create({
      type: 'outboundPhoneCall',
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: {
        number: phoneNumber,
        name: 'Suriya',
      },
      assistantId: '689ee057-17d1-4ab0-81ba-c8f9a21a7783',
      assistantOverrides: {
        firstMessage: message
      }
    });
    
    console.log('✅ Call initiated!');
    console.log('Call ID:', call.id);
    console.log('\n📱 Your phone should ring!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
  }
}

testCall();

