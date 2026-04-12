require('dotenv').config(); 
const express = require('express');
const cors = require('cors'); 
const { createClient } = require('@supabase/supabase-js');
const app = express();

// --- THE MASTER KEYS ---
const MASTER_GEMINI_KEY = process.env.GEMINI_API_KEY; // Your key (stored securely in Render)
const SUPABASE_URL = 'https://uihfytxdzvbcbqixjpjw.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpaGZ5dHhkenZiY2JxaXhqcGp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Nzk2NDcsImV4cCI6MjA5MTU1NTY0N30.X01oTitI8oIRO-CnmqKqnZXTw9Za0tHmvY1QzxaXpAk'; 

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors({ origin: '*' })); 
app.use(express.json()); 

// --- THE MULTIPLAYER BRAIN ---
const sessions = {}; 

function getSession(pin) {
    if (!sessions[pin]) {
        sessions[pin] = {
            pluginData: { action: "execute", code: "" },
            currentWorkspaceContext: "No context synced.",
            activeScriptData: null,
            chatHistory: [],
            isPaired: false 
        };
    }
    return sessions[pin];
}

// --- THE HANDSHAKE ROUTES ---
app.get('/api/generate-pin', (req, res) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    getSession(pin); 
    console.log(`🔑 New Pairing PIN generated: ${pin}`);
    res.json({ pin: pin });
});

app.post('/api/pair', (req, res) => {
    const { pin } = req.body;
    if (sessions[pin]) {
        sessions[pin].isPaired = true;
        res.json({ success: true, message: "Successfully paired to Roblox Studio!" });
    } else {
        res.json({ success: false, error: "Invalid or expired PIN." });
    }
});

// --- THE AI ROUTES (Now with BYOK Support) ---

// Notice we pass the 'activeApiKey' into this function now!
async function askGeminiForCode(userPrompt, pin, activeApiKey) {
    const session = getSession(pin);
    console.log(`\n🧠 Prompt from PIN [${pin}]: "${userPrompt}"`);
    
    session.chatHistory.push({ role: "user", parts: [{ text: userPrompt }] });
    
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeApiKey}`;
        
        let systemRules = "";
        
        if (session.activeScriptData) {
            systemRules = `You are an expert Roblox Lua debugger. The user is currently editing a script named "${session.activeScriptData.name}". 
            Here is the current code:
            ---
            ${session.activeScriptData.source}
            ---
            Fix the bugs or add the features the user requests.
            CRITICAL RULE: You MUST respond strictly in valid JSON format like this:
            {
              "message": "A short, friendly explanation of exactly what lines you changed or fixed.",
              "code": "The completely rewritten, raw, executable Lua code."
            }
            Do not include markdown code blocks.`;
        } else {
            systemRules = `You are an expert Roblox Studio Lua code generator.
            CRITICAL RULE: You MUST respond strictly in valid JSON format like this:
            {
              "message": "A short, friendly explanation of what you just built.",
              "code": "The raw, executable Lua code using Instance.new()."
            }
            Do not include markdown blocks. 
            CURRENT ROBLOX GAME STATE: ${session.currentWorkspaceContext}`;
        }

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemRules }] },
                contents: session.chatHistory 
            })
        });

        const data = await response.json();
        
        // If the user pasted an invalid API key, Gemini will throw an error here.
        if (data.error) {
            session.chatHistory.pop();
            return { success: false, error: "API Error: " + data.error.message };
        }

        let rawAiResponse = data.candidates[0].content.parts[0].text;
        rawAiResponse = rawAiResponse.replace(/```json/gi, "").replace(/```lua/gi, "").replace(/```/g, "").trim();
        
        const parsedResponse = JSON.parse(rawAiResponse);
        const aiMessage = parsedResponse.message;
        const rawAiCode = parsedResponse.code;

        session.chatHistory.push({ role: "model", parts: [{ text: rawAiResponse }] });

        if (session.activeScriptData) {
            session.pluginData = { action: "edit", code: rawAiCode };
        } else {
            session.pluginData = { action: "execute", code: rawAiCode };
        }
        
        return { success: true, code: rawAiCode, message: aiMessage };

    } catch (error) {
        session.chatHistory.pop(); 
        console.log("❌ Error:", error.message);
        return { success: false, error: "AI failed to process request. Check API key or syntax." };
    }
}

app.get('/code', (req, res) => {
    const pin = req.query.pin;
    if (!pin || !sessions[pin]) return res.json({ action: "execute", code: "" });
    res.json(sessions[pin].pluginData);
});

app.post('/api/prompt', async (req, res) => {
    const { prompt, pin, userId } = req.body;
    
    if (!prompt || !pin || !userId) return res.status(400).json({ error: "Missing prompt, PIN, or User ID" });
    
    if (prompt.toLowerCase() === "clear") {
        getSession(pin).chatHistory = [];
        return res.json({ success: true, message: "Memory wiped. I am a blank slate.", code: "-- Memory cleared." });
    }

    // 🚨 THE BRAIN SWITCHER 🚨
    // Fetch the user's settings directly from Supabase
    const { data: profile, error } = await db.from('profiles').select('preferred_model, custom_api_key, is_pro, prompts_used').eq('id', userId).single();
    
    if (error || !profile) return res.status(400).json({ error: "Failed to authenticate user profile." });

    let activeApiKey = MASTER_GEMINI_KEY; 

    if (profile.preferred_model === 'byok') {
        // THEY ARE USING THEIR OWN KEY
        if (!profile.custom_api_key || profile.custom_api_key.trim() === "") {
            return res.json({ success: false, error: "You selected BYOK, but no API key was found in your settings. Please update your settings." });
        }
        activeApiKey = profile.custom_api_key;
        console.log(`🔁 User ${userId} is bypassing the paywall using BYOK.`);
    } else {
        // THEY ARE USING YOUR SERVER'S MONEY
        // Server-side validation of the paywall (hackers can bypass the frontend, but they can't bypass this).
        if (!profile.is_pro && profile.prompts_used >= 10) {
            return res.json({ success: false, error: "Server refused connection: Free Tier Exhausted." });
        }
        console.log(`💰 User ${userId} is using the RoPilot Custom Model.`);
    }
    
    const result = await askGeminiForCode(prompt, pin, activeApiKey);
    res.json(result);
});

app.post('/api/context', (req, res) => {
    const { context, pin } = req.body;
    if (context && pin) {
        getSession(pin).currentWorkspaceContext = context;
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "Missing data" });
    }
});

app.post('/api/select-script', (req, res) => {
    const { name, source, pin } = req.body;
    if (pin) {
        getSession(pin).activeScriptData = name ? { name, source } : null;
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "Missing PIN" });
    }
});

app.get('/api/select-script', (req, res) => {
    const pin = req.query.pin;
    if (!pin || !sessions[pin]) return res.json({ name: null });
    res.json(sessions[pin].activeScriptData || { name: null });
});

const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => {
    console.log("====================================");
    console.log(`🌐 RoPilot MULTIPLAYER Engine LIVE on port ${PORT}!`);
    console.log("====================================");
});
