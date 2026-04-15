require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai'); 

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

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
// 1. ROBLOX PLUGIN HOOKS
// ==========================================
app.get('/api/generate-pin', (req, res) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    activeSessions[pin] = { connected: false, pendingBatch: null, currentScript: null, currentScriptName: null, architecture: null };
    console.log(`[AUTH] New Studio PIN generated: ${pin}`);
    res.json({ pin });
});

app.get('/code', (req, res) => {
    const pin = req.query.pin;
    if (activeSessions[pin] && activeSessions[pin].pendingBatch) {
        const batchToSend = activeSessions[pin].pendingBatch;
        activeSessions[pin].pendingBatch = null; 
        res.json({ action: "execute_batch", files: batchToSend });
    } else { res.json({ action: "none" }); }
});

app.post('/api/pair', (req, res) => {
    const { pin } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].connected = true;
        res.json({ success: true });
    } else { res.status(400).json({ success: false, error: "Invalid PIN." }); }
});

app.get('/api/select-script', (req, res) => {
    const { pin } = req.query;
    if (activeSessions[pin] && activeSessions[pin].currentScript) {
        res.json({ source: activeSessions[pin].currentScript, name: activeSessions[pin].currentScriptName || "Studio_Script" });
    } else { res.json({ source: null }); }
});

app.post('/api/select-script', (req, res) => {
    const { pin, source, script, name, architecture } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].currentScript = source || script;
        activeSessions[pin].currentScriptName = name;
        if (architecture) activeSessions[pin].architecture = architecture;
        res.json({ success: true });
    } else { res.json({ success: false }); }
});

// 🚨 UPDATED MANUAL INJECT ENDPOINT (Accepts Array of Files) 🚨
app.post('/api/inject', (req, res) => {
    const { pin, files } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].pendingBatch = files; 
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: "Device not connected." });
    }
});

// ==========================================
// 2. CHAT HISTORY HOOKS
// ==========================================
app.get('/api/chats/:userId', async (req, res) => {
    const { data } = await db.from('chats').select('*').eq('user_id', req.params.userId).order('created_at', { ascending: false });
    res.json({ success: true, chats: data || [] });
});

app.get('/api/messages/:chatId', async (req, res) => {
    const { data } = await db.from('messages').select('*').eq('chat_id', req.params.chatId).order('created_at', { ascending: true });
    res.json({ success: true, messages: data || [] });
});

// ==========================================
// 3. THE MULTI-FILE AI BRAIN
// ==========================================
app.post('/api/prompt', async (req, res) => {
    let { prompt, pin, userId, chatId } = req.body;

    if (!activeSessions[pin]) return res.status(400).json({ success: false, error: "Roblox Studio is not connected." });
    if (!userId) return res.status(400).json({ success: false, error: "User not authenticated." });

    try {
        const { data: profile } = await db.from('profiles').select('*').eq('id', userId).single();
        let aiClient = baseOpenAI;
        let activeModel = DEFAULT_MODEL;

        if (profile.preferred_model === 'byok' && profile.custom_api_key) {
            if (profile.custom_model) activeModel = profile.custom_model;
            aiClient = new OpenAI({ baseURL: 'https://polza.ai/api/v1', apiKey: profile.custom_api_key, timeout: 60000 });
        }

        if (!chatId) {
            const title = prompt.length > 25 ? prompt.substring(0, 25) + '...' : prompt;
            const { data: newChat } = await db.from('chats').insert({ user_id: userId, title }).select().single();
            chatId = newChat.id;
        }

        await db.from('messages').insert({ chat_id: chatId, role: 'user', content: prompt });

        const { data: history } = await db.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(10);
        history.reverse(); 

        const systemPrompt = `You are BloxNexus, an elite Roblox Luau Architect.

=== THE THREE MODES ===
MODE A - "GENERATOR": Creating new systems or scripts. Use Instance.new.
MODE B - "EDITOR": Modifying existing code based on user requests. Output the FULL script.
MODE C - "UI BUILDER": Create ScreenGuis and 2D interfaces using Instance.new. Parent to "StarterGui". Use UICorner, UIStroke, and Color3.

=== OUTPUT SCHEMA (CRITICAL) ===
You MUST output YOUR ENTIRE RESPONSE as a valid JSON array. 
Do NOT wrap the JSON in markdown blocks (no \`\`\`json). Just the raw array.
Do NOT include any conversational text outside the JSON array.

[
  {
    "type": "message",
    "content": "Your 2-3 sentence explanation of what you built."
  },
  {
    "type": "file",
    "name": "SwordServer",
    "className": "Script", 
    "parent": "ServerScriptService", 
    "code": "-- full complete code here"
  },
  {
    "type": "file",
    "name": "SwordClient",
    "className": "LocalScript",
    "parent": "StarterPlayerScripts",
    "code": "-- full complete code here"
  }
]`;

        const messages = [{ role: 'system', content: systemPrompt }];
        
        if (activeSessions[pin].architecture) {
            messages.push({ role: 'system', content: `[GAME ARCHITECTURE]\n${activeSessions[pin].architecture}` });
        }

        if (activeSessions[pin].currentScript && activeSessions[pin].currentScript.length > 10) {
            messages.push({ role: 'system', content: `[ACTIVE SCRIPT OPEN: ${activeSessions[pin].currentScriptName}]\n\`\`\`lua\n${activeSessions[pin].currentScript}\n\`\`\`` });
        }

        history.forEach(msg => {
            messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content + (msg.code ? `\n${msg.code}` : '') });
        });

        console.log(`[AI] Compiling JSON prompt for ${activeModel}...`);

        const completion = await aiClient.chat.completions.create({
            model: activeModel, 
            messages: messages,
            temperature: 0.2, 
            max_tokens: 4000
        });

        const rawResponse = completion.choices[0].message.content;
        
        let parsedData = [];
        let chatMessage = "Logic compiled.";
        let files = [];

        try {
            // Strip any accidental markdown formatting the AI might add
            let cleanJsonStr = rawResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
            parsedData = JSON.parse(cleanJsonStr);

            parsedData.forEach(item => {
                if (item.type === 'message') chatMessage = item.content;
                else if (item.type === 'file') files.push(item);
            });
        } catch (e) {
            console.error("Failed to parse JSON:", rawResponse);
            return res.status(500).json({ success: false, error: "AI output formatting error. Please try generating again." });
        }

        // Save JSON array as string in DB
        await db.from('messages').insert({ chat_id: chatId, role: 'ai', content: chatMessage, code: JSON.stringify(files) });
        
        res.json({ 
            success: true, 
            message: chatMessage,
            files: files,
            chatId: chatId
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "API Timeout." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Engine Live on port ${PORT}`));
