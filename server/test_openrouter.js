const config = require('./config');

async function testOpenRouter() {
    console.log('Testing OpenRouter...');
    const apiKey = config.OPENROUTER_API_KEY;
    console.log('API Key present:', !!apiKey);
    if (!apiKey) return;

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai/gpt-3.5-turbo",
                messages: [{ role: "user", content: "hi" }]
            }),
        });

        console.log('Status:', response.status);
        const data = await response.json();
        console.log('Result:', JSON.stringify(data).substring(0, 100));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

testOpenRouter();
