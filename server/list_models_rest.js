require('dotenv').config();

async function listModelsRest() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();
    console.log(`Status: ${resp.status}`);
    if (data.models) {
      data.models.forEach(m => console.log(`- ${m.name}`));
    } else {
      console.log('No models found in response.');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

listModelsRest();
