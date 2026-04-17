const config = require('./config');

async function listModels() {
    console.log('Listing models...');
    const apiKey = config.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('API Key MISSING');
        return;
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        
        if (data.models) {
            console.log('Available models:');
            data.models.forEach(m => {
                if (m.name.includes('flash')) {
                    console.log(`- ${m.name} [${m.supportedGenerationMethods.join(', ')}]`);
                }
            });
        } else {
            console.log('No models found:', JSON.stringify(data));
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
}

listModels();
