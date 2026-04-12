require('dotenv').config(); 
const express = require('express');
const cors = require('cors'); 
const app = express();

// --- CONFIGURATION ---
// Pulls the key securely from Render's environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

let pluginData = { action: "execute", code: "" };
let currentWorkspaceContext = "No context synced yet. The workspace is unknown.";
let activeScriptData = null; 
let chatHistory = []; 

// Open CORS so your Vercel frontend can talk to this Render backend
app.use(cors({ origin: '*' })); 
app.use(express.json()); 

// --- THE AI BRAIN (GEMINI) ---
async function askGeminiForCode(userPrompt) {
  console.log(`\n?? RoPilot Prompt: "${userPrompt}"`);
  
  chatHistory.push({ role: "user", parts: [{ text: userPrompt }] });
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    let systemRules = "";
    
    if (activeScriptData) {
      systemRules = `You are an expert Roblox Lua debugger. The user is currently editing a script named "${activeScriptData.name}". 
      Here is the current code inside it:
      ---
      ${activeScriptData.source}
      ---
      Fix the bugs or add the features the user requests. 
      Output ONLY the completely rewritten, raw, executable Lua code. Do not include markdown blocks. Do not explain the code.`;
    } else {
      systemRules = `You are an expert Roblox Studio Lua code generator. Your ONLY job is to output raw, executable Lua code. 
      Do NOT include markdown blocks. 
      CRITICAL RULES: 
      1. ALWAYS start with a print() statement announcing what you built or modified.
      2. Use Instance.new() to build static objects.
      3. Enum.PartType.Ball for spheres. 
      4. NEVER write infinite 'while true do' loops directly in the main code.
      5. For loops/behavior, use Instance.new("Script"), set its .Source, and parent it.
      6. If a script controls core game logic, parent it to game.ServerScriptService.
      7. SAFE DELETION: Attach an Instance.new("Highlight") colored Red named "AITarget", print a warning, wait for "confirm" to :Destroy().
      
      CURRENT ROBLOX GAME STATE:
      ${currentWorkspaceContext}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemRules }] },
        contents: chatHistory 
      })
    });

    const data = await response.json();
    
    if (data.error) {
        chatHistory.pop(); 
        throw new Error(data.error.message);
    }

    let rawAiCode = data.candidates[0].content.parts[0].text;
    rawAiCode = rawAiCode.replace(/```lua/gi, "").replace(/```/g, "").trim();

    chatHistory.push({ role: "model", parts: [{ text: rawAiCode }] });

    if (activeScriptData) {
      pluginData = { action: "edit", code: rawAiCode };
      console.log(`? Patch written for script: ${activeScriptData.name}`);
    } else {
      pluginData = { action: "execute", code: rawAiCode };
      console.log("? New code staged for Roblox!");
    }
    
    return { success: true, code: rawAiCode };

  } catch (error) {
    console.log("? Error:", error.message);
    return { success: false, error: error.message };
  }
}

// --- WEB API ROUTES ---
app.get('/code', (req, res) => res.json(pluginData));

app.post('/api/prompt', async (req, res) => {
  const prompt = req.body.prompt;
  if (!prompt) return res.status(400).json({ error: "No prompt provided" });
  
  if (prompt.toLowerCase() === "clear") {
      chatHistory = [];
      return res.json({ success: true, code: "-- Memory wiped. Starting fresh!" });
  }
  
  const result = await askGeminiForCode(prompt);
  res.json(result);
});

app.post('/api/context', (req, res) => {
  if (req.body && req.body.context) {
    currentWorkspaceContext = req.body.context;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "No context provided" });
  }
});

app.post('/api/select-script', (req, res) => {
  if (req.body && req.body.name) {
    activeScriptData = req.body;
  } else {
    activeScriptData = null;
  }
  res.json({ success: true });
});

app.get('/api/select-script', (req, res) => {
  res.json(activeScriptData || { name: null });
});

// --- START UP ---
// Cloud hosts (like Render) assign their own ports dynamically using process.env.PORT
const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => {
  console.log("====================================");
  console.log(`?? RoPilot Cloud Engine LIVE on port ${PORT}!`);
  console.log("====================================");
});