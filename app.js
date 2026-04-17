import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

const ENDPOINT_URL = "https://slate-partners.technolutions.net/manage/query/run?id=8b7142c2-6c70-4109-9eeb-74d2494ba7c8&cmd=service&output=json&h=b0203357-4804-4c5d-8213-9e376263af44";
const STORAGE_KEY = 'slateSessionPlannerData';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyC4E8FmQJCxowSzkuaKQYk5GCbC7ZtCv7o",
    authDomain: "slate-planner-sync.firebaseapp.com",
    databaseURL: "https://slate-planner-sync-default-rtdb.firebaseio.com",
    projectId: "slate-planner-sync",
    storageBucket: "slate-planner-sync.firebasestorage.app",
    messagingSenderId: "196444047193",
    appId: "1:196444047193:web:9905e8481c182a240fee48",
    measurementId: "G-FM89YFQ3SP"
};

const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";
let app, database;

if (isFirebaseConfigured) {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
}

let state = {
    settings: {
        teamMembers: ['Lloyd', 'Kathryn', 'Austin'],
        teamCode: ''
    },
    preferences: {},
    ui: {
        expandedSessions: []
    }
};

let sessionsData = [];
let currentTab = 'sessions'; // 'sessions' or 'schedule'
let currentTheme = localStorage.getItem('slateTheme') || 'dark';
let expandedSessions = new Set();

async function init() {
    initTheme();
    loadState();
    connectToTeamCode();
    await fetchSessions();
    updateFilterDropdowns();
    renderView();
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.settings) state.settings = parsed.settings;
            if (parsed.preferences) {
                state.preferences = parsed.preferences;
            } else if (Object.keys(parsed).length && !parsed.settings) {
                // handle legacy migration
                state.preferences = parsed;
            }
            if (parsed.ui) {
                state.ui = parsed.ui;
            }
        } catch (e) { console.error("Failed to parse saved state", e); }
    }

    // Ensure all team preferences are structured properly
    for (const guid in state.preferences) {
        if (!state.preferences[guid].team) {
            state.preferences[guid].team = {};
        }
    }

    if (!state.ui) {
        state.ui = { expandedSessions: [] };
    }
    if (!Array.isArray(state.ui.expandedSessions)) {
        state.ui.expandedSessions = [];
    }
    expandedSessions = new Set(state.ui.expandedSessions);
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveStateAndSync() {
    saveState();
    const code = state.settings.teamCode;
    if (code && isFirebaseConfigured) {
        const dbRef = ref(database, `teams/${code}/preferences`);
        set(dbRef, state.preferences).catch(console.error);
    }
}

let unsubscribeFromTeam = null;

function connectToTeamCode() {
    const code = state.settings.teamCode;
    const syncStatus = document.getElementById('sync-status');

    if (unsubscribeFromTeam) {
        unsubscribeFromTeam();
        unsubscribeFromTeam = null;
    }

    if (!code || !isFirebaseConfigured) {
        if (!isFirebaseConfigured && code) {
            console.warn("Firebase not configured. Using local storage only.");
        }
        syncStatus.className = 'sync-indicator offline';
        syncStatus.innerHTML = '☁️ Offline';
        return;
    }

    syncStatus.className = 'sync-indicator online';
    syncStatus.innerHTML = `☁️ Synced: ${escapeHTML(code)}`;

    const dbRef = ref(database, `teams/${code}/preferences`);
    unsubscribeFromTeam = onValue(dbRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            state.preferences = data;
            saveState(); // update local storage cache too
            renderView();
        }
    });
}

function getPref(guid) {
    if (!state.preferences[guid]) {
        state.preferences[guid] = { notes: "", team: {} };
    }
    if (!state.preferences[guid].team) {
        state.preferences[guid].team = {};
    }
    return state.preferences[guid];
}

async function fetchSessions() {
    try {
        const response = await fetch(ENDPOINT_URL);
        const data = await response.json();
        if (data && data.row && Array.isArray(data.row)) {
            sessionsData = data.row;
        } else {
            throw new Error("Invalid format");
        }
    } catch (e) {
        console.error("Error fetching sessions:", e);
        document.getElementById('sessions-container').innerHTML = `<p style="color: red; padding: 2rem;">Error loading sessions. Please check network and try again later.</p>`;
    } finally {
        document.getElementById('loader').classList.add('hidden');
    }
}

// ---------------------------
// VIEW ROUTER
// ---------------------------
window.renderView = function () {
    if (currentTab === 'sessions') {
        document.getElementById('sessions-container').classList.remove('hidden');
        document.getElementById('schedule-container').classList.add('hidden');
        renderSessions();
    } else {
        document.getElementById('sessions-container').classList.add('hidden');
        document.getElementById('schedule-container').classList.remove('hidden');
        renderSchedule();
    }
}

// ---------------------------
// FILTERING
// ---------------------------
function getFilteredSessions() {
    const memberFilter = document.getElementById('filter-member').value;
    const statusFilter = document.getElementById('filter-status').value;
    const dayFilter = document.getElementById('filter-day').value;
    const typeFilter = document.getElementById('filter-type').value;

    return sessionsData.filter(session => {
        // Day filter
        if (dayFilter && dayFilter !== 'all') {
            const sDay = session.Day || 'Day 1';
            if (sDay !== dayFilter) return false;
        }

        // Type filter
        if (typeFilter && typeFilter !== 'all') {
            const sType = session.Type || 'Other Sessions';
            if (sType !== typeFilter) return false;
        }

        const pref = state.preferences[session.guid] || {};
        const teamObj = pref.team || {};

        // Helper to check what a specific member has saved
        const checkMember = (memName) => {
            const m = teamObj[memName];
            if (!m) return false;
            if (statusFilter === 'all') return (m.going || m.interesting);
            if (statusFilter === 'going') return m.going;
            if (statusFilter === 'interesting') return m.interesting;
            return false;
        };

        if (memberFilter === 'all_sessions') {
            if (statusFilter === 'all') {
                return true; // Unfiltered
            } else {
                return Object.keys(teamObj).some(m => checkMember(m));
            }
        }
        else if (memberFilter === 'any_saved') {
            return Object.keys(teamObj).some(m => checkMember(m));
        }
        else {
            return checkMember(memberFilter);
        }
    });
}

// ---------------------------
// SESSIONS LIST VIEW
// ---------------------------
function renderSessions() {
    const container = document.getElementById('sessions-container');
    const filtered = getFilteredSessions();

    if (!filtered.length) {
        container.innerHTML = '<p class="text-secondary" style="padding: 2rem;">No sessions match your filter.</p>';
        return;
    }

    // Sort by Day, then Time
    filtered.sort((a, b) => {
        const dayA = a.Day || 'Day 1';
        const dayB = b.Day || 'Day 1';
        if (dayA !== dayB) return getDaySortWeight(dayA) - getDaySortWeight(dayB);
        const timeA = parseTimeToMinutes(a.Time);
        const timeB = parseTimeToMinutes(b.Time);
        return timeA - timeB;
    });

    let html = '';
    let currentDay = null;
    let currentTime = null;

    filtered.forEach(session => {
        const sDay = session.Day || 'Day 1';
        const sTime = session.Time || 'TBA';
        const sDate = getActualDate(sDay, session.Date);

        if (sDay !== currentDay) {
            if (currentDay !== null) {
                html += '</div></div>'; // Close previous sessions-table and day-group
            }
            html += `<div class="day-group">
                <h2 class="day-header">${escapeHTML(sDate)}</h2>`;
            currentDay = sDay;
            currentTime = null; // Reset time so we output a time header
        }

        if (sTime !== currentTime) {
            if (currentTime !== null) {
                html += '</div>'; // Close previous sessions-table
            }
            html += `<h3 class="time-header">${escapeHTML(sTime)}</h3>
            <div class="sessions-table">`;
            currentTime = sTime;
        }

        const pref = getPref(session.guid);
        const isExpanded = expandedSessions.has(session.guid);
        const jsEscapedGuid = escapeJSString(session.guid);
        const safeGuid = escapeHTML(session.guid);
        const safeTitle = escapeHTML(session.Title || 'Untitled');
        const expandAriaLabel = escapeHTML(`Toggle details for ${session.Title || 'Untitled'}`);

        // Build compact team controls
        let teamHtml = '<div class="team-inline-controls">';
        state.settings.teamMembers.forEach(member => {
            const memPref = pref.team[member] || { interesting: false, going: false };
            const jsEscapedMember = escapeJSString(member);
            teamHtml += `
                <div class="member-inline-row">
                    <span class="member-inline-name">${escapeHTML(member)}</span>
                    <div class="toggle-group-inline">
                        <label class="btn-toggle-small ${memPref.interesting ? 'active interesting' : ''}" title="Toggle interested for ${escapeHTML(member)}">
                            <input type="checkbox" class="hidden" ${memPref.interesting ? 'checked' : ''} onchange="toggleMemberPref('${jsEscapedGuid}', '${jsEscapedMember}', 'interesting')">
                            ⭐
                        </label>
                        <label class="btn-toggle-small ${memPref.going ? 'active going' : ''}" title="Toggle going for ${escapeHTML(member)}">
                            <input type="checkbox" class="hidden" ${memPref.going ? 'checked' : ''} onchange="toggleMemberPref('${jsEscapedGuid}', '${jsEscapedMember}', 'going')">
                            ✅
                        </label>
                    </div>
                </div>
            `;
        });
        teamHtml += '</div>';

        html += `
            <div class="session-row-card ${isExpanded ? 'expanded' : ''}" data-guid="${safeGuid}">
                <div class="session-row-main">
                    <button class="session-expand-btn" onclick="toggleSessionExpand('${jsEscapedGuid}')" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-label="${expandAriaLabel}">
                        ${isExpanded ? '▼' : '▶'}
                    </button>
                    <div class="session-row-summary">
                        <h3 class="session-title condensed">${safeTitle}</h3>
                        <div class="session-meta condensed">
                            <span class="meta-badge">🏷️ ${escapeHTML(session.Type || 'Other Sessions')}</span>
                            ${session.Location ? `<span class="meta-badge">📍 ${escapeHTML(session.Location)}</span>` : ''}
                        </div>
                    </div>
                    ${teamHtml}
                </div>
                <div class="session-row-details ${isExpanded ? '' : 'hidden'}">
                    ${session.Speakers ? `<div class="session-speakers">🗣️ ${escapeHTML(session.Speakers)}</div>` : ''}
                    <div class="session-description">
                        ${escapeHTML(session.Description || 'No description available.').trim()}
                    </div>
                    <div class="form-group">
                        <label for="notes-${safeGuid}">Team Notes</label>
                        <textarea id="notes-${safeGuid}" class="form-control" 
                            placeholder="Thoughts? Questions?" 
                            oninput="updateNotes('${jsEscapedGuid}', this.value)">${escapeHTML(pref.notes || '')}</textarea>
                    </div>
                </div>
            </div>
        `;
    });

    if (currentDay !== null) {
        html += `</div></div>`; // Close the last day-group
    }

    container.innerHTML = html;
}

window.toggleSessionExpand = function (guid) {
    if (expandedSessions.has(guid)) {
        expandedSessions.delete(guid);
    } else {
        expandedSessions.add(guid);
    }
    state.ui.expandedSessions = Array.from(expandedSessions);
    saveState();
    renderSessions();
};

// ---------------------------
// SCHEDULE VIEW
// ---------------------------
function renderSchedule() {
    const container = document.getElementById('schedule-container');
    const filtered = getFilteredSessions();
    if (!filtered.length) {
        container.innerHTML = '<p class="text-secondary" style="padding: 2rem;">No sessions match your schedule filters.</p>';
        return;
    }

    const daysMap = {
        'Day 1': { name: 'Wednesday, June 25', slots: {} },
        'Day 2': { name: 'Thursday, June 26', slots: {} },
        'Day 3': { name: 'Friday, June 27', slots: {} }
    };

    filtered.forEach(session => {
        let d = session.Day || 'Day 1';
        // Add dynamic fallbacks or normalizations if the API doesn't use Day 1/2/3
        if (!daysMap[d]) daysMap[d] = { name: d, slots: {} };

        const t = session.Time || 'TBA';
        if (!daysMap[d].slots[t]) daysMap[d].slots[t] = [];
        daysMap[d].slots[t].push(session);
    });

    let html = '<div class="schedule-grid">';

    const sortedDays = Object.keys(daysMap).sort((a, b) => getDaySortWeight(a) - getDaySortWeight(b));

    sortedDays.forEach(dayKey => {
        const dayData = daysMap[dayKey];
        if (!Object.keys(dayData.slots).length) return; // Hide empty days

        html += `<div class="day-col">
            <h3>${escapeHTML(dayData.name)}</h3>`;

        // Smart sort for times based on AM/PM (e.g. 10:00 AM before 12:00 PM before 02:00 PM)
        const times = Object.keys(dayData.slots).sort((a, b) => {
            return parseTimeToMinutes(a) - parseTimeToMinutes(b);
        });

        times.forEach(time => {
            html += `<div class="time-slot">
                <div class="time-slot-header">${escapeHTML(time)}</div>`;

            dayData.slots[time].forEach(session => {
                const pref = getPref(session.guid);

                // Show who is going / interested right on the card
                let attendeeHtml = '';
                if (pref.team) {
                    const goingMems = Object.keys(pref.team).filter(m => pref.team[m]?.going);
                    const interMems = Object.keys(pref.team).filter(m => pref.team[m]?.interesting);

                    if (goingMems.length) attendeeHtml += `<div>✅ Going: ${escapeHTML(goingMems.join(', '))}</div>`;
                    if (interMems.length) attendeeHtml += `<div>⭐ Interested: ${escapeHTML(interMems.join(', '))}</div>`;
                }

                const actualDate = getActualDate(session.Day, session.Date);

                html += `
                    <div class="schedule-item">
                        <div class="schedule-item-title">${escapeHTML(session.Title || 'Untitled')}</div>
                        ${attendeeHtml ? `<div class="schedule-item-teams">${attendeeHtml}</div>` : ''}
                        
                        <!-- Hover Tooltip -->
                        <div class="tooltip">
                            <h4>${escapeHTML(session.Title || 'Untitled')}</h4>
                            <p><strong>Time:</strong> ${escapeHTML(actualDate)} ${escapeHTML(time)}</p>
                            <p><strong>Location:</strong> ${escapeHTML(session.Location || 'TBA')}</p>
                            <p>${escapeHTML(session.Description || 'No description').substring(0, 150)}...</p>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        });
        html += `</div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

// ---------------------------
// INTERACTIONS & HELPERS
// ---------------------------
window.switchTab = function (tab) {
    currentTab = tab;
    document.getElementById('tab-sessions').classList.toggle('active', tab === 'sessions');
    document.getElementById('tab-schedule').classList.toggle('active', tab === 'schedule');
    renderView();
};

window.toggleTheme = function () {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('slateTheme', currentTheme);
    initTheme();
};

function initTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    const btn = document.getElementById('theme-toggle');
    if (btn) {
        btn.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
    }
}

window.toggleMemberPref = function (guid, member, type) {
    const pref = getPref(guid);
    if (!pref.team[member]) {
        pref.team[member] = { interesting: false, going: false };
    }
    const currentVal = pref.team[member][type];
    pref.team[member][type] = !currentVal;
    saveStateAndSync();
    renderView();
};

window.updateNotes = function (guid, val) {
    const pref = getPref(guid);
    pref.notes = val;
    saveStateAndSync();
};

window.generateTeamCode = function () {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    document.getElementById('team-code-input').value = code;
};

window.toggleSettings = function () {
    const panel = document.getElementById('settings-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        document.getElementById('team-members-input').value = state.settings.teamMembers.join('\n');
        document.getElementById('team-code-input').value = state.settings.teamCode || '';
    }
};

window.saveSettings = function () {
    const val = document.getElementById('team-members-input').value;
    const names = val.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length) {
        state.settings.teamMembers = names;
    } else {
        state.settings.teamMembers = ['Lloyd', 'Kathryn', 'Austin']; // default fallback
    }

    const prevCode = state.settings.teamCode;
    const newCode = document.getElementById('team-code-input').value.trim().toUpperCase();
    state.settings.teamCode = newCode;

    saveStateAndSync();

    if (prevCode !== newCode) {
        connectToTeamCode();
    }

    updateFilterDropdowns();
    renderView();
    toggleSettings();
};

function updateFilterDropdowns() {
    const select = document.getElementById('filter-member');
    let opts = '<option value="all_sessions">Everyone (All Sessions)</option>';
    opts += '<option value="any_saved">Any Saved Member</option>';
    state.settings.teamMembers.forEach(m => {
        opts += `<option value="${escapeHTML(m)}">Member: ${escapeHTML(m)}</option>`;
    });

    // Retain selection if possible
    const currentVal = select.value;
    select.innerHTML = opts;
    if (currentVal && select.querySelector(`option[value="${currentVal.replace(/"/g, '\\"')}"]`)) {
        select.value = currentVal;
    }

    // Days dropdown
    const daysSelect = document.getElementById('filter-day');
    if (daysSelect && sessionsData.length > 0) {
        const uniqueDays = [...new Set(sessionsData.map(s => s.Day || 'Day 1'))].sort((a, b) => getDaySortWeight(a) - getDaySortWeight(b));
        let daysOpts = '<option value="all">All Days</option>';
        uniqueDays.forEach(d => {
            daysOpts += `<option value="${escapeHTML(d)}">${escapeHTML(getActualDate(d))}</option>`;
        });
        const currentDay = daysSelect.value;
        daysSelect.innerHTML = daysOpts;
        if (currentDay && daysSelect.querySelector(`option[value="${currentDay.replace(/"/g, '\\"')}"]`)) {
            daysSelect.value = currentDay;
        }
    }

    // Types dropdown
    const typeSelect = document.getElementById('filter-type');
    if (typeSelect && sessionsData.length > 0) {
        const uniqueTypes = [...new Set(sessionsData.map(s => s.Type || 'Other Sessions'))].sort();
        let typeOpts = '<option value="all">All Types</option>';
        uniqueTypes.forEach(t => {
            typeOpts += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
        });
        const currentType = typeSelect.value;
        typeSelect.innerHTML = typeOpts;
        if (currentType && typeSelect.querySelector(`option[value="${currentType.replace(/"/g, '\\"')}"]`)) {
            typeSelect.value = currentType;
        }
    }
}

// Helper for smart sorting times
function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return 0;

    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const ampm = match[3].toUpperCase();

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    return hours * 60 + mins;
}

function getDaySortWeight(dayStr) {
    if (!dayStr) return 99;
    const lower = dayStr.toLowerCase();
    if (lower.includes('monday')) return 1;
    if (lower.includes('tuesday')) return 2;
    if (lower.includes('wednesday')) return 3;
    if (lower.includes('thursday')) return 4;
    if (lower.includes('friday')) return 5;
    if (lower.includes('saturday')) return 6;
    if (lower.includes('sunday')) return 0;
    if (lower.includes('day 1')) return 10;
    if (lower.includes('day 2')) return 11;
    if (lower.includes('day 3')) return 12;
    return 99;
}

// Map "Day 1", "Day 2", etc., to specific dates if not provided by feed
function getActualDate(dayStr, sessionDate) {
    if (sessionDate) return sessionDate;
    if (dayStr === 'Day 1') return 'Wednesday, June 25, 2026';
    if (dayStr === 'Day 2') return 'Thursday, June 26, 2026';
    if (dayStr === 'Day 3') return 'Friday, June 27, 2026';
    return dayStr || 'Date TBD';
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeJSString(str) {
    if (!str) return '';
    return str.toString()
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'");
}

document.addEventListener('DOMContentLoaded', init);
