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

// --- ROBLOX & PAIRING HOOKS ---
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

app.post('/api/pair', (req, res) => {
    const { pin } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].connected = true;
        res.json({ success: true });
    } else { res.status(400).json({ success: false, error: "Invalid PIN" }); }
});

app.get('/api/select-script', (req, res) => {
    const { pin } = req.query;
    if (activeSessions[pin] && activeSessions[pin].currentScript) {
        res.json({ source: activeSessions[pin].currentScript, name: "Studio_Script" });
    } else { res.json({ source: null }); }
});

// --- CHAT HISTORY HOOKS ---
app.get('/api/chats/:userId', async (req, res) => {
    const { data, error } = await db.from('chats').select('*').eq('user_id', req.params.userId).order('created_at', { ascending: false });
    res.json({ success: !error, chats: data || [] });
});

app.get('/api/messages/:chatId', async (req, res) => {
    const { data, error } = await db.from('messages').select('*').eq('chat_id', req.params.chatId).order('created_at', { ascending: true });
    res.json({ success: !error, messages: data || [] });
});

// --- THE AI BRAIN (With Memory) ---
app.post('/api/prompt', async (req, res) => {
    let { prompt, pin, userId, chatId } = req.body;

    if (!activeSessions[pin]) return res.status(400).json({ success: false, error: "Roblox Studio is not connected." });
    if (!userId) return res.status(400).json({ success: false, error: "User not authenticated." });

    try {
        const { data: profile } = await db.from('profiles').select('*').eq('id', userId).single();
        let aiClient = baseOpenAI;
        let activeModel = DEFAULT_MODEL;

        if (profile && profile.preferred_model === 'byok' && profile.custom_api_key) {
            if (profile.custom_model) activeModel = profile.custom_model;
            aiClient = new OpenAI({ baseURL: 'https://polza.ai/api/v1', apiKey: profile.custom_api_key, timeout: 60000 });
        }

        // 1. Manage Chat Session
        if (!chatId) {
            const title = prompt.length > 25 ? prompt.substring(0, 25) + '...' : prompt;
            const { data: newChat } = await db.from('chats').insert({ user_id: userId, title }).select().single();
            chatId = newChat.id;
        }

        // 2. Save User Message
        await db.from('messages').insert({ chat_id: chatId, role: 'user', content: prompt });

        // 3. Fetch History (Limit to last 10 messages so cheap models don't crash)
        const { data: history } = await db.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(10);
        history.reverse(); 

        const systemPrompt = `You are BloxNexus, an elite Roblox Luau Architect.
CRITICAL DIRECTIVES:
1. PHYSICAL SPAWNING: Parent all new parts to 'workspace'. Tools go to game.Players.LocalPlayer.Backpack.
2. SYNTAX: Use Vector3.new(), task.wait().
3. OUTPUT SCHEMA: Write a 1-2 sentence plan checking your syntax, then output exactly ONE \`\`\`lua block containing the full script.`;

        // 4. Construct Context
        const messages = [{ role: 'system', content: systemPrompt }];
        history.forEach(msg => {
            if (msg.role === 'user') {
                messages.push({ role: 'user', content: msg.content });
            } else {
                let aiContent = msg.content;
                if (msg.code) aiContent += `\n\`\`\`lua\n${msg.code}\n\`\`\``;
                messages.push({ role: 'assistant', content: aiContent });
            }
        });

        const completion = await aiClient.chat.completions.create({
            model: activeModel, 
            messages: messages,
            temperature: 0.2, 
            max_tokens: 4000
        });

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
            chatMessage = "Logic compiled.";
        }

        // 5. Save AI Response
        await db.from('messages').insert({ chat_id: chatId, role: 'ai', content: chatMessage, code: cleanCode });
        activeSessions[pin].pendingCode = cleanCode;
        
        res.json({ success: true, message: chatMessage, code: cleanCode, chatId: chatId });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "API Timeout." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Engine Live on port ${PORT}`));
