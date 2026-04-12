require('dotenv').config(); 
const express = require('express');
const cors = require('cors'); 
const app = express();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

app.use(cors({ origin: '*' })); 
app.use(express.json()); 

// --- THE MULTIPLAYER BRAIN ---
// Instead of one global variable, we store a unique "room" for every user.
const sessions = {}; 

// Helper function to get or create a session
function getSession(pin) {
    if (!sessions[pin]) {
        sessions[pin] = {
            pluginData: { action: "execute", code: "" },
            currentWorkspaceContext: "No context synced.",
            activeScriptData: null,
            chatHistory: [],
            isPaired: false // Turns true when the web dashboard claims it
        };
    }
    return sessions[pin];
}

// --- THE HANDSHAKE ROUTES ---

// 1. Roblox Plugin asks for a new PIN when it starts
app.get('/api/generate-pin', (req, res) => {
    // Generate a random 6 digit string (e.g., "492018")
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    getSession(pin); // Initialize the empty room
    console.log(`🔑 New Pairing PIN generated: ${pin}`);
    res.json({ pin: pin });
});

// 2. Web Dashboard claims the PIN to link the accounts
app.post('/api/pair', (req, res) => {
    const { pin } = req.body;
    if (sessions[pin]) {
        sessions[pin].isPaired = true;
        res.json({ success: true, message: "Successfully paired to Roblox Studio!" });
    } else {
        res.json({ success: false, error: "Invalid or expired PIN." });
    }
});


// --- THE AI ROUTES (Now requiring a PIN!) ---

async function askGeminiForCode(userPrompt, pin) {
    const session = getSession(pin);
    console.log(`\n🧠 Prompt from PIN [${pin}]: "${userPrompt}"`);
    
    session.chatHistory.push({ role: "user", parts: [{ text: userPrompt }] });
    
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        let systemRules = "";
        
        if (session.activeScriptData) {
            systemRules = `You are an expert Roblox Lua debugger. The user is currently editing a script named "${session.activeScriptData.name}". 
            Here is the current code inside it:
            ---
            ${session.activeScriptData.source}
            ---
            Fix the bugs or add the features the user requests. Output ONLY the completely rewritten, raw, executable Lua code.`;
        } else {
            systemRules = `You are an expert Roblox Studio Lua code generator. Your ONLY job is to output raw, executable Lua code. Do NOT include markdown blocks. 
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
        
        if (data.error) throw new Error(data.error.message);

        let rawAiCode = data.candidates[0].content.parts[0].text.replace(/```lua/gi, "").replace(/```/g, "").trim();

        session.chatHistory.push({ role: "model", parts: [{ text: rawAiCode }] });

        if (session.activeScriptData) {
            session.pluginData = { action: "edit", code: rawAiCode };
        } else {
            session.pluginData = { action: "execute", code: rawAiCode };
        }
        
        return { success: true, code: rawAiCode };

    } catch (error) {
        session.chatHistory.pop(); 
        return { success: false, error: error.message };
    }
}

// All endpoints now require a "?pin=123456" in the URL or body!
app.get('/code', (req, res) => {
    const pin = req.query.pin;
    if (!pin || !sessions[pin]) return res.json({ action: "execute", code: "" });
    res.json(sessions[pin].pluginData);
});

app.post('/api/prompt', async (req, res) => {
    const { prompt, pin } = req.body;
    if (!prompt || !pin) return res.status(400).json({ error: "Missing prompt or PIN" });
    
    if (prompt.toLowerCase() === "clear") {
        getSession(pin).chatHistory = [];
        return res.json({ success: true, code: "-- Memory wiped." });
    }
    
    const result = await askGeminiForCode(prompt, pin);
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
