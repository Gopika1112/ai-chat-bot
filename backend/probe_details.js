require('dotenv').config();

async function probeDetails() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }] })
    });
    const body = await resp.text();
    console.log(`Status: ${resp.status}`);
    console.log(`Body: ${body}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

probeDetails();
