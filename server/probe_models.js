require('dotenv').config();

async function probeModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-1.0-pro',
    'gemini-1.5-flash-8b'
  ];

  console.log(`Probing models with key: ${apiKey.substring(0, 5)}...`);

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] })
      });
      console.log(`- ${model}: ${resp.status} ${resp.statusText}`);
      if (resp.status === 200) {
        console.log(`✅ FOUND WORKING MODEL: ${model}`);
        process.exit(0);
      }
    } catch (e) {
      console.log(`- ${model}: ERROR ${e.message}`);
    }
  }
}

probeModels();
