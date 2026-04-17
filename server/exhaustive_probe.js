require('dotenv').config();

async function exhaustiveProbe() {
  const apiKey = process.env.GEMINI_API_KEY;
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-1.0-pro',
    'gemini-pro',
    'gemini-1.5-flash-8b'
  ];

  console.log(`Exhaustive probing v1beta...`);

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] })
      });
      const body = await resp.text();
      console.log(`- ${model}: ${resp.status}`);
      if (resp.status === 200) {
        console.log(`✅ SUCCESS WITH: ${model}`);
        console.log(body);
        process.exit(0);
      }
    } catch (e) {
      console.log(`- ${model}: ERROR ${e.message}`);
    }
  }
}

exhaustiveProbe();
