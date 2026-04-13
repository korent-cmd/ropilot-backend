require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai'); // Official SDK for Polza AI

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ==========================================
// 1. SYSTEM SECRETS & CONFIGURATION
// ==========================================
const SUPABASE_URL = 'https://uihfytxdzvbcbqixjpjw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_MODEL = 'qwen/qwen-2.5-coder-32b-instruct';
const baseOpenAI = new OpenAI({
    baseURL: 'https://polza.ai/api/v1',
    apiKey: process.env.AI_API_KEY 
});

const activeSessions = {};

// ==========================================
// 2. ROBLOX PLUGIN HOOKS
// ==========================================
app.get('/api/generate-pin', (req, res) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    activeSessions[pin] = { connected: false, pendingCode: null, currentScript: null };
    console.log(`[AUTH] New Studio PIN generated: ${pin}`);
    res.json({ pin });
});

app.get('/code', (req, res) => {
    const pin = req.query.pin;
    if (activeSessions[pin] && activeSessions[pin].pendingCode) {
        const codeToSend = activeSessions[pin].pendingCode;
        activeSessions[pin].pendingCode = null; // Clear it so it only runs once
        res.json({ action: "execute", code: codeToSend });
    } else {
        res.json({ action: "none" });
    }
});

// ==========================================
// 3. WEB APP HOOKS
// ==========================================
app.post('/api/pair', (req, res) => {
    const { pin } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].connected = true;
        console.log(`[AUTH] Web App paired successfully with PIN: ${pin}`);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: "Invalid or expired PIN. Generate a new one in Studio." });
    }
});

app.get('/api/select-script', (req, res) => {
    const { pin } = req.query;
    if (activeSessions[pin] && activeSessions[pin].currentScript) {
        res.json({ source: activeSessions[pin].currentScript, name: "Studio_Script" });
    } else {
        res.json({ source: null });
    }
});

// ==========================================
// 4. THE AI BRAIN (The Profit Engine)
// ==========================================
app.post('/api/prompt', async (req, res) => {
    const { prompt, pin, userId } = req.body;

    if (!activeSessions[pin]) return res.status(400).json({ success: false, error: "Roblox Studio is not connected." });
    if (!userId) return res.status(400).json({ success: false, error: "User not authenticated." });

    try {
        // A. Verify User & Paywall in Supabase
        const { data: profile, error } = await db.from('profiles').select('*').eq('id', userId).single();
        
        // 🚨 THIS IS THE NEW ERROR MESSAGE. If it fails, you will see exactly this:
        if (error || !profile) return res.status(400).json({ success: false, error: "Database profile not found." });

        let aiClient = baseOpenAI;

        // B. Handle BYOK (Bring Your Own Key) Bypass
        if (profile.preferred_model === 'byok' && profile.custom_api_key) {
            console.log(`[AI] User ${userId} is bypassing quotas using BYOK.`);
            aiClient = new OpenAI({
                baseURL: 'https://polza.ai/api/v1', 
                apiKey: profile.custom_api_key
            });
        }

        // C. Build the Developer Prompt
        const systemPrompt = `You are BloxNexus, an expert-level Roblox Luau AI assistant.
The user wants you to: "${prompt}".
Here is the Lua script they are currently editing in Studio:
\`\`\`lua
${activeSessions[pin].currentScript || "-- Blank Script"}
\`\`\`
CRITICAL RULES:
1. Return ONLY valid Luau code. 
2. Do NOT include markdown formatting like \`\`\`lua. 
3. Do NOT explain the code. 
4. Just write the raw script text so it can be directly injected into Roblox Studio.`;

        console.log(`[AI] Compiling prompt for Qwen 2.5 Coder via Polza AI...`);

        // D. Call Polza AI
        const completion = await aiClient.chat.completions.create({
            model: DEFAULT_MODEL,
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.2 
        });

        if (!completion.choices || !completion.choices[0]) {
             return res.status(500).json({ success: false, error: "The AI engine failed to generate a response." });
        }

        // E. Clean the output
        let cleanCode = completion.choices[0].message.content.replace(/```lua/g, '').replace(/```/g, '').trim();

        // F. Stage the code for Roblox Studio to grab
        activeSessions[pin].pendingCode = cleanCode;
        
        res.json({ 
            success: true, 
            message: "Logic compiled. Pushing to Roblox Studio...",
            code: cleanCode 
        });

    } catch (err) {
        console.error("[SERVER] Fatal Error during prompt execution:", err);
        res.status(500).json({ success: false, error: "Server processing error. Check backend logs." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 BloxNexus Engine live on port ${PORT}`));
