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

// Swapped to Kat Coder Pro V2
const DEFAULT_MODEL = 'kwaipilot/kat-coder-pro-v2';
const baseOpenAI = new OpenAI({
    baseURL: 'https://polza.ai/api/v1',
    apiKey: process.env.AI_API_KEY,
    timeout: 60000 
});

const activeSessions = {};

// ==========================================
// 2. ROBLOX PLUGIN HOOKS
// ==========================================
app.get('/api/generate-pin', (req, res) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    activeSessions[pin] = { connected: false, pendingCode: null, currentScript: null };
    res.json({ pin });
});

app.get('/code', (req, res) => {
    const pin = req.query.pin;
    if (activeSessions[pin] && activeSessions[pin].pendingCode) {
        const codeToSend = activeSessions[pin].pendingCode;
        activeSessions[pin].pendingCode = null; 
        res.json({ action: "execute", code: codeToSend });
    } else { res.json({ action: "none" }); }
});

// ==========================================
// 3. WEB APP HOOKS
// ==========================================
app.post('/api/pair', (req, res) => {
    const { pin } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].connected = true;
        res.json({ success: true });
    } else { res.status(400).json({ success: false, error: "Invalid or expired PIN. Generate a new one in Studio." }); }
});

app.get('/api/select-script', (req, res) => {
    const { pin } = req.query;
    if (activeSessions[pin] && activeSessions[pin].currentScript) {
        res.json({ source: activeSessions[pin].currentScript, name: "Studio_Script" });
    } else { res.json({ source: null }); }
});

// ==========================================
// 4. THE AI BRAIN (Chain of Thought Update)
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
                apiKey: profile.custom_api_key,
                timeout: 60000
            });
        }

        // 🚨 NEW PROMPT: Forces the AI to review its own syntax before outputting code 🚨
        const systemPrompt = `You are BloxNexus AI, an elite Roblox Engine Architect. 
User wants: "${prompt}".

CRITICAL "CHAIN OF THOUGHT" INSTRUCTIONS:
1. PLAN & REVIEW: Before writing the final code, briefly state your plan. You MUST explicitly double-check your logic for stray typos (like a random letter at the start), missing 'end' statements, and proper Luau syntax.
2. GENERATOR MODE: Write a single Luau script that programmatically creates Models, Parts, and Scripts (using Instance.new).
3. PHYSICAL SPAWNING: Parent all physical parts to 'workspace'. Tools go to game.Players.LocalPlayer.Backpack.
4. SYNTAX: Use Vector3.new() for sizes/positions. Use task.wait() instead of wait().
5. OUTPUT FORMAT: 
   First, write a 2-3 sentence summary of your plan and confirm the syntax is checked.
   Second, provide exactly ONE \`\`\`lua markdown block containing the final, bug-free script.`;

        console.log(`[AI] Compiling prompt for ${activeModel}...`);

        const completion = await aiClient.chat.completions.create({
            model: activeModel, 
            messages: [{ role: 'user', content: systemPrompt }],
            temperature: 0.2, // Kept low to ensure strict syntax adherence
            max_tokens: 4000,
            max_completion_tokens: 4000
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
            chatMessage = "Logic compiled. Pushing to Studio...";
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
        console.error("[SERVER] Error during prompt execution:", err);
        res.status(500).json({ success: false, error: "API Timeout - The model took too long to respond, or the connection dropped." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Engine Live on port ${PORT}`));
