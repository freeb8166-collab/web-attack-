const express = require('express');
const app = express();

// ==================== CONFIGURATION CORS ====================
// ⚠️ Remplace 'ton-username.github.io' par ton vrai domaine GitHub Pages
const ALLOWED_ORIGINS = [
    'https://freeb8166-collab.github.io',   // ⚠️ À MODIFIER
    'https://ton-username.github.io',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000'
];

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================== VARIABLES D'ENVIRONNEMENT ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error('❌ ERREUR: BOT_TOKEN ou CHAT_ID manquants dans les variables d\'environnement');
    console.error('   Ajoute-les sur Render :');
    console.error('   - BOT_TOKEN = 8507961561:AAFGiLtXzjIcR-j2IQuIDA55QZDQEYQFq_4');
    console.error('   - CHAT_ID = 6767182328');
    process.exit(1);
}

console.log('✅ Configuration chargée');
console.log(`   BOT_TOKEN: ${BOT_TOKEN.substring(0, 15)}...`);
console.log(`   CHAT_ID: ${CHAT_ID}`);

// ==================== ENDPOINTS ====================

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        bot_configured: !!BOT_TOKEN,
        chat_configured: !!CHAT_ID
    });
});

// Envoi de message texte
app.post('/send', async (req, res) => {
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: 'No text provided' });
    }
    
    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: CHAT_ID, 
                text: text.substring(0, 4000) 
            })
        });
        
        const data = await response.json();
        
        if (data.ok) {
            res.json({ ok: true, telegram_response: data });
        } else {
            res.status(500).json({ ok: false, error: data.description });
        }
    } catch (error) {
        console.error('Erreur /send:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Envoi de fichier
app.post('/send-file', async (req, res) => {
    const { filename, content } = req.body;
    
    if (!filename || !content) {
        return res.status(400).json({ error: 'Missing filename or content' });
    }
    
    try {
        const buffer = Buffer.from(content, 'base64');
        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        formData.append('document', new Blob([buffer], { type: 'application/json' }), filename);
        
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.ok) {
            res.json({ ok: true, telegram_response: data });
        } else {
            res.status(500).json({ ok: false, error: data.description });
        }
    } catch (error) {
        console.error('Erreur /send-file:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint de test pour vérifier que le proxy fonctionne
app.get('/test', (req, res) => {
    res.json({ 
        message: 'Proxy Telegram fonctionnel', 
        timestamp: Date.now(),
        endpoints: ['/health', '/send (POST)', '/send-file (POST)', '/test']
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Proxy Telegram actif sur le port ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🔗 Endpoints:`);
    console.log(`   GET  /health  - Vérification de l'état`);
    console.log(`   POST /send    - Envoyer un message texte`);
    console.log(`   POST /send-file - Envoyer un fichier`);
    console.log(`   GET  /test    - Test de connexion\n`);
});
