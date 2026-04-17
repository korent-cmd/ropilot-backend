<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BloxNexus | Web Engine</title>
    
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath fill='%23818cf8' d='M234.5 5.7c13.9-5 29.1-5 43 0l193.8 70c22.3 8.1 36.7 29.4 36.7 53.1v254c0 23.6-14.4 45-36.7 53.1l-193.8 70c-13.9 5-29.1 5-43 0l-193.8-70C14.4 413.9 0 392.6 0 368.9V114.9c0-23.6 14.4-45 36.7-53.1L230.5 5.7zM256 128l-153.3-55.4L256 17.2l153.3 55.4L256 128zM39.6 146.4l192.4 69.5V474.7L39.6 405.3V146.4zm240.4 69.5l192.4-69.5v258.9L280 474.7V215.9z'/%3E%3C/svg%3E">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/require.js/2.3.6/require.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    
    <style>
        body { background-color: #0d0f12; color: #e2e8f0; font-family: 'Inter', sans-serif; overflow: hidden; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .chat-bubble-user { background: #6366f1; color: white; border-bottom-right-radius: 4px; }
        .chat-bubble-ai { background: #1e293b; color: #cbd5e1; border-bottom-left-radius: 4px; border: 1px solid #334155; }
        .screen { position: absolute; inset: 0; transition: opacity 0.5s ease, transform 0.5s ease; z-index: 10; }
        .hidden-screen { opacity: 0; pointer-events: none; transform: scale(0.95); z-index: 0; }
        .active-screen { opacity: 1; pointer-events: auto; transform: scale(1); z-index: 50; }
        .typing-dot { width: 6px; height: 6px; background: #818cf8; border-radius: 50%; animation: pulse 1.5s infinite ease-in-out; }
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
        .chat-row .delete-btn { opacity: 0; transform: scale(0.9); transition: all 0.2s ease; }
        .chat-row:hover .delete-btn { opacity: 1; transform: scale(1); }
        #appSidebar { transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1); transform-origin: left; }
        .sidebar-closed { width: 0 !important; min-width: 0 !important; opacity: 0; margin-right: 0 !important; border-width: 0 !important; padding: 0 !important; pointer-events: none; transform: translateX(-10px); }
        #editorPanel { transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
        .editor-hidden { flex: 0 0 0 !important; opacity: 0; border: none !important; margin: 0 !important; pointer-events: none; }
    </style>
</head>
<body class="h-screen w-full relative bg-[#0d0f12]">

    <div id="updateBanner" class="hidden absolute top-0 left-0 w-full bg-red-600 text-white text-xs font-bold py-2 px-4 text-center z-[100] shadow-lg flex justify-center items-center gap-2">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>CRITICAL: Your Roblox Plugin is outdated! Please download Version 1.1.0 to prevent AI errors.</span>
    </div>

    <div id="loginScreen" class="screen active-screen flex items-center justify-center bg-[#0d0f12] bg-opacity-95 backdrop-blur-sm">
        <div class="bg-[#161b22] border border-slate-800 p-8 rounded-2xl shadow-2xl w-96 flex flex-col items-center text-center">
            <div class="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mb-4 border border-indigo-500/20"><i class="fa-solid fa-cube text-2xl text-indigo-400"></i></div>
            <h1 class="text-2xl font-bold text-white mb-2">Welcome to BloxNexus</h1>
            <input type="email" id="emailInput" class="w-full bg-[#0d1117] border border-slate-700 rounded-lg py-3 px-4 text-white focus:border-indigo-500 focus:outline-none mb-3" placeholder="Email Address">
            <input type="password" id="passwordInput" class="w-full bg-[#0d1117] border border-slate-700 rounded-lg py-3 px-4 text-white focus:border-indigo-500 focus:outline-none mb-4" placeholder="Password">
            <button id="authBtn" class="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-3 rounded-lg transition-all mb-3">Sign In / Create Account</button>
            <p id="loginMsg" class="text-sm text-slate-400"></p>
        </div>
    </div>

    <div id="authScreen" class="screen hidden-screen flex items-center justify-center bg-[#0d0f12] bg-opacity-95 backdrop-blur-sm">
        <div class="bg-[#161b22] border border-slate-800 p-8 rounded-2xl shadow-2xl w-96 flex flex-col items-center text-center">
            <div class="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mb-4 border border-indigo-500/20"><i class="fa-solid fa-link text-2xl text-indigo-400"></i></div>
            <h1 class="text-2xl font-bold text-white mb-2">Connect Studio</h1>
            <p class="text-sm text-slate-400 mb-6">Enter the 6-digit code displayed in your Roblox plugin to pair this session.</p>
            <input type="text" id="pinInput" maxlength="6" class="w-full bg-[#0d1117] border border-slate-700 rounded-lg py-3 px-4 text-center text-2xl tracking-widest text-white font-mono focus:border-indigo-500 focus:outline-none mb-4" placeholder="••••••">
            <button id="connectBtn" class="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-3 rounded-lg transition-all flex justify-center items-center gap-2"><span>Pair Device</span></button>
            <p id="authError" class="text-red-400 text-sm mt-3 hidden"></p>
        </div>
    </div>

    <div id="ideScreen" class="screen hidden-screen h-full w-full flex p-4 gap-4 pt-10">
        <div id="appSidebar" class="w-64 flex flex-col bg-[#161b22] rounded-xl border border-slate-800 shadow-2xl overflow-hidden shrink-0">
            <div class="p-4 border-b border-slate-800 flex items-center justify-between">
                <h2 class="text-white font-bold text-sm tracking-wide whitespace-nowrap">Workspaces</h2>
                <button id="newChatBtn" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 shrink-0"><i class="fa-solid fa-plus"></i> New</button>
            </div>
            <div id="chatSidebarList" class="flex-1 overflow-y-auto p-2 space-y-1"></div>
            <div class="p-4 border-t border-slate-800 bg-[#0d1117] flex flex-col gap-3 shrink-0">
                <div class="flex items-center gap-3">
                    <div id="userAvatar" class="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/20 shrink-0">U</div>
                    <div class="flex-1 truncate">
                        <div id="userEmailDisplay" class="text-xs text-white font-medium truncate">user@email.com</div>
                        <div class="text-[10px] text-emerald-400 flex items-center gap-1"><div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div> Online</div>
                    </div>
                </div>
                
                <div id="demoTokenContainer" class="hidden flex-col gap-1 mt-1">
                    <div class="flex justify-between text-[9px] font-bold text-amber-400 tracking-wider">
                        <span>DEMO TOKENS</span>
                        <span id="demoTokenCount">10/10</span>
                    </div>
                    <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div id="demoTokenBar" class="bg-amber-400 h-1.5 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" style="width: 100%"></div>
                    </div>
                </div>

                <div class="flex items-center gap-2 pt-2 border-t border-slate-800/50">
                    <button id="openSettingsBtn" class="flex-1 flex items-center justify-center gap-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded transition-colors"><i class="fa-solid fa-gear"></i> Settings</button>
                    <button id="logoutBtn" class="flex-1 flex items-center justify-center gap-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded transition-colors"><i class="fa-solid fa-right-from-bracket"></i> Log Out</button>
                </div>
            </div>
        </div>

        <div id="chatInterface" class="w-[400px] flex flex-col bg-[#161b22] rounded-xl border border-slate-800 shadow-2xl shrink-0 transition-all duration-300">
            <div class="p-4 border-b border-slate-800 flex justify-between items-center bg-[#0d1117] rounded-t-xl">
                <div class="flex items-center gap-3">
                    <button id="toggleSidebarBtn" class="text-slate-400 hover:text-white transition-colors" title="Toggle Projects Menu"><i class="fa-solid fa-bars text-lg"></i></button>
                    <div class="flex items-center gap-1">
                        <div id="badgeContainer" class="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-2 py-1.5 rounded-md border border-emerald-400/20 text-xs font-mono transition-colors">
                            <i class="fa-solid fa-plug text-[10px]"></i> <span id="syncStatus">Unpaired</span>
                        </div>
                        <button id="unpairBtn" class="text-slate-500 hover:text-red-400 hover:bg-red-500/10 px-2 py-1.5 rounded-md transition-all hidden" title="Unpair Device"><i class="fa-solid fa-link-slash text-xs"></i></button>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button id="personaBtn" class="text-xs flex items-center gap-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 px-3 py-1.5 rounded border border-purple-500/30 transition-all hidden"><i class="fa-solid fa-robot"></i> <span>Persona</span></button>
                    <button id="toggleEditorBtn" class="text-xs flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded border border-slate-700 transition-all"><i class="fa-solid fa-code"></i> <span>Hide Code</span></button>
                </div>
            </div>
            
            <div id="chatLog" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4"></div>
            
            <div class="p-4 border-t border-slate-800 bg-[#0d1117] rounded-b-xl flex flex-col gap-2">
                <div id="imagePreviewContainer" class="hidden relative w-16 h-16 rounded-md border border-slate-700 overflow-hidden shadow-lg group">
                    <img id="imagePreview" src="" class="w-full h-full object-cover">
                    <button id="removeImageBtn" class="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><i class="fa-solid fa-xmark"></i></button>
                </div>
                
                <div class="relative flex items-center gap-2">
                    <input type="file" id="imageInput" accept="image/*" class="hidden">
                    <button id="uploadBtn" class="w-10 h-10 shrink-0 flex items-center justify-center bg-[#1c2128] hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors" title="Upload Screenshot"><i class="fa-solid fa-image"></i></button>
                    <textarea id="promptInput" rows="1" class="flex-1 bg-[#1c2128] text-sm text-white rounded-lg py-2.5 px-3 border border-slate-700 focus:border-indigo-500 outline-none resize-none placeholder-slate-500" placeholder="Message BloxNexus..."></textarea>
                    <button id="sendBtn" class="w-10 h-10 shrink-0 flex items-center justify-center bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg transition-colors shadow-lg shadow-indigo-500/20"><i class="fa-solid fa-arrow-up text-sm"></i></button>
                </div>
            </div>
        </div>
        
        <div id="editorPanel" class="flex-1 flex flex-col bg-[#1e1e1e] rounded-xl border border-slate-800 shadow-2xl overflow-hidden relative">
            <div class="h-10 bg-[#161b22] border-b border-slate-800 flex items-center px-4">
                <div class="flex items-center gap-2 text-slate-300 text-xs font-mono"><i class="fa-solid fa-file-code text-indigo-400"></i><span id="editScriptName">AI_Output.lua</span></div>
                <button id="copyCodeBtn" class="ml-auto text-xs flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded border border-slate-700 transition-all"><i class="fa-regular fa-copy"></i> Copy Output</button>
            </div>
            <div id="editor-container" class="flex-1 w-full h-full"></div>
        </div>
    </div>

    <div id="personaModal" class="absolute inset-0 z-[65] flex items-center justify-center bg-[#0d0f12] bg-opacity-80 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300">
        <div class="bg-[#161b22] border border-slate-800 p-6 rounded-2xl shadow-2xl w-[500px]">
            <div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold text-white"><i class="fa-solid fa-robot text-purple-400 mr-2"></i> Custom AI Persona</h2><button id="closePersonaBtn" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></button></div>
            <textarea id="personaInput" rows="4" class="w-full bg-[#0d1117] border border-slate-700 rounded-lg py-3 px-4 text-sm text-white focus:border-purple-500 focus:outline-none mb-4 resize-none" placeholder="Enter custom instructions for this workspace..."></textarea>
            <button id="savePersonaBtn" class="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-purple-900/20">Save Persona</button>
            <p id="personaMsg" class="text-center text-sm text-emerald-400 mt-3 hidden">Persona locked in!</p>
        </div>
    </div>

    <div id="settingsModal" class="absolute inset-0 z-[60] flex items-center justify-center bg-[#0d0f12] bg-opacity-80 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300">
        <div class="bg-[#161b22] border border-slate-800 p-6 rounded-2xl shadow-2xl w-[450px]">
            <div class="flex justify-between items-center mb-6"><h2 class="text-xl font-bold text-white"><i class="fa-solid fa-microchip text-indigo-400 mr-2"></i> Engine Configuration</h2><button id="closeSettingsBtn" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></button></div>
            <div class="space-y-4">
                <label class="flex items-start gap-3 p-4 border border-slate-700 rounded-xl cursor-pointer hover:bg-[#1c2128] transition-colors">
                    <input type="radio" name="aiModel" value="ropilot" checked class="mt-1 text-indigo-500 bg-slate-800">
                    <div><div class="text-white font-semibold">BloxNexus Pro Model <span class="ml-2 text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded border border-purple-500/30">PREMIUM</span></div><div class="text-xs text-slate-400 mt-1">Uses your account's token balance.</div></div>
                </label>
                <label class="flex items-start gap-3 p-4 border border-slate-700 rounded-xl cursor-pointer hover:bg-[#1c2128] transition-colors">
                    <input type="radio" name="aiModel" value="byok" class="mt-1 text-indigo-500 bg-slate-800">
                    <div class="w-full">
                        <div class="text-white font-semibold">Bring Your Own Key <span class="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">UNLIMITED</span></div>
                        <div id="byokInputs" class="hidden flex-col gap-3 mt-3">
                            <input type="password" id="customApiKey" placeholder="sk-..." class="w-full bg-[#0d1117] border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-indigo-500 outline-none">
                            <input type="text" id="customModel" placeholder="Optional Custom Model (e.g. gpt-4o)" class="w-full bg-[#0d1117] border border-slate-700 rounded-lg py-2.5 px-3 text-sm text-white focus:border-indigo-500 outline-none">
                        </div>
                    </div>
                </label>
            </div>
            <button id="saveSettingsBtn" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-all mt-6 shadow-lg shadow-emerald-900/20">Save Configuration</button>
            <p id="settingsMsg" class="text-center text-sm text-emerald-400 mt-3 hidden">Settings Saved!</p>
        </div>
    </div>

    <script>
        const API_URL = 'https://ropilot-engine.onrender.com'; 
        const SUPABASE_URL = 'https://uihfytxdzvbcbqixjpjw.supabase.co'; 
        const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE'; 
        const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        let currentUser = null, activePin = null, currentChatId = null;
        let lastAiCode = "-- BloxNexus Engine Ready.\n-- Waiting for instructions...";
        let isViewingStudioScript = false;

        function showScreen(screenEl) {
            [document.getElementById('loginScreen'), document.getElementById('authScreen'), document.getElementById('ideScreen')].forEach(el => el.classList.replace('active-screen', 'hidden-screen'));
            screenEl.classList.replace('hidden-screen', 'active-screen');
        }

        document.getElementById('toggleSidebarBtn').addEventListener('click', () => { document.getElementById('appSidebar').classList.toggle('sidebar-closed'); });
        document.getElementById('toggleEditorBtn').addEventListener('click', (e) => {
            const panel = document.getElementById('editorPanel'), chat = document.getElementById('chatInterface'), btnSpan = e.currentTarget.querySelector('span');
            if(panel.classList.contains('editor-hidden')) { panel.classList.remove('editor-hidden'); chat.classList.remove('flex-1'); chat.classList.add('w-[400px]'); btnSpan.innerText = "Hide Code"; } 
            else { panel.classList.add('editor-hidden'); chat.classList.remove('w-[400px]'); chat.classList.add('flex-1'); btnSpan.innerText = "Show Code"; }
        });

        const settingsModal = document.getElementById('settingsModal'), byokInputs = document.getElementById('byokInputs');
        document.querySelectorAll('input[name="aiModel"]').forEach(radio => radio.addEventListener('change', (e) => e.target.value === 'byok' ? byokInputs.classList.remove('hidden') : byokInputs.classList.add('hidden')));

        document.getElementById('openSettingsBtn').addEventListener('click', async () => {
            if(!currentUser) return;
            settingsModal.classList.remove('opacity-0', 'pointer-events-none');
            document.getElementById('settingsMsg').classList.add('hidden');
            const { data } = await db.from('profiles').select('preferred_model, custom_api_key, custom_model').eq('id', currentUser.id).single();
            if(data) {
                if(data.preferred_model === 'byok') { document.querySelector('input[value="byok"]').checked = true; byokInputs.classList.remove('hidden'); } 
                else { document.querySelector('input[value="ropilot"]').checked = true; byokInputs.classList.add('hidden'); }
                if(data.custom_api_key) document.getElementById('customApiKey').value = data.custom_api_key;
                if(data.custom_model) document.getElementById('customModel').value = data.custom_model;
            }
        });

        document.getElementById('closeSettingsBtn').addEventListener('click', () => settingsModal.classList.add('opacity-0', 'pointer-events-none'));
        document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
            const btn = document.getElementById('saveSettingsBtn'); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            await db.from('profiles').upsert({ id: currentUser.id, preferred_model: document.querySelector('input[name="aiModel"]:checked').value, custom_api_key: document.getElementById('customApiKey').value.trim() || null, custom_model: document.getElementById('customModel').value.trim() || null });
            btn.innerHTML = 'Save Configuration'; document.getElementById('settingsMsg').classList.remove('hidden');
            setTimeout(() => settingsModal.classList.add('opacity-0', 'pointer-events-none'), 1000);
        });

        document.getElementById('personaBtn').addEventListener('click', async () => {
            if(!currentChatId) return;
            const { data } = await db.from('chats').select('persona').eq('id', currentChatId).single();
            document.getElementById('personaInput').value = data?.persona || "";
            document.getElementById('personaModal').classList.remove('opacity-0', 'pointer-events-none');
            document.getElementById('personaMsg').classList.add('hidden');
        });
        document.getElementById('closePersonaBtn').addEventListener('click', () => document.getElementById('personaModal').classList.add('opacity-0', 'pointer-events-none'));
        document.getElementById('savePersonaBtn').addEventListener('click', async () => {
            await fetch(`${API_URL}/api/chats/${currentChatId}/persona`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: document.getElementById('personaInput').value.trim() }) });
            document.getElementById('personaMsg').classList.remove('hidden'); setTimeout(() => document.getElementById('personaModal').classList.add('opacity-0', 'pointer-events-none'), 1200);
        });

        document.getElementById('authBtn').addEventListener('click', async () => {
            const email = document.getElementById('emailInput').value, password = document.getElementById('passwordInput').value;
            let { data, error } = await db.auth.signInWithPassword({ email, password });
            if (error && error.message.includes("Invalid login")) { const res = await db.auth.signUp({ email, password }); data = res.data; error = res.error; }
            if (!error) { currentUser = data.user; setupUserProfile(); checkUserPin(); }
        });

        function setupUserProfile() {
            if(!currentUser) return;
            document.getElementById('userEmailDisplay').innerText = currentUser.email; document.getElementById('userAvatar').innerText = currentUser.email.charAt(0).toUpperCase();
        }

        let isPairing = false;
        async function checkUserPin() {
            if (isPairing) return; isPairing = true;
            const { data } = await db.from('profiles').select('roblox_pin').eq('id', currentUser.id).single();
            if (data && data.roblox_pin) {
                activePin = data.roblox_pin; document.getElementById('syncStatus').innerHTML = `PIN: ${activePin}`; document.getElementById('unpairBtn').classList.remove('hidden');
                try {
                    const { data: authData } = await db.auth.getSession();
                    const res = await fetch(`${API_URL}/api/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authData.session?.access_token}` }, body: JSON.stringify({ pin: activePin }) });
                    if ((await res.json()).success) { showScreen(document.getElementById('ideScreen')); loadChats(); } 
                    else { await db.from('profiles').update({ roblox_pin: null }).eq('id', currentUser.id); activePin = null; showScreen(document.getElementById('authScreen')); }
                } catch(e) { showScreen(document.getElementById('ideScreen')); loadChats(); }
            } else { showScreen(document.getElementById('authScreen')); }
            isPairing = false;
        }

        document.getElementById('connectBtn').addEventListener('click', async () => {
            const pin = document.getElementById('pinInput').value.trim();
            const { data: authData } = await db.auth.getSession();
            const res = await fetch(`${API_URL}/api/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authData.session?.access_token}` }, body: JSON.stringify({ pin: pin }) });
            if ((await res.json()).success) { 
                await db.from('profiles').update({ roblox_pin: pin }).eq('id', currentUser.id); activePin = pin; 
                document.getElementById('syncStatus').innerHTML = `PIN: ${activePin}`; document.getElementById('unpairBtn').classList.remove('hidden');
                showScreen(document.getElementById('ideScreen')); loadChats(); 
            }
        });

        document.getElementById('unpairBtn').addEventListener('click', async () => {
            if (!currentUser) return; await db.from('profiles').update({ roblox_pin: null }).eq('id', currentUser.id);
            activePin = null; document.getElementById('pinInput').value = ''; document.getElementById('syncStatus').innerHTML = 'Unpaired'; 
            document.getElementById('unpairBtn').classList.add('hidden'); document.getElementById('demoTokenContainer').classList.add('hidden'); document.getElementById('demoTokenContainer').classList.remove('flex');
            showScreen(document.getElementById('authScreen'));
        });

        document.getElementById('logoutBtn').addEventListener('click', async () => { await db.auth.signOut(); window.location.reload(); });
        db.auth.getSession().then(({ data: { session } }) => { if (session) { currentUser = session.user; setupUserProfile(); checkUserPin(); } });

        async function loadChats() {
            const res = await fetch(`${API_URL}/api/chats/${currentUser.id}`); const data = await res.json();
            const list = document.getElementById('chatSidebarList'); list.innerHTML = '';
            data.chats.forEach(chat => {
                const row = document.createElement('div');
                row.className = `chat-row flex items-center justify-between px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors ${chat.id === currentChatId ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-300 hover:bg-[#1c2128] border border-transparent'}`;
                const titleSpan = document.createElement('span'); titleSpan.className = "truncate flex-1"; titleSpan.innerText = chat.title; titleSpan.onclick = () => selectChat(chat.id);
                const delBtn = document.createElement('button'); delBtn.className = "delete-btn ml-2 text-slate-500 hover:text-red-400 p-1"; delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                delBtn.onclick = async (e) => { e.stopPropagation(); await fetch(`${API_URL}/api/chats/${chat.id}`, { method: 'DELETE' }); if(currentChatId === chat.id) startNewChat(); loadChats(); };
                row.appendChild(titleSpan); row.appendChild(delBtn); list.appendChild(row);
            });
            if (data.chats.length === 0 && !currentChatId) startNewChat();
        }

        function startNewChat() {
            currentChatId = null; document.getElementById('personaBtn').classList.add('hidden');
            document.getElementById('chatLog').innerHTML = `<div class="flex flex-col items-center justify-center h-full text-slate-500 gap-3"><div class="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center"><i class="fa-solid fa-wand-magic-sparkles text-xl"></i></div><p class="text-sm">Start a new workspace</p></div>`;
            if (window.editor) window.editor.setValue(lastAiCode);
            document.querySelectorAll('.chat-row').forEach(el => { el.classList.remove('bg-indigo-600/20', 'text-indigo-400', 'border-indigo-500/30'); el.classList.add('text-slate-300', 'border-transparent'); });
        }
        document.getElementById('newChatBtn').addEventListener('click', startNewChat);

        async function selectChat(chatId) {
            currentChatId = chatId; loadChats(); document.getElementById('personaBtn').classList.remove('hidden'); 
            document.getElementById('chatLog').innerHTML = `<div class="animate-pulse flex flex-col gap-4 w-full"><div class="h-10 bg-slate-800 rounded-2xl w-3/4 self-end"></div><div class="h-20 bg-slate-800 rounded-2xl w-3/4 self-start"></div></div>`;
            const data = await (await fetch(`${API_URL}/api/messages/${chatId}`)).json();
            document.getElementById('chatLog').innerHTML = '';
            data.messages.forEach(msg => {
                let batchData = null; if (msg.role === 'ai' && msg.code && msg.code.startsWith('[')) { try { batchData = JSON.parse(msg.code); } catch(e) {} }
                appendMessage(msg.role, msg.content, batchData);
            });
        }

        // 🚨 IMAGE INJECTION ENSURED 🚨
        function appendMessage(sender, text, batch, customId = null, imageUrl = null) {
            const wrapper = document.createElement('div');
            if (customId) wrapper.id = customId;
            wrapper.className = sender === 'user' ? 'flex flex-col w-full items-end' : 'flex flex-col w-full items-start';
            
            const inner = document.createElement('div');
            inner.className = sender === 'user' ? 'chat-bubble-user p-3 rounded-2xl text-sm w-fit max-w-[90%] whitespace-pre-wrap leading-relaxed' : 'chat-bubble-ai p-3 rounded-2xl text-sm w-full max-w-[95%] whitespace-pre-wrap leading-relaxed shadow-md shadow-black/20';

            // Explicitly render uploaded image to chat bubble
            if (sender === 'user' && imageUrl) {
                const img = document.createElement('img');
                img.src = imageUrl;
                img.className = 'max-w-full w-48 h-auto rounded-lg mb-3 border border-indigo-400/30 shadow-md object-cover';
                inner.appendChild(img);
            }

            const textSpan = document.createElement('span');
            textSpan.innerText = text ? text.replace(/^(CHAIN OF THOUGHT:?\s*)/i, '').trim() : '';
            if (sender === 'ai' && customId) textSpan.id = customId + '-text';
            inner.appendChild(textSpan);

            if (sender === 'ai' && batch && batch.length > 0) {
                const batchContainer = document.createElement('div');
                batchContainer.className = "mt-4 flex flex-col gap-2 pt-3 border-t border-slate-700/50";
                batch.forEach(f => {
                    const icon = f.className === "LocalScript" ? "fa-desktop text-blue-400" : (f.className === "ModuleScript" ? "fa-cube text-purple-400" : "fa-server text-emerald-400");
                    batchContainer.innerHTML += `<div class="flex items-center gap-2 bg-[#0d1117] border border-slate-700 p-2.5 rounded-lg text-xs font-mono text-slate-300 shadow-inner"><i class="fa-solid ${icon}"></i> <span class="font-bold text-white">${f.name}.lua</span> <span class="text-[10px] text-slate-500 ml-auto bg-slate-800 px-1.5 py-0.5 rounded">${f.parent}</span></div>`;
                });
                
                const revertBtn = document.createElement('button');
                revertBtn.className = "mt-2 w-full flex items-center justify-center gap-2 text-xs font-bold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500 py-2.5 rounded-lg border border-rose-500/20 hover:border-rose-500 transition-all shadow-lg shadow-rose-900/20";
                revertBtn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Revert Studio Changes';
                revertBtn.onclick = async () => {
                    revertBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reverting...';
                    await fetch(`${API_URL}/api/inject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: activePin, action: "revert", files: batch }) });
                    setTimeout(() => { revertBtn.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i> Code Trashed'; revertBtn.className = "mt-2 w-full flex items-center justify-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 py-2.5 rounded-lg border border-emerald-500/30 transition-all"; }, 1000);
                };
                batchContainer.appendChild(revertBtn); inner.appendChild(batchContainer);
            }
            wrapper.appendChild(inner); document.getElementById('chatLog').appendChild(wrapper); document.getElementById('chatLog').scrollTop = document.getElementById('chatLog').scrollHeight;
        }

        // IMAGE UPLOAD WITH COMPRESSION
        let currentBase64Image = null;
        document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('imageInput').click());
        document.getElementById('imageInput').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height;
                    if (width > 1024) { height *= 1024 / width; width = 1024; }
                    canvas.width = width; canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    currentBase64Image = canvas.toDataURL('image/jpeg', 0.8);
                    document.getElementById('imagePreview').src = currentBase64Image;
                    document.getElementById('imagePreviewContainer').classList.remove('hidden');
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });

        document.getElementById('removeImageBtn').addEventListener('click', () => {
            currentBase64Image = null; document.getElementById('imagePreviewContainer').classList.add('hidden'); document.getElementById('imageInput').value = '';
        });

        // 🚨 MAIN STREAMING SEND LOGIC (WITH EXPLICIT THROW TO BREAK LOOP)
        document.getElementById('sendBtn').addEventListener('click', async () => {
            const prompt = document.getElementById('promptInput').value.trim();
            if (!prompt && !currentBase64Image) return; 
            if (!activePin) return;
            
            document.getElementById('promptInput').value = ''; 
            document.getElementById('sendBtn').disabled = true;

            const imageToSend = currentBase64Image;
            appendMessage('user', prompt || "Attached a screenshot.", null, null, imageToSend);
            if (currentBase64Image) document.getElementById('removeImageBtn').click(); 

            const streamId = 'stream-' + Date.now();
            appendMessage('ai', '...', null, streamId);
            document.getElementById('chatLog').scrollTop = document.getElementById('chatLog').scrollHeight;

            try {
                const { data: authData } = await db.auth.getSession();
                const res = await fetch(`${API_URL}/api/prompt`, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authData.session?.access_token}` },
                    body: JSON.stringify({ prompt, pin: activePin, chatId: currentChatId, imageBase64: imageToSend }) 
                });
                
                if (!res.ok) throw new Error("HTTP " + res.status + " - Server Rejected Connection");

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let aiText = "", buffer = "";
                const textContainer = document.getElementById(streamId + '-text');

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); 

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const payload = line.slice(6).trim();
                            if (payload === '[DONE]') continue;
                            try {
                                const data = JSON.parse(payload);
                                
                                // 🚨 EXPLICIT THROW: Breaks entirely out of the stream loop to the catch block
                                if (data.error) throw new Error(data.error);

                                if (data.chunk) {
                                    aiText += data.chunk;
                                    let display = aiText.split(/\[\s*\{/)[0].replace(/^(CHAIN OF THOUGHT:?\s*)/i, '').trim();
                                    textContainer.innerText = display || "Thinking...";
                                    document.getElementById('chatLog').scrollTop = document.getElementById('chatLog').scrollHeight;
                                }

                                if (data.done) {
                                    if (!currentChatId) { currentChatId = data.chatId; loadChats(); document.getElementById('personaBtn').classList.remove('hidden'); }
                                    document.getElementById(streamId).remove();
                                    appendMessage('ai', data.finalMessage, data.files);
                                    if (data.files && data.files.length > 0) {
                                        lastAiCode = data.files[0].code;
                                        await fetch(`${API_URL}/api/inject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: activePin, action: "execute_batch", files: data.files }) });
                                        if (window.editor && !isViewingStudioScript) window.editor.setValue(lastAiCode);
                                    }
                                }
                            } catch(e) {
                                // If the throw above triggers, re-throw it so the outer catch block grabs it!
                                if (e.message !== "Unexpected end of JSON input") throw e;
                            } 
                        }
                    }
                }
            } catch (err) {
                console.error(err);
                document.getElementById(streamId + '-text').innerText = "Error: " + err.message;
            } finally { document.getElementById('sendBtn').disabled = false; }
        });
        
        document.getElementById('promptInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('sendBtn').click(); } });
        document.getElementById('copyCodeBtn').addEventListener('click', () => { if (window.editor) navigator.clipboard.writeText(window.editor.getValue()); });

        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' }});
        require(['vs/editor/editor.main'], function() {
            window.editor = monaco.editor.create(document.getElementById('editor-container'), { value: lastAiCode, language: 'lua', theme: 'vs-dark', automaticLayout: true, minimap: { enabled: false } });
        });
        
        let lastErrorHandled = "";

        // SYNC LOOP & AUTO-FIX
        setInterval(async () => {
            if (!activePin) return; 
            try {
                const res = await fetch(`${API_URL}/api/select-script?pin=${activePin}`);
                const data = await res.json();
                const tabName = document.getElementById('editScriptName');
                
                if (data.name && data.source) {
                    tabName.innerText = data.name + ".lua" + (data.pinnedCount > 0 ? ` (+${data.pinnedCount} Pinned)` : ""); 
                    tabName.classList.add("text-purple-400"); tabName.classList.remove("text-slate-400");
                    isViewingStudioScript = true;
                    if (window.editor && window.editor.getValue() !== data.source) window.editor.setValue(data.source);
                } else { 
                    tabName.innerText = "AI_Output.lua"; tabName.classList.remove("text-purple-400"); tabName.classList.add("text-slate-400"); 
                    if (isViewingStudioScript) { isViewingStudioScript = false; if (window.editor) window.editor.setValue(lastAiCode); }
                }

                if (data.isOutdated) document.getElementById('updateBanner').classList.remove('hidden');
                else document.getElementById('updateBanner').classList.add('hidden');

                if (data.isDemo !== undefined) {
                    const syncStatus = document.getElementById('syncStatus'), badgeContainer = document.getElementById('badgeContainer'), tokenContainer = document.getElementById('demoTokenContainer');
                    if (data.isDemo) {
                        syncStatus.innerHTML = `DEMO MODE: ${data.requestsLeft} Left`;
                        syncStatus.classList.remove("text-emerald-400"); syncStatus.classList.add("text-amber-400");
                        badgeContainer.classList.remove("bg-emerald-400/10", "border-emerald-400/20", "text-emerald-400"); badgeContainer.classList.add("bg-amber-400/10", "border-amber-400/20", "text-amber-400");
                        tokenContainer.classList.remove('hidden'); tokenContainer.classList.add('flex');
                        document.getElementById('demoTokenCount').innerText = `${data.requestsLeft}/10`; 
                        const pct = Math.max(0, (data.requestsLeft / 10) * 100); document.getElementById('demoTokenBar').style.width = `${pct}%`;
                    } else {
                        syncStatus.innerHTML = `PIN: ${activePin}`;
                        syncStatus.classList.remove("text-amber-400"); syncStatus.classList.add("text-emerald-400");
                        badgeContainer.classList.remove("bg-amber-400/10", "border-amber-400/20", "text-amber-400"); badgeContainer.classList.add("bg-emerald-400/10", "border-emerald-400/20", "text-emerald-400");
                        tokenContainer.classList.add('hidden'); tokenContainer.classList.remove('flex');
                    }
                }

                if (data.error && data.error !== lastErrorHandled && currentChatId) {
                    lastErrorHandled = data.error;
                    const wrapper = document.createElement('div');
                    wrapper.className = 'flex flex-col w-full items-center my-2';
                    wrapper.innerHTML = `
                        <div class="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl w-[95%] shadow-lg shadow-rose-900/20">
                            <div class="flex items-center gap-2 text-rose-400 font-bold text-xs mb-2"><i class="fa-solid fa-triangle-exclamation animate-pulse"></i> Roblox Studio Error Intercepted</div>
                            <div class="bg-[#0d1117] p-2 rounded border border-rose-500/20 text-slate-300 font-mono text-[10px] break-words whitespace-pre-wrap max-h-32 overflow-y-auto mb-3">${data.error}</div>
                            <button class="auto-fix-btn w-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-2 rounded-lg transition-all shadow-md shadow-rose-900/40"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i> Auto-Fix Code</button>
                        </div>
                    `;
                    
                    wrapper.querySelector('.auto-fix-btn').onclick = async () => {
                        const hiddenSystemPrompt = `[SYSTEM AUTOMATION]: An execution error was intercepted in the Roblox Studio environment.\n\nERROR LOG:\n\`${data.error}\`\n\nAnalyze this error, explain the failure point, and provide the fully corrected script.`;
                        appendMessage('user', "🔧 Analyzing Studio Error...");
                        wrapper.style.opacity = '0.5'; wrapper.querySelector('.auto-fix-btn').disabled = true;

                        const streamId = 'stream-' + Date.now();
                        appendMessage('ai', '...', null, streamId);
                        document.getElementById('chatLog').scrollTop = document.getElementById('chatLog').scrollHeight;

                        try {
                            const { data: authData } = await db.auth.getSession();
                            const res = await fetch(`${API_URL}/api/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authData.session?.access_token}` }, body: JSON.stringify({ prompt: hiddenSystemPrompt, pin: activePin, chatId: currentChatId }) });
                            if (!res.ok) throw new Error("HTTP " + res.status + " - Server Rejected Connection");
                            const reader = res.body.getReader(); const decoder = new TextDecoder();
                            let aiText = "", buffer = ""; const textContainer = document.getElementById(streamId + '-text');

                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop(); 
                                for (const line of lines) {
                                    if (line.startsWith('data: ')) {
                                        const payload = line.slice(6).trim(); if (payload === '[DONE]') continue;
                                        try {
                                            const data = JSON.parse(payload);
                                            if (data.error) throw new Error(data.error);
                                            if (data.chunk) { aiText += data.chunk; textContainer.innerText = aiText.split(/\[\s*\{/)[0].replace(/^(CHAIN OF THOUGHT:?\s*)/i, '').trim() || "Thinking..."; document.getElementById('chatLog').scrollTop = document.getElementById('chatLog').scrollHeight; }
                                            if (data.done) {
                                                document.getElementById(streamId).remove(); appendMessage('ai', data.finalMessage, data.files);
                                                if (data.files && data.files.length > 0) { lastAiCode = data.files[0].code; await fetch(`${API_URL}/api/inject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: activePin, action: "execute_batch", files: data.files }) }); if (window.editor && !isViewingStudioScript) window.editor.setValue(lastAiCode); }
                                            }
                                        } catch(e) { if (e.message !== "Unexpected end of JSON input") throw e; } 
                                    }
                                }
                            }
                        } catch (err) { console.error(err); document.getElementById(streamId + '-text').innerText = "Error: " + err.message; }
                    };
                    document.getElementById('chatLog').appendChild(wrapper); document.getElementById('chatLog').scrollTop = document.getElementById('chatLog').scrollHeight;
                }
            } catch (e) {}
        }, 1500);
    </script>
</body>
</html>
