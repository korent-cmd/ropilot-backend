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
// 2. ROBLOX PLUGIN HOOKS (The Bridge)
// ==========================================
app.get('/api/generate-pin', (req, res) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    activeSessions[pin] = { 
        connected: false, 
        pendingBatch: null, 
        pendingAction: null, 
        currentScript: null, 
        currentScriptName: null, 
        architecture: null 
    };
    console.log(`[AUTH] New Studio PIN generated: ${pin}`);
    res.json({ pin });
});

// Studio polls this to grab approved code OR revert commands
app.get('/code', (req, res) => {
    const pin = req.query.pin;
    if (activeSessions[pin] && activeSessions[pin].pendingBatch) {
        const batchToSend = activeSessions[pin].pendingBatch;
        const actionToSend = activeSessions[pin].pendingAction || "execute_batch"; 
        
        activeSessions[pin].pendingBatch = null; 
        activeSessions[pin].pendingAction = null;
        
        res.json({ action: actionToSend, files: batchToSend });
    } else { 
        res.json({ action: "none" }); 
    }
});

app.post('/api/pair', (req, res) => {
    const { pin } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].connected = true;
        console.log(`[AUTH] Web App paired successfully with PIN: ${pin}`);
        res.json({ success: true });
    } else { 
        res.status(400).json({ success: false, error: "Invalid or expired PIN." }); 
    }
});

// Web UI polls this to see what you are looking at in Studio
app.get('/api/select-script', (req, res) => {
    const { pin } = req.query;
    if (activeSessions[pin] && activeSessions[pin].currentScript) {
        res.json({ 
            source: activeSessions[pin].currentScript, 
            name: activeSessions[pin].currentScriptName || "Studio_Script" 
        });
    } else { 
        res.json({ source: null }); 
    }
});

// Plugin sends what you are looking at + the God-Mode folder map
app.post('/api/select-script', (req, res) => {
    const { pin, source, script, name, architecture } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].currentScript = source || script;
        activeSessions[pin].currentScriptName = name;
        if (architecture) activeSessions[pin].architecture = architecture;
        res.json({ success: true });
    } else { 
        res.json({ success: false }); 
    }
});

// Web UI sends approved code OR revert commands here
app.post('/api/inject', (req, res) => {
    const { pin, action, files } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].pendingBatch = files; 
        activeSessions[pin].pendingAction = action || "execute_batch"; 
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

app.delete('/api/chats/:chatId', async (req, res) => {
    const { error } = await db.from('chats').delete().eq('id', req.params.chatId);
    res.json({ success: !error });
});

// ==========================================
// 4. THE AI BRAIN (JSON Multi-File Engine)
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

        const systemPrompt = `You are BloxNexus, an elite, senior-level Roblox Engine Architect and Full-Stack Luau Expert. Your core directive is to engineer production-ready, highly optimized, and bug-free Roblox systems.

=== I. ENGINEERING & ARCHITECTURE STANDARDS ===
1. Modern Luau Only: Always use \`task.wait()\`, \`task.spawn()\`, and proper Service declarations (\`game:GetService()\`). Never use deprecated methods like \`wait()\`.
2. Strict Separation of Concerns: You have the ability to generate multiple scripts at once. NEVER cram server logic and client input into the same file. Separate them into \`LocalScript\` (Client) and \`Script\` (Server) and bridge them using \`RemoteEvent\`s or \`RemoteFunction\`s.
3. Completeness: NEVER use placeholders like "-- rest of code goes here" or "-- add logic here". You must write 100% complete, fully functional code from the first line to the last.

=== II. THE THREE OPERATION MODES ===
Analyze the user's prompt and the provided game architecture to determine your mode:

MODE A - "GENERATOR" (New Systems): Create scalable scripts from scratch. Programmatically build physical items using \`Instance.new\` and parent them correctly.
MODE B - "EDITOR" (Modifying Code): Read the user's active script. Find the exact logic to change. Output the ENTIRE script from top to bottom with the new features or bug fixes integrated flawlessly.
MODE C - "UI BUILDER" (2D Interfaces): Generate beautiful menus. Create a \`ScreenGui\` parented to \`StarterGui\`. You MUST use modern UX styling: \`UICorner\` for rounded edges, \`UIStroke\` for outlines, sleek Color3 palettes (default to dark mode unless asked otherwise), and \`UDim2\` for responsive scaling on all screen sizes.

=== III. OUTPUT SCHEMA (CRITICAL OVERRIDE) ===
You are communicating directly with a strict JSON-parsing injection engine. 
You MUST output YOUR ENTIRE RESPONSE as a single, valid JSON array. 
Do NOT wrap the JSON in markdown blocks (e.g., no \`\`\`json). Just output the raw brackets [].
Do NOT include any conversational text outside the JSON array.

[
  {
    "type": "message",
    "content": "CHAIN OF THOUGHT: Write 3-4 sentences explaining your architectural plan. Explain how you separated the client/server logic, what services you used, and exactly what changes you made so the user understands your genius."
  },
  {
    "type": "file",
    "name": "ModuleName_Or_ScriptName",
    "className": "Script" | "LocalScript" | "ModuleScript", 
    "parent": "ServerScriptService" | "StarterPlayerScripts" | "StarterGui" | "workspace" | "ReplicatedStorage", 
    "code": "-- Your complete, bug-free, fully functional Luau code goes here"
  }
]`;

        const messages = [{ role: 'system', content: systemPrompt }];
        
        // 🚨 Inject God-Mode Map
        if (activeSessions[pin].architecture) {
            messages.push({ role: 'system', content: `[SYSTEM CONTEXT: The user's entire game structure is outlined below. Use this to understand where items, remote events, and scripts are located:\n\n${activeSessions[pin].architecture}]` });
        }

        // 🚨 Inject Active Script
        if (activeSessions[pin].currentScript && activeSessions[pin].currentScript.length > 10) {
            messages.push({ role: 'system', content: `[SYSTEM CONTEXT: The user currently has this script open in Roblox Studio named '${activeSessions[pin].currentScriptName}':]\n\`\`\`lua\n${activeSessions[pin].currentScript}\n\`\`\`` });
        }

        history.forEach(msg => {
            if (msg.role === 'user') {
                messages.push({ role: 'user', content: msg.content });
            } else {
                let aiContent = msg.content;
                // If the AI message had a JSON batch, feed it back to the context
                if (msg.code && msg.code.startsWith('[')) {
                    aiContent += `\n${msg.code}`;
                }
                messages.push({ role: 'assistant', content: aiContent });
            }
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
            return res.status(500).json({ success: false, error: "AI output formatting error. The model failed to strictly follow the JSON schema. Try generating again." });
        }

        // Save JSON array as string in DB for the Revert/Time Machine functionality
        await db.from('messages').insert({ chat_id: chatId, role: 'ai', content: chatMessage, code: JSON.stringify(files) });
        
        res.json({ 
            success: true, 
            message: chatMessage,
            files: files,
            chatId: chatId
        });

    } catch (err) {
        console.error("[SERVER] Error during prompt execution:", err);
        res.status(500).json({ success: false, error: "API Timeout - The model took too long to respond, or the connection dropped." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Engine Live on port ${PORT}`));
