// server.js
const express = require('express');
const app = express();

// Autoriser les requêtes depuis GitHub Pages
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://ton-username.github.io');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Variables d'environnement (à définir sur Render)
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error('❌ BOT_TOKEN ou CHAT_ID manquants');
    process.exit(1);
}

// Endpoint pour envoyer un message
app.post('/send', async (req, res) => {
    const { text, file } = req.body;
    
    try {
        if (file) {
            // Envoi de fichier
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    document: file,
                    caption: text?.substring(0, 200) || ''
                })
            });
            const data = await response.json();
            res.json({ ok: data.ok });
        } else if (text) {
            // Envoi de message texte
            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: CHAT_ID, text: text.substring(0, 4000) })
            });
            const data = await response.json();
            res.json({ ok: data.ok });
        } else {
            res.status(400).json({ error: 'No text or file provided' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint pour envoyer des fichiers
app.post('/send-file', async (req, res) => {
    const { filename, content } = req.body;
    try {
        const blob = Buffer.from(content, 'base64');
        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        formData.append('document', new Blob([blob]), filename);
        
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        res.json({ ok: data.ok });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Proxy Telegram actif sur port ${PORT}`);
});
