require('dotenv').config(); 
const express = require('express');
const cors = require('cors'); 
const app = express();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

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

// --- THE AI ROUTES (Dual-Output JSON) ---
async function askGeminiForCode(userPrompt, pin) {
    const session = getSession(pin);
    console.log(`\n🧠 Prompt from PIN [${pin}]: "${userPrompt}"`);
    
    session.chatHistory.push({ role: "user", parts: [{ text: userPrompt }] });
    
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
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
            Do not include markdown code blocks (like \`\`\`json). Just the raw JSON object.`;
        } else {
            systemRules = `You are an expert Roblox Studio Lua code generator.
            CRITICAL RULE: You MUST respond strictly in valid JSON format like this:
            {
              "message": "A short, friendly explanation of what you just built and parented.",
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
        if (data.error) throw new Error(data.error.message);

        // Parse the dual-output JSON
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
        console.log("❌ Error formatting JSON:", error.message);
        return { success: false, error: "AI failed to format response correctly. Try again." };
    }
}

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
        return res.json({ success: true, message: "Memory wiped. I am a blank slate.", code: "-- Memory cleared." });
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
