require('dotenv').config();

async function probeModelsBeta() {
  const apiKey = process.env.GEMINI_API_KEY;
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-1.0-pro'
  ];

  console.log(`Probing v1beta models...`);

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] })
      });
      console.log(`- ${model}: ${resp.status} ${resp.statusText}`);
      if (resp.status === 200) {
        console.log(`✅ FOUND WORKING MODEL ON v1beta: ${model}`);
        process.exit(0);
      }
    } catch (e) {
      console.log(`- ${model}: ERROR ${e.message}`);
    }
  }
}

probeModelsBeta();
