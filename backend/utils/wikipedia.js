const axios = require('axios');

async function getWikipediaSummary(query) {
    try {
        console.log(`🌐 [Wiki Search]: Searching for "${query}"...`);
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
        const searchRes = await axios.get(searchUrl);
        
        if (!searchRes.data.query.search || searchRes.data.query.search.length === 0) {
            return null;
        }

        const title = searchRes.data.query.search[0].title;
        console.log(`🎯 [Wiki Found]: ${title}`);
        
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
        const summaryRes = await axios.get(summaryUrl);
        
        return summaryRes.data.extract || null;
    } catch (error) {
        console.error('❌ Wikipedia Error:', error.message);
        return null;
    }
}

module.exports = { getWikipediaSummary };
