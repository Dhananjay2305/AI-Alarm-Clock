
// DOM Elements
const currentTimeDisplay = document.getElementById('currentTime');
const dateDisplay = document.getElementById('dateDisplay');
const alarmTimeInput = document.getElementById('alarmTime');
const alarmNoteInput = document.getElementById('alarmNote');
const addAlarmBtn = document.getElementById('addAlarmBtn');
const alarmsList = document.getElementById('alarmsList');
const micBtn = document.getElementById('micBtn');

const ringingOverlay = document.getElementById('ringingOverlay');
const ringingNoteDisplay = document.getElementById('ringingNote');
const stopAlarmBtn = document.getElementById('stopAlarmBtn');
const snoozeAlarmBtn = document.getElementById('snoozeAlarmBtn');

const aiAssistant = document.getElementById('aiAssistant');
const assistantText = document.getElementById('assistantText');

// Top Controls
const settingsBtn = document.getElementById('settingsBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const historyBtn = document.getElementById('historyBtn');
const cloudBtn = document.getElementById('cloudBtn');

// Panels
const settingsPanel = document.getElementById('settingsPanel');
const historyPanel = document.getElementById('historyPanel');
const cloudPanel = document.getElementById('cloudPanel');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const closeCloudBtn = document.getElementById('closeCloudBtn');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Cloud UI
const authContainer = document.getElementById('authContainer');
const syncContainer = document.getElementById('syncContainer');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const logoutBtn = document.getElementById('logoutBtn');
const pushBtn = document.getElementById('pushBtn');
const pullBtn = document.getElementById('pullBtn');
const authMessage = document.getElementById('authMessage');
const userEmailDisplay = document.getElementById('userEmailDisplay');

// Settings Inputs
const voiceSelect = document.getElementById('voiceSelect');
const toneSelect = document.getElementById('toneSelect');

// These are missing in your HTML currently, so keep safe
const rateRange = document.getElementById('rateRange');
const pitchRange = document.getElementById('pitchRange');
const rateValue = document.getElementById('rateValue');
const pitchValue = document.getElementById('pitchValue');

const volumeRange = document.getElementById('volumeRange');
const snoozeDurationSelect = document.getElementById('snoozeDuration');
const volumeValue = document.getElementById('volumeValue');
const testVoiceBtn = document.getElementById('testVoiceBtn');
const colorBtns = document.querySelectorAll('.color-btn');

// Variables
let alarms = [];
let historyLogs = [];
let audioContext = null;
let oscillator = null;
let gainNode = null;
let alarmInterval = null;
let activeAlarmId = null;
let voices = [];
let recognition = null;

// Defaults
let appSettings = {
    voiceURI: null,
    rate: 1,
    pitch: 1,
    tone: 'sine',
    volume: 0.5,
    snoozeMinutes: 5,
    theme: 'dark',
    accentColor: '#00d2ff'
};

// --- Initialization ---
function init() {
    loadSettings();
    applyTheme();
    applyAccentColor();
    loadAlarms();
    loadHistory();
    updateClock();
    renderAlarms();
    renderHistory();

    setupVoiceInput();

    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoices;
    }
    populateVoices();

    registerServiceWorker();
    requestNotificationPermission();
    checkMissedAlarms();

    setInterval(updateClock, 1000);
    setInterval(() => {
        localStorage.setItem('ai_last_active', Date.now());
    }, 10000);

    checkLoginStatus();
}

// --- Service Worker ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => { });
    }
}
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
}
function checkMissedAlarms() {
    const last = localStorage.getItem('ai_last_active');
    if (last && Date.now() - parseInt(last) > 60000) {
        logHistory('System', 'App Resumed');
    }
}

// --- Clock ---
function updateClock() {
    const now = new Date();
    if (currentTimeDisplay) {
        currentTimeDisplay.textContent = now.toLocaleTimeString('en-GB', {
            hour12: false
        });
    }
    if (dateDisplay) {
        dateDisplay.textContent = now.toLocaleDateString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    checkAlarms(now);
}

function checkAlarms(now) {
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
    ).padStart(2, '0')}`;

    const day = String(now.getDay());
    const dateKey = now.toLocaleDateString();
    const currentTriggerId = `${dateKey}-${time}`;

    const lastTriggered = localStorage.getItem('ai_last_triggered');

    if (activeAlarmId || currentTriggerId === lastTriggered) return;

    const matchingAlarms = alarms.filter((a) => {
        if (!a.enabled) return false;
        if (a.time !== time) return false;
        const days = a.days || [];
        return days.length === 0 || days.includes(day);
    });

    if (matchingAlarms.length > 0) {
        localStorage.setItem('ai_last_triggered', currentTriggerId);

        const combinedNote = matchingAlarms.map((a) => a.note).join(' + ');

        const combinedAlarm = {
            id: matchingAlarms[0].id,
            time: time,
            note: combinedNote
        };

        triggerAlarm(combinedAlarm);

        let alarmsUpdated = false;
        matchingAlarms.forEach((alarm) => {
            if (!alarm.days || alarm.days.length === 0) {
                alarm.enabled = false;
                alarmsUpdated = true;
            }
        });

        if (alarmsUpdated) {
            saveAlarms();
            renderAlarms();
        }
    }
}

// Unlock Audio Context on first interaction
document.addEventListener(
    'click',
    () => {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(() => { });
        }
    },
    { once: true }
);

function triggerAlarm(alarm) {
    activeAlarmId = alarm.id;

    if (ringingNoteDisplay) ringingNoteDisplay.textContent = alarm.note;
    if (snoozeAlarmBtn)
        snoozeAlarmBtn.textContent = `Snooze (${appSettings.snoozeMinutes}m)`;

    if (ringingOverlay) ringingOverlay.classList.remove('hidden');

    playAlarmSound();
    logHistory('Ringing', `${alarm.time} - ${alarm.note}`);

    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('AI Alarm', { body: alarm.note });
    }
}

// --- Audio ---
function playAlarmSound() {
    if (!audioContext)
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

    if (audioContext.state === 'suspended') audioContext.resume().catch(() => { });

    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();

    oscillator.type = appSettings.tone || 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();

    const vol = Number(appSettings.volume);

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(vol, audioContext.currentTime + 1.2);

    alarmInterval = setInterval(() => {
        const now = audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(vol, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    }, 1000);
}

function stopAlarmAudio() {
    if (oscillator) {
        try {
            oscillator.stop();
        } catch (e) { }
        oscillator.disconnect();
        oscillator = null;
    }
    if (alarmInterval) {
        clearInterval(alarmInterval);
        alarmInterval = null;
    }
}

// --- Interaction ---
if (stopAlarmBtn) {
    stopAlarmBtn.addEventListener('click', () => {
        stopAlarmAudio();
        if (aiAssistant) aiAssistant.classList.remove('hidden');

        const note = ringingNoteDisplay ? ringingNoteDisplay.textContent : 'Alarm';
        const msg = getSmartReminder(note);

        logHistory('Stopped', note);
        speak(msg, finishAlarm);
    });
}

if (snoozeAlarmBtn) {
    snoozeAlarmBtn.addEventListener('click', () => {
        stopAlarmAudio();
        finishAlarm();

        const min = appSettings.snoozeMinutes;
        const now = new Date();
        now.setMinutes(now.getMinutes() + min);

        const time = `${String(now.getHours()).padStart(2, '0')}:${String(
            now.getMinutes()
        ).padStart(2, '0')}`;

        let note = ringingNoteDisplay ? ringingNoteDisplay.textContent : 'Reminder';
        if (!note.includes('(Snoozed)')) note = `(Snoozed) ${note}`;

        alarms.push({
            id: Date.now().toString(),
            time,
            note,
            enabled: true,
            days: []
        });

        saveAlarms();
        renderAlarms();
        logHistory('Snoozed', `+${min}m`);
        alert(`Snoozed until ${time}`);
    });
}

function finishAlarm() {
    if (ringingOverlay) ringingOverlay.classList.add('hidden');
    if (aiAssistant) aiAssistant.classList.add('hidden');
    activeAlarmId = null;
}

function getSmartReminder(note) {
    const n = (note || '').toLowerCase();
    let add = '';
    if (n.includes('gym')) add = ' No pain, no gain!';
    if (n.includes('water')) add = ' Hydration is key.';
    return `${note}.${add}`;
}

function speak(text, cb) {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);

        if (appSettings.voiceURI) {
            const found = voices.find((v) => v.voiceURI === appSettings.voiceURI);
            if (found) u.voice = found;
        }

        u.rate = Number(appSettings.rate) || 1;
        u.pitch = Number(appSettings.pitch) || 1;

        if (assistantText) assistantText.textContent = text;

        u.onend = () => cb && cb();
        window.speechSynthesis.speak(u);
    } else cb && cb();
}

function setupVoiceInput() {
    if ('webkitSpeechRecognition' in window && micBtn && alarmNoteInput) {
        recognition = new webkitSpeechRecognition();
        recognition.lang = 'en-US';
        recognition.onresult = (e) => {
            alarmNoteInput.value = e.results[0][0].transcript;
        };
        micBtn.addEventListener('click', () => recognition.start());
    } else if (micBtn) {
        micBtn.style.display = 'none';
    }
}

function addAlarm() {
    if (!alarmTimeInput || !alarmTimeInput.value) return;

    const days = Array.from(
        document.querySelectorAll('.days-selector input:checked')
    ).map((c) => c.value);

    alarms.push({
        id: Date.now().toString(),
        time: alarmTimeInput.value,
        note: (alarmNoteInput && alarmNoteInput.value) || 'Reminder',
        enabled: true,
        days
    });

    saveAlarms();
    renderAlarms();

    if (alarmNoteInput) alarmNoteInput.value = '';
    document
        .querySelectorAll('.days-selector input')
        .forEach((c) => (c.checked = false));
}

function deleteAlarm(id) {
    alarms = alarms.filter((a) => a.id !== id);
    saveAlarms();
    renderAlarms();
}

function toggleAlarm(id) {
    const a = alarms.find((x) => x.id === id);
    if (a) {
        a.enabled = !a.enabled;
        saveAlarms();
        renderAlarms();
    }
}

function renderAlarms() {
    if (!alarmsList) return;

    alarmsList.innerHTML = '';
    if (!alarms.length) {
        alarmsList.innerHTML = '<p class="empty-state">No alarms.</p>';
        return;
    }

    alarms.sort((a, b) => a.time.localeCompare(b.time)).forEach((a) => {
        const daysText = a.days && a.days.length
            ? a.days
                .map(
                    (d) =>
                        `<span class="active">${['S', 'M', 'T', 'W', 'T', 'F', 'S'][Number(d)]
                        }</span>`
                )
                .join('')
            : '<span class="active">Once</span>';

        const div = document.createElement('div');
        div.className = `alarm-item ${!a.enabled ? 'disabled' : ''}`;

        div.innerHTML = `
      <div class="alarm-info">
        <h4>${a.time}</h4>
        <p title="${a.note}">${a.note}</p>
        <div class="alarm-days">${daysText}</div>
      </div>
      <div class="alarm-actions">
        <label class="switch">
          <input type="checkbox" ${a.enabled ? 'checked' : ''} onchange="toggleAlarm('${a.id}')">
          <span class="slider"></span>
        </label>
        <button class="delete-btn" onclick="deleteAlarm('${a.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;

        alarmsList.appendChild(div);
    });
}

function logHistory(action, details) {
    historyLogs.unshift({
        time: new Date().toLocaleString(),
        action,
        details
    });

    if (historyLogs.length > 20) historyLogs.pop();

    saveHistory();
    renderHistory();
}

function renderHistory() {
    if (!historyList) return;

    historyList.innerHTML = '';
    if (!historyLogs.length) {
        historyList.innerHTML = '<p class="empty-state">No history.</p>';
        return;
    }

    historyLogs.forEach((h) => {
        const d = document.createElement('div');
        d.className = 'history-item';
        d.innerHTML = `<span class="history-time">${h.time}</span><br><strong>${h.action}</strong>: ${h.details}`;
        historyList.appendChild(d);
    });
}

// Storage
function saveAlarms() {
    localStorage.setItem('ai_alarms', JSON.stringify(alarms));
}
function loadAlarms() {
    alarms = JSON.parse(localStorage.getItem('ai_alarms') || '[]');
}
function saveHistory() {
    localStorage.setItem('ai_history', JSON.stringify(historyLogs));
}
function loadHistory() {
    historyLogs = JSON.parse(localStorage.getItem('ai_history') || '[]');
}
function saveSettings() {
    localStorage.setItem('ai_settings', JSON.stringify(appSettings));
}
function loadSettings() {
    appSettings = {
        ...appSettings,
        ...JSON.parse(localStorage.getItem('ai_settings') || '{}')
    };

    if (toneSelect) toneSelect.value = appSettings.tone;

    if (volumeRange) {
        volumeRange.value = appSettings.volume;
        if (volumeValue)
            volumeValue.textContent = Math.round(appSettings.volume * 100) + '%';
    }

    if (snoozeDurationSelect) {
        snoozeDurationSelect.value = appSettings.snoozeMinutes;
    }

    if (rateRange) {
        rateRange.value = appSettings.rate;
        if (rateValue) rateValue.textContent = appSettings.rate;
    }

    if (pitchRange) {
        pitchRange.value = appSettings.pitch;
        if (pitchValue) pitchValue.textContent = appSettings.pitch;
    }
}

function applyTheme() {
    if (!themeToggleBtn) return;

    document.body.className = appSettings.theme === 'light' ? 'light-mode' : '';
    themeToggleBtn.innerHTML =
        appSettings.theme === 'light'
            ? '<i class="fa-solid fa-sun"></i>'
            : '<i class="fa-solid fa-moon"></i>';
}

function applyAccentColor() {
    document.documentElement.style.setProperty(
        '--accent-color',
        appSettings.accentColor
    );
}

// --- Cloud (Mock) ---
function checkLoginStatus() {
    const user = localStorage.getItem('ai_cloud_user');
    if (user) {
        if (authContainer) authContainer.classList.add('hidden');
        if (syncContainer) syncContainer.classList.remove('hidden');
        if (userEmailDisplay) userEmailDisplay.textContent = user;
    } else {
        if (authContainer) authContainer.classList.remove('hidden');
        if (syncContainer) syncContainer.classList.add('hidden');
    }
}

if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        const email = emailInput ? emailInput.value : '';
        if (email) {
            alert('Simulating Firebase Login...');
            localStorage.setItem('ai_cloud_user', email);
            checkLoginStatus();
            if (authMessage) authMessage.textContent = '';
        } else {
            if (authMessage) authMessage.textContent = 'Please enter an email';
        }
    });
}

if (signupBtn) {
    signupBtn.addEventListener('click', () => {
        alert('Simulating Firebase Signup...');
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('ai_cloud_user');
        checkLoginStatus();
    });
}

if (pushBtn) {
    pushBtn.addEventListener('click', () => {
        alert('Syncing Alarms to Cloud (Mock)...');
        localStorage.setItem('ai_cloud_db_alarms', JSON.stringify(alarms));
        setTimeout(() => alert('Sync Complete!'), 1000);
    });
}

if (pullBtn) {
    pullBtn.addEventListener('click', () => {
        alert('Restoring Alarms from Cloud (Mock)...');
        const cloudAlarms = localStorage.getItem('ai_cloud_db_alarms');
        if (cloudAlarms) {
            alarms = JSON.parse(cloudAlarms);
            saveAlarms();
            renderAlarms();
            alert('Restored!');
        } else {
            alert('No backup found.');
        }
    });
}

// Events (safe)
if (addAlarmBtn) addAlarmBtn.addEventListener('click', addAlarm);

if (settingsBtn && settingsPanel)
    settingsBtn.addEventListener('click', () => settingsPanel.classList.remove('hidden'));
if (closeSettingsBtn && settingsPanel)
    closeSettingsBtn.addEventListener('click', () => settingsPanel.classList.add('hidden'));

if (historyBtn && historyPanel)
    historyBtn.addEventListener('click', () => historyPanel.classList.remove('hidden'));
if (closeHistoryBtn && historyPanel)
    closeHistoryBtn.addEventListener('click', () => historyPanel.classList.add('hidden'));

if (cloudBtn && cloudPanel)
    cloudBtn.addEventListener('click', () => cloudPanel.classList.remove('hidden'));
if (closeCloudBtn && cloudPanel)
    closeCloudBtn.addEventListener('click', () => cloudPanel.classList.add('hidden'));

if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
        historyLogs = [];
        saveHistory();
        renderHistory();
    });
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        appSettings.theme = appSettings.theme === 'light' ? 'dark' : 'light';
        applyTheme();
        saveSettings();
    });
}

if (colorBtns && colorBtns.length) {
    colorBtns.forEach((b) =>
        b.addEventListener('click', () => {
            appSettings.accentColor = b.dataset.color;
            applyAccentColor();
            saveSettings();
        })
    );
}

if (voiceSelect) {
    voiceSelect.addEventListener('change', () => {
        appSettings.voiceURI =
            voiceSelect.selectedOptions[0]?.getAttribute('data-uri');
        saveSettings();
    });
}

if (toneSelect) {
    toneSelect.addEventListener('change', (e) => {
        appSettings.tone = e.target.value;
        saveSettings();
    });
}

if (rateRange) {
    rateRange.addEventListener('input', (e) => {
        appSettings.rate = e.target.value;
        if (rateValue) rateValue.textContent = e.target.value;
        saveSettings();
    });
}

if (pitchRange) {
    pitchRange.addEventListener('input', (e) => {
        appSettings.pitch = e.target.value;
        if (pitchValue) pitchValue.textContent = e.target.value;
        saveSettings();
    });
}

if (volumeRange) {
    volumeRange.addEventListener('input', (e) => {
        appSettings.volume = e.target.value;
        if (volumeValue)
            volumeValue.textContent = Math.round(e.target.value * 100) + '%';
        saveSettings();
    });
}

if (snoozeDurationSelect) {
    snoozeDurationSelect.addEventListener('change', (e) => {
        appSettings.snoozeMinutes = parseInt(e.target.value);
        saveSettings();
    });
}

if (testVoiceBtn) testVoiceBtn.addEventListener('click', () => speak('Testing voice.'));

// Expose functions for inline HTML onclick
window.deleteAlarm = deleteAlarm;
window.toggleAlarm = toggleAlarm;

function populateVoices() {
    if (!voiceSelect) return;

    voices = speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';

    if (voices.length === 0) {
        setTimeout(populateVoices, 100);

        const opt = document.createElement('option');
        opt.textContent = 'Default System Voice';
        opt.value = '';
        voiceSelect.appendChild(opt);
        return;
    }

    voices.sort((a, b) => {
        const aEn = a.lang.includes('en');
        const bEn = b.lang.includes('en');
        if (aEn && !bEn) return -1;
        if (!aEn && bEn) return 1;
        return a.name.localeCompare(b.name);
    });

    voices.forEach((v) => {
        const opt = document.createElement('option');
        opt.textContent = `${v.name} (${v.lang})`;
        opt.setAttribute('data-name', v.name);
        opt.setAttribute('data-uri', v.voiceURI);
        opt.value = v.name;
        voiceSelect.appendChild(opt);
    });

    if (appSettings.voiceURI) {
        const found = Array.from(voiceSelect.options).find(
            (o) => o.getAttribute('data-uri') === appSettings.voiceURI
        );
        if (found) voiceSelect.value = found.value;
    }
}

init();
