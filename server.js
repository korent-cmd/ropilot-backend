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
const EXPECTED_PLUGIN_VERSION = "1.1.0"; // 🚨 MASTER VERSION CONTROL

// ==========================================
// 🚨 SECURITY MIDDLEWARE 🚨
// ==========================================
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: "Access Denied: No Token" });
    
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await db.auth.getUser(token);
    
    if (error || !user) return res.status(401).json({ success: false, error: "Access Denied: Invalid Token" });
    
    req.userId = user.id; // Securely attach the mathematically verified ID
    next();
}

// ==========================================
// 2. ROBLOX PLUGIN HOOKS (The Bridge)
// ==========================================
app.get('/api/generate-pin', (req, res) => {
    const isDemo = req.query.demo === 'true'; 
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    
    activeSessions[pin] = { 
        connected: false, 
        pendingBatch: null, 
        pendingAction: null, 
        currentScript: null, 
        currentScriptName: null, 
        architecture: null,
        pinnedScripts: {}, 
        pluginVersion: "1.0.0",
        isOutdated: false,
        lastError: null,
        isDemo: isDemo, 
        requestsLeft: isDemo ? 20 : null 
    };
    console.log(`[AUTH] New Studio PIN generated: ${pin} (Demo: ${isDemo})`);
    res.json({ pin });
});

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

// 🚨 SECURE PAIRING ROUTE 🚨
app.post('/api/pair', requireAuth, async (req, res) => {
    const { pin } = req.body;
    const userId = req.userId; // Extracted securely from the token
    
    if (activeSessions[pin]) {
        activeSessions[pin].connected = true;
        
        if (activeSessions[pin].isDemo && userId) {
            const { data } = await db.from('profiles').select('demo_tokens').eq('id', userId).single();
            if (data && data.demo_tokens !== undefined) {
                activeSessions[pin].requestsLeft = data.demo_tokens;
            }
        }
        
        console.log(`[AUTH] Web App paired successfully with PIN: ${pin}`);
        res.json({ success: true });
    } else { 
        res.status(400).json({ success: false, error: "Invalid or expired PIN." }); 
    }
});

app.get('/api/select-script', (req, res) => {
    const { pin } = req.query;
    if (activeSessions[pin] && activeSessions[pin].currentScript) {
        const caughtError = activeSessions[pin].lastError || null;
        activeSessions[pin].lastError = null; 
        
        res.json({ 
            source: activeSessions[pin].currentScript, 
            name: activeSessions[pin].currentScriptName || "Studio_Script",
            error: caughtError,
            isDemo: activeSessions[pin].isDemo, 
            requestsLeft: activeSessions[pin].requestsLeft,
            isOutdated: activeSessions[pin].isOutdated,
            pinnedCount: Object.keys(activeSessions[pin].pinnedScripts || {}).length
        });
    } else { res.json({ source: null, error: null }); }
});

app.post('/api/select-script', (req, res) => {
    const { pin, source, script, name, architecture, pinnedScripts, version } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].currentScript = source || script;
        activeSessions[pin].currentScriptName = name;
        if (architecture) activeSessions[pin].architecture = architecture;
        
        activeSessions[pin].pinnedScripts = pinnedScripts || {};
        activeSessions[pin].pluginVersion = version || "1.0.0";
        activeSessions[pin].isOutdated = activeSessions[pin].pluginVersion !== EXPECTED_PLUGIN_VERSION;
        
        res.json({ success: true });
    } else { res.json({ success: false }); }
});

app.post('/api/inject', (req, res) => {
    const { pin, action, files } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].pendingBatch = files; 
        activeSessions[pin].pendingAction = action || "execute_batch"; 
        
        if (action === "execute_batch" && files && files.length > 0) {
            activeSessions[pin].currentScript = files[0].code;
            activeSessions[pin].currentScriptName = files[0].name;
        }
        
        res.json({ success: true });
    } else { res.status(400).json({ success: false, error: "Device not connected." }); }
});

app.post('/api/error', (req, res) => {
    const { pin, error } = req.body;
    if (activeSessions[pin]) {
        activeSessions[pin].lastError = error;
        res.json({ success: true });
    } else { res.json({ success: false }); }
});

// ==========================================
// 3. CHAT HISTORY & WORKSPACE HOOKS
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

app.post('/api/chats/:chatId/persona', async (req, res) => {
    const { persona } = req.body;
    const { error } = await db.from('chats').update({ persona }).eq('id', req.params.chatId);
    res.json({ success: !error });
});

// ==========================================
// 4. THE AI BRAIN (JSON Multi-File Engine)
// ==========================================

// 🚨 SECURE PROMPT ROUTE 🚨
app.post('/api/prompt', requireAuth, async (req, res) => {
    let { prompt, pin, chatId } = req.body;
    const userId = req.userId; // Extracted securely from the token

    if (!activeSessions[pin]) return res.status(400).json({ success: false, error: "Roblox Studio is not connected." });

    const session = activeSessions[pin];

    try {
        const { data: profile, error: profileErr } = await db.from('profiles').select('*').eq('id', userId).single();
        if (profileErr || !profile) return res.status(400).json({ success: false, error: "Database profile not found." });

        let aiClient = baseOpenAI;
        let activeModel = DEFAULT_MODEL;

        if (session.isDemo) {
            let currentDbTokens = profile.demo_tokens !== undefined ? profile.demo_tokens : 20;
            if (currentDbTokens <= 0) return res.status(403).json({ success: false, error: "Demo limit reached! Please purchase the full BloxNexus plugin to continue coding." });
            
            await db.from('profiles').update({ demo_tokens: currentDbTokens - 1 }).eq('id', userId);
            session.requestsLeft = currentDbTokens - 1; 
            activeModel = DEFAULT_MODEL; 
            console.log(`[DEMO] PIN ${pin} (User ${userId}) has ${session.requestsLeft} requests left.`);
        } else {
            if (profile.preferred_model === 'byok' && profile.custom_api_key) {
                if (profile.custom_model) activeModel = profile.custom_model;
                aiClient = new OpenAI({ baseURL: 'https://polza.ai/api/v1', apiKey: profile.custom_api_key, timeout: 60000 });
            }
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

        let customPersona = "";
        if (chatId) {
            const { data: chatData } = await db.from('chats').select('persona').eq('id', chatId).single();
            if (chatData && chatData.persona) {
                customPersona = `\n\n=== WORKSPACE PERSONA (CRITICAL OVERRIDE) ===\nThe user has set specific rules for this workspace. You MUST follow them strictly:\n"${chatData.persona}"\n`;
            }
        }

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
    "content": "Write 3-4 sentences explaining what you built and your architectural plan. Speak naturally and directly to the user (e.g., 'I have built a robust system for you...'). NEVER use the phrase 'Chain of thought' or act like a robot reading instructions."
  },
  {
    "type": "file",
    "name": "ModuleName_Or_ScriptName",
    "className": "Script" | "LocalScript" | "ModuleScript", 
    "parent": "ServerScriptService" | "StarterPlayerScripts" | "StarterGui" | "workspace" | "ReplicatedStorage", 
    "code": "-- Your complete, bug-free, fully functional Luau code goes here"
  }
]${customPersona}`;

        const messages = [{ role: 'system', content: systemPrompt }];
        
        if (session.architecture) {
            messages.push({ role: 'system', content: `[SYSTEM CONTEXT: The user's entire game structure is outlined below. Use this to understand where items, remote events, and scripts are located:\n\n${session.architecture}]` });
        }

        if (session.currentScript && session.currentScript.length > 10) {
            messages.push({ role: 'system', content: `[SYSTEM CONTEXT: The user currently has this script open in Studio named '${session.currentScriptName}':]\n\`\`\`lua\n${session.currentScript}\n\`\`\`` });
        }

        if (session.pinnedScripts && Object.keys(session.pinnedScripts).length > 0) {
            let multiContext = "[SYSTEM CONTEXT: The user has PINNED the following background files for you to read and understand. Use these to ensure your code integrates perfectly with their existing systems:]\n\n";
            for (const [scriptName, scriptSource] of Object.entries(session.pinnedScripts)) {
                multiContext += `--- PINNED FILE: ${scriptName} ---\n\`\`\`lua\n${scriptSource}\n\`\`\`\n\n`;
            }
            messages.push({ role: 'system', content: multiContext });
        }

        history.forEach(msg => {
            if (msg.role === 'user') {
                messages.push({ role: 'user', content: msg.content });
            } else {
                let aiContent = msg.content;
                if (msg.code && msg.code.startsWith('[')) { aiContent += `\n${msg.code}`; }
                messages.push({ role: 'assistant', content: aiContent });
            }
        });

        console.log(`[AI] Compiling JSON prompt for ${activeModel}...`);

        const completion = await aiClient.chat.completions.create({
            model: activeModel, 
            messages: messages,
            temperature: 0.2, 
            max_tokens: 8000 
        });

        const rawResponse = completion.choices[0].message.content;
        
        let parsedData = [];
        let chatMessage = "Logic compiled.";
        let files = [];

        try {
            let jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
            
            if (jsonMatch) {
                let cleanJsonStr = jsonMatch[0];
                parsedData = JSON.parse(cleanJsonStr);

                parsedData.forEach(item => {
                    if (item.type === 'message') chatMessage = item.content;
                    else if (item.type === 'file') files.push(item);
                });
            } else if (rawResponse.includes('[{')) {
                throw new Error("TRUNCATED");
            } else {
                throw new Error("NO_JSON");
            }
        } catch (e) {
            if (e.message === "TRUNCATED" || (e instanceof SyntaxError && rawResponse.includes('[{'))) {
                return res.status(500).json({ success: false, error: "The generated code was so massive it hit the AI's physical character limit and got cut off! Try asking for fewer items (e.g. 'give me 10 jokes' instead of 150) or ask it to write the code in smaller parts." });
            }
            console.log("[SERVER] JSON Parse failed, falling back to raw text.");
            chatMessage = rawResponse;
            files = [];
        }

        await db.from('messages').insert({ chat_id: chatId, role: 'ai', content: chatMessage, code: JSON.stringify(files) });
        
        res.json({ success: true, message: chatMessage, files: files, chatId: chatId });

    } catch (err) {
        console.error("[SERVER] Error during prompt execution:", err);
        const errorMessage = err.message || "Unknown API issue.";
        res.status(500).json({ success: false, error: `API Connection Failed: ${errorMessage}` });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Engine Live on port ${PORT}`));
