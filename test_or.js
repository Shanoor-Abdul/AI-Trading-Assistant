require('dotenv').config({ path: '.env.local' });
const OpenAI = require('openai');
async function run() {
  try {
    console.log('Key:', process.env.OPENROUTER_API_KEY ? 'Set' : 'Not Set');
    const openai = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1' });
    const res = await openai.chat.completions.create({
      model: 'anthropic/claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'Respond with exactly {"test": 1}' }]
    });
    console.log(res.choices[0].message.content);
  } catch (e) { console.error('Error:', e.message); }
}
run();
