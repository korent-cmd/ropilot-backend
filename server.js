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

const DEFAULT_MODEL = 'kwaipilot/kat-coder-pro-v2';
const baseOpenAI = new OpenAI({
    baseURL: 'https://polza.ai/api/v1',
    apiKey: process.env.AI_API_KEY,
    timeout: 60000 
});

const activeSessions = {};

// ==========================================
// 2. ROBLOX PLUGIN HOOKS & SYNCING
// ==========================================
app.get('/api/generate-pin', (req, res) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    activeSessions[pin] = { connected: false, pendingCode: null, currentScript: null, currentScriptName: null };
    console.log(`[AUTH] New Studio PIN generated: ${pin}`);
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

app.post('/api/pair', (req, res) => {
    const { pin } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].connected = true;
        console.log(`[AUTH] Web App paired successfully with PIN: ${pin}`);
        res.json({ success: true });
    } else { res.status(400).json({ success: false, error: "Invalid or expired PIN. Generate a new one in Studio." }); }
});

// The Web IDE calls this to READ the active script
app.get('/api/select-script', (req, res) => {
    const { pin } = req.query;
    if (activeSessions[pin] && activeSessions[pin].currentScript) {
        res.json({ 
            source: activeSessions[pin].currentScript, 
            name: activeSessions[pin].currentScriptName || "Studio_Script" 
        });
    } else { res.json({ source: null }); }
});

// The Roblox Plugin calls this to SEND the active script
app.post('/api/select-script', (req, res) => {
    const { pin, source, script, name } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].currentScript = source || script;
        activeSessions[pin].currentScriptName = name;
        res.json({ success: true });
    } else { res.json({ success: false }); }
});

// 🚨 THE MANUAL INJECT ENDPOINT (Called when you click "Approve") 🚨
app.post('/api/inject', (req, res) => {
    const { pin, code } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].pendingCode = code; 
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: "Device not connected." });
    }
});

// ==========================================
// 3. CHAT HISTORY HOOKS (Persistent Memory)
// ==========================================
app.get('/api/chats/:userId', async (req, res) => {
    const { data, error } = await db.from('chats').select('*').eq('user_id', req.params.userId).order('created_at', { ascending: false });
    res.json({ success: !error, chats: data || [] });
});

app.get('/api/messages/:chatId', async (req, res) => {
    const { data, error } = await db.from('messages').select('*').eq('chat_id', req.params.chatId).order('created_at', { ascending: true });
    res.json({ success: !error, messages: data || [] });
});

// ==========================================
// 4. THE AI BRAIN (Context-Aware Editor)
// ==========================================
app.post('/api/prompt', async (req, res) => {
    let { prompt, pin, userId, chatId } = req.body;

    if (!activeSessions[pin]) return res.status(400).json({ success: false, error: "Roblox Studio is not connected." });
    if (!userId) return res.status(400).json({ success: false, error: "User not authenticated." });

    try {
        const { data: profile, error: profileErr } = await db.from('profiles').select('*').eq('id', userId).single();
        if (profileErr || !profile) return res.status(400).json({ success: false, error: "Database profile not found." });

        let aiClient = baseOpenAI;
        let activeModel = DEFAULT_MODEL;

        if (profile.preferred_model === 'byok' && profile.custom_api_key) {
            if (profile.custom_model) activeModel = profile.custom_model;
            aiClient = new OpenAI({ baseURL: 'https://polza.ai/api/v1', apiKey: profile.custom_api_key, timeout: 60000 });
        }

        if (!chatId) {
            const title = prompt.length > 25 ? prompt.substring(0, 25) + '...' : prompt;
            const { data: newChat, error: chatErr } = await db.from('chats').insert({ user_id: userId, title }).select().single();
            if (chatErr) throw new Error("Failed to create chat session.");
            chatId = newChat.id;
        }

        await db.from('messages').insert({ chat_id: chatId, role: 'user', content: prompt });

        const { data: history } = await db.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(10);
        history.reverse(); 

        const systemPrompt = `You are BloxNexus, an elite, senior-level Roblox Luau Architect. 
Your goal is to generate flawless, production-ready Roblox scripts based on the user's request.

=== THE TWO MODES ===
Read the user's request and the code they provide in the chat history.

MODE A - "GENERATOR": If the user is asking you to create something NEW from scratch:
1. Write a single Luau script that programmatically creates Models, Parts, and Scripts (using Instance.new).
2. You MUST explicitly set the Parent of all physical objects to \`workspace\` or \`game.Players.LocalPlayer.Backpack\`.

MODE B - "EDITOR": If the user asks you to modify, fix, or add features to EXISTING code:
1. Read the code they provided.
2. Locate the specific area that needs changing.
3. Output the ENTIRE updated script, from the first line to the last line. Do not use placeholders like "-- rest of code here". 
4. Do NOT recreate the object with Instance.new unless the user explicitly asks for it. Just modify the logic/properties of the code provided.

=== CHAIN OF THOUGHT PROTOCOL ===
Before writing ANY code, execute a "Safety Check" in plain text. In exactly 2 to 3 sentences:
A. State your plan.
B. Confirm you are outputting the full, complete script without placeholders.

=== OUTPUT SCHEMA ===
[Your 2-3 sentence Safety Check and Plan goes here]

\`\`\`lua
-- Your complete, bug-free Luau script goes here
\`\`\``;

        const messages = [{ role: 'system', content: systemPrompt }];
        
        // Inject the active script into the context if it exists
        if (activeSessions[pin].currentScript && activeSessions[pin].currentScript.length > 10) {
            messages.push({ role: 'system', content: `[SYSTEM: The user currently has this script open in Roblox Studio named '${activeSessions[pin].currentScriptName}':]\n\`\`\`lua\n${activeSessions[pin].currentScript}\n\`\`\`` });
        }

        history.forEach(msg => {
            if (msg.role === 'user') {
                messages.push({ role: 'user', content: msg.content });
            } else {
                let aiContent = msg.content;
                if (msg.code) aiContent += `\n\`\`\`lua\n${msg.code}\n\`\`\``;
                messages.push({ role: 'assistant', content: aiContent });
            }
        });

        console.log(`[AI] Compiling prompt for ${activeModel}...`);

        const completion = await aiClient.chat.completions.create({
            model: activeModel, 
            messages: messages,
            temperature: 0.2, 
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
        
        if (chatMessage === "") chatMessage = "I've written the logic for you. Please review.";
        if (cleanCode === "") cleanCode = "-- AI failed to generate script logic. Please try again.";

        await db.from('messages').insert({ chat_id: chatId, role: 'ai', content: chatMessage, code: cleanCode });
        
        res.json({ 
            success: true, 
            message: chatMessage,
            code: cleanCode,
            chatId: chatId
        });

    } catch (err) {
        console.error("[SERVER] Error during prompt execution:", err);
        res.status(500).json({ success: false, error: "API Timeout - The model took too long to respond, or the connection dropped." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Engine Live on port ${PORT}`));
