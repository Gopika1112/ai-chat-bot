require('dotenv').config();
const fs = require('fs');

async function listModelsFinal() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();
    let log = `Status: ${resp.status}\n`;
    if (data.models) {
      data.models.forEach(m => {
        log += `- ${m.name} (${m.supportedGenerationMethods.join(', ')})\n`;
      });
    } else {
      log += 'No models found.\n' + JSON.stringify(data, null, 2);
    }
    fs.writeFileSync('models_list.txt', log);
    console.log('LOGGED');
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

listModelsFinal();
