require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai'); 

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
        activeSessions[pin].pendingCode = null; 
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
// 4. THE AI BRAIN (The Architect Directive)
// ==========================================
app.post('/api/prompt', async (req, res) => {
    const { prompt, pin, userId } = req.body;

    if (!activeSessions[pin]) return res.status(400).json({ success: false, error: "Roblox Studio is not connected." });
    if (!userId) return res.status(400).json({ success: false, error: "User not authenticated." });

    try {
        const { data: profile, error } = await db.from('profiles').select('*').eq('id', userId).single();
        if (error || !profile) return res.status(400).json({ success: false, error: "Database profile not found." });

        let aiClient = baseOpenAI;
        let activeModel = DEFAULT_MODEL;

        if (profile.preferred_model === 'byok' && profile.custom_api_key) {
            if (profile.custom_model) activeModel = profile.custom_model;
            aiClient = new OpenAI({
                baseURL: 'https://polza.ai/api/v1', 
                apiKey: profile.custom_api_key
            });
        }

        // 🚨 THE MASTER ROBLOX INSTRUCTION SET 🚨
        const systemPrompt = `You are BloxNexus, an elite, senior-level Roblox Luau Architect.
The user wants you to: "${prompt}".

CRITICAL DIRECTIVES:
1. NEVER LEAVE CODE UNFINISHED. You must write the complete, 100% working script from start to finish. Do not use placeholders like "-- rest of code here".
2. PHYSICAL SPAWNING: If creating an object, you MUST parent it to the workspace (e.g., \`object.Parent = workspace\`).
3. LUAU SYNTAX: You must use proper Roblox data types. Use \`Vector3.new(x, y, z)\` for Size and Position. Use \`CFrame.new()\` for rotation. NEVER just write "Vector".
4. WEAPONS/TOOLS: If asked to make a sword or tool, create a "Tool" Instance, create a "Part" named "Handle" inside it, and parent the Tool to \`game.Players.LocalPlayer.Backpack\` or \`workspace\`.
5. Speak conversationally for exactly 1-2 sentences to explain what you built, then provide the complete code inside ONE \`\`\`lua markdown block.`;

        console.log(`[AI] Compiling prompt for ${activeModel}...`);

        const completion = await aiClient.chat.completions.create({
            model: activeModel, 
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.2, 
            max_tokens: 4000,             // Legacy API support
            max_completion_tokens: 4000   // New OpenAI SDK support
        });

        if (!completion.choices || !completion.choices[0]) {
             return res.status(500).json({ success: false, error: "The AI engine failed to generate a response." });
        }

        const rawResponse = completion.choices[0].message.content;
        
        let cleanCode = "";
        let chatMessage = "";
        
        const codeBlockStart = rawResponse.toLowerCase().indexOf('```lua');
        
        if (codeBlockStart !== -1) {
            chatMessage = rawResponse.substring(0, codeBlockStart).trim();
            let codeSection = rawResponse.substring(codeBlockStart + 6);
            const codeBlockEnd = codeSection.indexOf('```');
            cleanCode = codeBlockEnd !== -1 ? codeSection.substring(0, codeBlockEnd).trim() : codeSection.trim();
        } else {
            cleanCode = rawResponse.replace(/```/g, '').trim();
            chatMessage = "Here is the logic you requested.";
        }
        
        if (chatMessage === "") chatMessage = "I've written the logic for you. Pushing to Studio...";
        if (cleanCode === "") cleanCode = "-- AI failed to generate script logic. Please try again.";

        activeSessions[pin].pendingCode = cleanCode;
        
        res.json({ 
            success: true, 
            message: chatMessage,
            code: cleanCode
        });

    } catch (err) {
        console.error("[SERVER] Fatal Error during prompt execution:", err);
        res.status(500).json({ success: false, error: "Server processing error. Check backend logs." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 BloxNexus Engine live on port ${PORT}`));
