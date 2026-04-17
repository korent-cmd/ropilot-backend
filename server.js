require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' })); 
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const studioSessions = {}; 
const pendingActions = {}; 

app.get('/api/generate-pin', (req, res) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const isDemo = req.query.demo === 'true';
    studioSessions[pin] = { name: "", source: "", architecture: "", pinnedScripts: {}, isDemo: isDemo, requestsLeft: isDemo ? 10 : 9999, error: null, isOutdated: false };
    pendingActions[pin] = { action: 'none', files: null };
    res.json({ pin });
});

app.post('/api/select-script', (req, res) => {
    const { pin, source, name, architecture, pinnedScripts, version } = req.body;
    if (studioSessions[pin]) {
        studioSessions[pin].source = source; studioSessions[pin].name = name;
        studioSessions[pin].architecture = architecture; studioSessions[pin].pinnedScripts = pinnedScripts || {};
        studioSessions[pin].isOutdated = (version !== "1.1.0");
    }
    res.json({ success: true });
});

app.post('/api/error', (req, res) => {
    const { pin, error } = req.body;
    if (studioSessions[pin]) studioSessions[pin].error = error;
    res.json({ success: true });
});

app.get('/code', (req, res) => {
    const pin = req.query.pin;
    if (pendingActions[pin] && pendingActions[pin].action !== 'none') {
        const actionData = pendingActions[pin];
        pendingActions[pin] = { action: 'none', files: null }; 
        return res.json(actionData);
    }
    res.json({ action: 'none' });
});

app.post('/api/pair', async (req, res) => {
    const { pin } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    if (!studioSessions[pin]) return res.status(400).json({ success: false, error: 'Invalid PIN.' });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        const profile = profileData || {}; 
        if (profile) {
            let tokensUsed = profile.demo_tokens_used || 0;
            let lastReset = profile.last_token_reset ? new Date(profile.last_token_reset) : new Date();
            const now = new Date();
            if (lastReset.getUTCDate() !== now.getUTCDate() || lastReset.getUTCMonth() !== now.getUTCMonth()) {
                tokensUsed = 0;
                await supabase.from('profiles').update({ demo_tokens_used: 0, last_token_reset: now.toISOString() }).eq('id', user.id);
            }
            studioSessions[pin].requestsLeft = 10 - tokensUsed;
        }
    }
    res.json({ success: true });
});

app.get('/api/select-script', (req, res) => {
    const pin = req.query.pin;
    const session = studioSessions[pin];
    if (session) {
        res.json({ name: session.name, source: session.source, pinnedCount: Object.keys(session.pinnedScripts).length, isDemo: session.isDemo, requestsLeft: session.requestsLeft, error: session.error, isOutdated: session.isOutdated });
    } else res.json({ name: "", source: "" });
});

app.post('/api/inject', (req, res) => {
    const { pin, action, files } = req.body;
    pendingActions[pin] = { action, files };
    res.json({ success: true });
});

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
// THE AI BRAIN & VISION ENGINE
// ==========================================
app.post('/api/prompt', async (req, res) => {
    let { prompt, pin, chatId, imageBase64 } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.json({ success: false, error: 'Unauthorized' });

        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        const profile = profileData || {}; 
        const studio = studioSessions[pin];

        let tokensUsed = profile.demo_tokens_used || 0;
        let lastReset = profile.last_token_reset ? new Date(profile.last_token_reset) : new Date();
        const now = new Date();

        if (lastReset.getUTCDate() !== now.getUTCDate() || lastReset.getUTCMonth() !== now.getUTCMonth()) {
            tokensUsed = 0;
            await supabase.from('profiles').update({ demo_tokens_used: 0, last_token_reset: now.toISOString() }).eq('id', user.id);
        }

        if (studio && studio.isDemo && profile.preferred_model !== 'byok') {
            if (tokensUsed >= 10) return res.json({ success: false, error: 'Daily limit of 10 requests reached. Upgrade to Pro or use BYOK.' });
        }

        if (!chatId) {
            const title = prompt.length > 30 ? prompt.substring(0, 30) + "..." : prompt || "UI Generation";
            const { data: newChat } = await supabase.from('chats').insert({ user_id: user.id, title }).select().single();
            chatId = newChat.id;
        }

        await supabase.from('messages').insert({ chat_id: chatId, role: 'user', content: prompt || "Attached a screenshot." });

        const { data: history } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
        const messages = [{ role: 'system', content: `You are BloxNexus, an elite Roblox Luau AI. Provide reasoning, then strictly output a JSON array of files. Format: [{"name": "ScriptName", "className": "Script", "parent": "ServerScriptService", "code": "print('hello')"}]` }];

        const { data: chatData } = await supabase.from('chats').select('persona').eq('id', chatId).single();
        if (chatData?.persona) messages[0].content += `\n\nUSER PERSONA/RULES:\n${chatData.persona}`;

        if (studio) {
            messages[0].content += `\n\nCURRENT STUDIO ARCHITECTURE:\n${studio.architecture}`;
            if (studio.pinnedScripts && Object.keys(studio.pinnedScripts).length > 0) {
                messages[0].content += `\n\nPINNED SCRIPTS IN MEMORY:\n`;
                for (const [name, source] of Object.entries(studio.pinnedScripts)) messages[0].content += `--- ${name} ---\n${source}\n`;
            }
        }

        history.forEach(msg => messages.push({ role: msg.role === 'ai' ? 'assistant' : msg.role, content: msg.content }));

        if (imageBase64) {
            const visionDirective = `\n\n[SYSTEM OVERRIDE]: The user has attached an image. Recreate this layout exactly using NATIVE Roblox UI instances. DO NOT use external ImageLabels with Asset IDs. Replicate colors (Color3), corners (UICorner), and borders (UIStroke). Use UDim2. Return JSON array.`;
            messages.pop();
            messages.push({ role: 'user', content: [{ type: "text", text: prompt + visionDirective }, { type: "image_url", image_url: { url: imageBase64 } }] });
        }

        // 🚨 CUSTOM ENDPOINT ROUTING 🚨
        const apiKey = (profile.preferred_model === 'byok' && profile.custom_api_key) ? profile.custom_api_key : process.env.AI_API_KEY;
        if (!apiKey) return res.json({ success: false, error: "No API Key detected. Please save a valid key in the BYOK settings." });

        // Grab custom base URL, or default to OpenAI
        let baseUrl = (profile.preferred_model === 'byok' && profile.custom_base_url) 
            ? profile.custom_base_url.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '') // Safely format URL
            : 'https://api.openai.com/v1';

        const defaultModel = imageBase64 ? 'gpt-4o' : 'gpt-4-turbo';
        const modelName = (profile.preferred_model === 'byok' && profile.custom_model) ? profile.custom_model : defaultModel;

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: modelName, messages: messages, temperature: 0.1 })
        });

        const aiData = await response.json();
        if (aiData.error) return res.json({ success: false, error: aiData.error.message || "API Error" });

        const fullResponse = aiData.choices[0].message.content;

        let codeFiles = [];
        let textResponse = fullResponse;
        const jsonMatch = fullResponse.match(/\[[\s\S]*\]/);
        
        if (jsonMatch) {
            try {
                codeFiles = JSON.parse(jsonMatch[0]);
                textResponse = fullResponse.replace(jsonMatch[0], '').trim();
            } catch (e) { console.error("JSON Parse failed"); }
        }

        await supabase.from('messages').insert({ chat_id: chatId, role: 'ai', content: textResponse, code: JSON.stringify(codeFiles) });

        if (studio && studio.isDemo && profile.preferred_model !== 'byok') {
            tokensUsed += 1;
            await supabase.from('profiles').update({ demo_tokens_used: tokensUsed }).eq('id', user.id);
            studio.requestsLeft = 10 - tokensUsed; 
        }
        if (studio && studio.error) studio.error = null;

        res.json({ success: true, message: textResponse, files: codeFiles, chatId: chatId });

    } catch (err) {
        console.error("SERVER FAULT:", err);
        res.json({ success: false, error: 'Engine failed to process the request. Check Render logs.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[BloxNexus Engine] Core Systems Online. Listening on port ${PORT}`));
