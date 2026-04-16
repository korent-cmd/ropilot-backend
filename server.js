require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// 🚨 CRITICAL: Increased limit to 50mb to handle large Base64 Image uploads
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// --- SUPABASE SETUP ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// --- IN-MEMORY ENGINE BRIDGE ---
// Stores live Studio context (architecture, memory, errors)
const studioSessions = {}; 
// Stores pending code injections for Studio to pull
const pendingActions = {}; 

// ==========================================
// 1. ROBLOX STUDIO ENDPOINTS
// ==========================================

// Generate a PIN (Studio -> Server)
app.get('/api/generate-pin', (req, res) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const isDemo = req.query.demo === 'true';
    
    studioSessions[pin] = { 
        name: "", 
        source: "", 
        architecture: "", 
        pinnedScripts: {}, 
        isDemo: isDemo,
        requestsLeft: isDemo ? 20 : 9999,
        error: null,
        isOutdated: false
    };
    pendingActions[pin] = { action: 'none', files: null };
    
    res.json({ pin });
});

// Sync Active Script & Architecture (Studio -> Server)
app.post('/api/select-script', (req, res) => {
    const { pin, source, name, architecture, pinnedScripts, version } = req.body;
    if (studioSessions[pin]) {
        studioSessions[pin].source = source;
        studioSessions[pin].name = name;
        studioSessions[pin].architecture = architecture;
        studioSessions[pin].pinnedScripts = pinnedScripts || {};
        
        // Version Control Check
        if (version !== "1.1.0") {
            studioSessions[pin].isOutdated = true;
        } else {
            studioSessions[pin].isOutdated = false;
        }
    }
    res.json({ success: true });
});

// Intercept Errors (Studio -> Server)
app.post('/api/error', (req, res) => {
    const { pin, error } = req.body;
    if (studioSessions[pin]) {
        studioSessions[pin].error = error;
    }
    res.json({ success: true });
});

// Poll for Code Injections (Studio -> Server)
app.get('/code', (req, res) => {
    const pin = req.query.pin;
    if (pendingActions[pin] && pendingActions[pin].action !== 'none') {
        const actionData = pendingActions[pin];
        pendingActions[pin] = { action: 'none', files: null }; // Clear after sending
        return res.json(actionData);
    }
    res.json({ action: 'none' });
});

// ==========================================
// 2. WEB DASHBOARD ENDPOINTS
// ==========================================

// Pair Web App to Studio (Web -> Server)
app.post('/api/pair', async (req, res) => {
    const { pin } = req.body;
    if (studioSessions[pin]) {
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Invalid or expired PIN.' });
    }
});

// Read Live Studio State (Web -> Server)
app.get('/api/select-script', (req, res) => {
    const pin = req.query.pin;
    const session = studioSessions[pin];
    if (session) {
        res.json({ 
            name: session.name, 
            source: session.source,
            pinnedCount: Object.keys(session.pinnedScripts).length,
            isDemo: session.isDemo,
            requestsLeft: session.requestsLeft,
            error: session.error,
            isOutdated: session.isOutdated
        });
    } else {
        res.json({ name: "", source: "" });
    }
});

// Inject Code from Web to Studio (Web -> Server)
app.post('/api/inject', (req, res) => {
    const { pin, action, files } = req.body;
    pendingActions[pin] = { action, files };
    res.json({ success: true });
});

// ==========================================
// 3. CHAT & DATABASE ENDPOINTS
// ==========================================

app.get('/api/chats/:userId', async (req, res) => {
    const { data } = await supabase.from('chats').select('*').eq('user_id', req.params.userId).order('created_at', { ascending: false });
    res.json({ chats: data || [] });
});

app.get('/api/messages/:chatId', async (req, res) => {
    const { data } = await supabase.from('messages').select('*').eq('chat_id', req.params.chatId).order('created_at', { ascending: true });
    res.json({ messages: data || [] });
});

app.delete('/api/chats/:chatId', async (req, res) => {
    await supabase.from('chats').delete().eq('id', req.params.chatId);
    res.json({ success: true });
});

app.post('/api/chats/:chatId/persona', async (req, res) => {
    await supabase.from('chats').update({ persona: req.body.persona }).eq('id', req.params.chatId);
    res.json({ success: true });
});

// ==========================================
// 4. THE AI BRAIN & VISION ENGINE
// ==========================================

app.post('/api/prompt', async (req, res) => {
    let { prompt, pin, chatId, imageBase64 } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    // 1. Auth Check
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // 2. Fetch User Profile for BYOK Settings
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

    const studio = studioSessions[pin];

    // 3. Demo Token Enforcement
    if (studio && studio.isDemo && profile.preferred_model !== 'byok' && studio.requestsLeft <= 0) {
        return res.json({ success: false, error: 'Demo tokens depleted. Upgrade to Pro or use BYOK.' });
    }

    // 4. Initialize Chat Context
    if (!chatId) {
        const title = prompt.length > 30 ? prompt.substring(0, 30) + "..." : prompt;
        const { data: newChat } = await supabase.from('chats').insert({ user_id: user.id, title }).select().single();
        chatId = newChat.id;
    }

    // 5. Save User Prompt
    await supabase.from('messages').insert({ chat_id: chatId, role: 'user', content: prompt });

    // 6. Build the LLM Payload
    const { data: history } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
    
    const messages = [
        { role: 'system', content: `You are BloxNexus, an elite Roblox Luau AI. Provide reasoning, then strictly output a JSON array of files. Format: [{"name": "ScriptName", "className": "Script", "parent": "ServerScriptService", "code": "print('hello')"}]` }
    ];

    // Inject Persona
    const { data: chatData } = await supabase.from('chats').select('persona').eq('id', chatId).single();
    if (chatData?.persona) messages[0].content += `\n\nUSER PERSONA/RULES:\n${chatData.persona}`;

    // Inject Studio Architecture & Memory
    if (studio) {
        messages[0].content += `\n\nCURRENT STUDIO ARCHITECTURE:\n${studio.architecture}`;
        if (studio.pinnedScripts && Object.keys(studio.pinnedScripts).length > 0) {
            messages[0].content += `\n\nPINNED SCRIPTS IN MEMORY:\n`;
            for (const [name, source] of Object.entries(studio.pinnedScripts)) {
                messages[0].content += `--- ${name} ---\n${source}\n`;
            }
        }
    }

    // Inject History
    history.forEach(msg => messages.push({ role: msg.role, content: msg.content }));

    // 🚨 7. THE VISION PIPELINE OVERRIDE 🚨
    if (imageBase64) {
        console.log(`[VISION] Processing Image-to-UI Request for PIN ${pin}`);
        
        const visionDirective = `\n\n[SYSTEM OVERRIDE]: The user has attached an image. Recreate this layout exactly using NATIVE Roblox UI instances (ScreenGui, Frame, TextLabel, TextButton, ScrollingFrame). 
        - DO NOT use external ImageLabels with Asset IDs. 
        - Replicate colors using Color3.fromRGB. 
        - Replicate rounded corners using UICorner.
        - Replicate borders using UIStroke.
        - Use UDim2 for responsive scaling. Return the JSON code block.`;

        // Remove the standard text prompt and replace it with the Multimodal Array
        messages.pop();
        messages.push({
            role: 'user',
            content: [
                { type: "text", text: prompt + visionDirective },
                { type: "image_url", image_url: { url: imageBase64 } }
            ]
        });
    }

    try {
        // 8. Model Routing (BYOK vs Default)
        const apiKey = (profile.preferred_model === 'byok' && profile.custom_api_key) ? profile.custom_api_key : process.env.AI_API_KEY;
        const defaultModel = imageBase64 ? 'gpt-4o' : 'gpt-4-turbo'; // Force 4o for vision capabilities
        const modelName = (profile.preferred_model === 'byok' && profile.custom_model) ? profile.custom_model : defaultModel;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${apiKey}` 
            },
            body: JSON.stringify({
                model: modelName,
                messages: messages,
                temperature: 0.1
            })
        });

        const aiData = await response.json();
        
        if (aiData.error) {
            return res.json({ success: false, error: aiData.error.message || "Invalid API Key or Model." });
        }

        const aiResponse = aiData.choices[0].message.content;

        // 9. Extract the JSON payload from the AI's response
        let codeFiles = [];
        let textResponse = aiResponse;
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        
        if (jsonMatch) {
            try {
                codeFiles = JSON.parse(jsonMatch[0]);
                textResponse = aiResponse.replace(jsonMatch[0], '').trim();
            } catch (e) {
                console.error("JSON Parse failed", e);
            }
        }

        // 10. Save AI Response
        await supabase.from('messages').insert({ chat_id: chatId, role: 'ai', content: textResponse, code: JSON.stringify(codeFiles) });

        // 11. Deduct Token for Demo Users
        if (studio && studio.isDemo && profile.preferred_model !== 'byok') {
            studio.requestsLeft -= 1;
        }

        // Clear error state if this was an auto-fix
        if (studio && studio.error) studio.error = null;

        res.json({ success: true, message: textResponse, files: codeFiles, chatId });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Engine failed to process the request.' });
    }
});

// --- BOOT SEQUENCE ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[BloxNexus Engine] Core Systems Online. Listening on port ${PORT}`);
});
