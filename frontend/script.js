const app = document.getElementById('app');
const toastBox = document.getElementById('toast');
const API_BASE = String(window.NAGAR_DRISHTI_API_URL || 'http://localhost:5001/api').replace(/\/+$/, '');
const SESSION_KEY = 'nd_session';
const THEME_KEY = 'nd_theme';

const CATEGORIES = [
    { icon: '▰', name: 'Road Damage & Potholes', id: 'c1111111-1111-1111-1111-111111111111' },
    { icon: '▣', name: 'Garbage & Waste Accumulation', id: 'c2222222-2222-2222-2222-222222222222' },
    { icon: '♨', name: 'Water Pipeline Leakage / Burst', id: 'c3333333-3333-3333-3333-333333333333' },
    { icon: '♧', name: 'Broken Streetlights', id: 'c4444444-4444-4444-4444-444444444444' },
    { icon: '≋', name: 'Sewage Overflow & Blocked Drains', id: 'c5555555-5555-5555-5555-555555555555' },
    { icon: '♧', name: 'Fallen Trees & Obstructions', id: 'c6666666-6666-6666-6666-666666666666' },
    { icon: '•••', name: 'Other', id: null }
];

let token = null;
let current = null;
let currentProfile = null;
let theme = localStorage.getItem(THEME_KEY) || 'light';
let page = 'Home';
let selectedCategory = CATEGORIES[0].name;
let query = '';
let complaints = [];
let dashboardSummary = null;
let departments = [];
let notifications = [];
let aiSuggestions = [];
let loadedPage = '';
let renderSequence = 0;
let complaintTableFilter = 'all';

function applyTheme(newTheme) {
    theme = newTheme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    document.querySelectorAll('.theme-icon').forEach(el => el.textContent = theme === 'dark' ? '☀️' : '🌙');
    document.querySelectorAll('.theme-text').forEach(el => el.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode');
    document.querySelectorAll('.theme-icon-btn').forEach(el => el.textContent = theme === 'dark' ? '☀️' : '🌙');
}

function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
    notify(`Switched to ${theme} mode`);
}

// Initial theme application
applyTheme(theme);

function esc(value = '') {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function notify(message) {
    toastBox.innerHTML = `<div class="toast">${esc(message)}</div>`;
    setTimeout(() => { toastBox.innerHTML = ''; }, 3000);
}

function readSession() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
        return null;
    }
}

function clearSession() {
    token = null;
    current = null;
    currentProfile = null;
    localStorage.removeItem(SESSION_KEY);
}

function doLogout() {
    clearSession();
    complaints = [];
    loadedPage = '';
    notify('You have been logged out.');
    renderAuth();
}

async function apiRequest(path, { method = 'GET', body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch {
        throw new Error(`Could not reach the Nagar Drishti API at ${API_BASE}. Check that the backend is running and the URL is correct.`);
    }

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error(`The API returned an unreadable response (HTTP ${response.status}).`);
    }
    if (!response.ok || result.success === false) {
        throw new Error(result.error?.message || result.message || `API request failed (HTTP ${response.status}).`);
    }
    return result.data;
}

function normalizeComplaint(item) {
    const category = CATEGORIES.find(candidate => candidate.id === item.category_id);
    return {
        ...item,
        backendId: item.id,
        id: item.public_number || item.id,
        title: item.title || 'Untitled report',
        category: item.category_name || category?.name || 'Other',
        department_id: item.department_id || null,
        department_name: item.department_name || '',
        location: item.location_text || '',
        landmark: item.landmark || '',
        date: item.created_at
            ? new Date(item.created_at).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: 'numeric' })
            : '',
        priority: String(item.priority || 'medium').replace(/^./, character => character.toUpperCase()),
        citizen: item.reporter_name || current?.name || 'Citizen',
        email: item.reporter_email || current?.email || '',
        status: item.status || 'Pending',
        is_escalated: Boolean(item.is_escalated),
        escalation_reason: item.escalation_reason || ''
    };
}

// DUPLICATE DETECTION & PRIORITY SCALING ALGORITHM
const CIVIC_STOPWORDS = new Set([
    'road', 'street', 'lane', 'avenue', 'block', 'near', 'opposite', 'opp', 'junction',
    'behind', 'outside', 'front', 'corner', 'sector', 'gate', 'area', 'colony', 'marg',
    'the', 'and', 'with', 'for', 'from', 'pothole', 'crater', 'broken', 'damage', 'hazardous',
    'deep', 'severe', 'urgent', 'massive', 'huge', 'delhi', 'ncr'
]);

function extractLocationTokens(text) {
    if (!text) return [];
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !CIVIC_STOPWORDS.has(w));
}

function areComplaintsSimilar(a, b) {
    // 1. Explicit duplicate / parent incident link
    if (a.parent_incident_id && (a.parent_incident_id === b.id || a.parent_incident_id === b.backendId)) return true;
    if (b.parent_incident_id && (b.parent_incident_id === a.id || b.parent_incident_id === a.backendId)) return true;

    // 2. Both should share category (or one of them is unassigned/other)
    const sameCat = (a.category === b.category) || (a.category_id && a.category_id === b.category_id) || (a.category === 'Other' || b.category === 'Other');
    if (!sameCat) return false;

    // 3. Location text similarity: check shared significant landmark/location tokens
    const aLocTokens = extractLocationTokens(`${a.location || ''} ${a.landmark || ''}`);
    const bLocTokens = extractLocationTokens(`${b.location || ''} ${b.landmark || ''}`);
    const sharedLoc = aLocTokens.filter(t => bLocTokens.includes(t));
    if (sharedLoc.length >= 1) return true;

    return false;
}

function getClusteredIncidents(complaintsList) {
    const visited = new Set();
    const clusters = [];

    for (let i = 0; i < complaintsList.length; i++) {
        const c = complaintsList[i];
        const cId = c.backendId || c.id;
        if (visited.has(cId)) continue;

        const group = [c];
        visited.add(cId);

        for (let j = i + 1; j < complaintsList.length; j++) {
            const other = complaintsList[j];
            const otherId = other.backendId || other.id;
            if (visited.has(otherId)) continue;

            if (areComplaintsSimilar(c, other)) {
                group.push(other);
                visited.add(otherId);
            }
        }

        // Priority scaling: More reports on same issue = Higher Priority
        const count = group.length;
        let crowdPriority = 'Low';
        let weight = 1;

        if (count >= 3) {
            crowdPriority = 'Urgent';
            weight = 40 + count; // Hotspot escalation
        } else if (count === 2) {
            crowdPriority = 'High';
            weight = 20 + count; // Duplicate cluster escalation
        } else {
            const basePri = String(c.priority || 'Medium').toLowerCase();
            if (basePri === 'urgent') weight = 15;
            else if (basePri === 'high') weight = 10;
            else if (basePri === 'medium') weight = 5;
            else weight = 1;
            crowdPriority = String(c.priority || 'Medium').replace(/^./, ch => ch.toUpperCase());
        }

        clusters.push({
            id: `cluster-${group[0].backendId || group[0].id}`,
            primary: group[0],
            reports: group,
            count,
            crowdPriority,
            weight,
            isHotspot: count >= 3,
            isDuplicate: count === 2,
            category: group[0].category,
            departmentName: group.find(r => r.department_name)?.department_name || '',
            location: group[0].location || group[0].landmark || 'Location pending'
        });
    }

    // Sort priority-wise: highest weight / report count first
    clusters.sort((a, b) => b.weight - a.weight);
    return clusters;
}

function enrichComplaintsWithClusters(complaintsList) {
    const clusters = getClusteredIncidents(complaintsList);
    const complaintMap = new Map();

    clusters.forEach(cluster => {
        cluster.reports.forEach(comp => {
            const id = comp.backendId || comp.id;
            complaintMap.set(id, {
                clusterCount: cluster.count,
                crowdPriority: cluster.crowdPriority,
                clusterWeight: cluster.weight,
                clusterId: cluster.id,
                isClusterPrimary: (comp.backendId || comp.id) === (cluster.primary.backendId || cluster.primary.id)
            });
        });
    });

    return complaintsList.map(comp => {
        const id = comp.backendId || comp.id;
        const meta = complaintMap.get(id) || { clusterCount: 1, crowdPriority: comp.priority, clusterWeight: 1 };
        return {
            ...comp,
            ...meta
        };
    });
}


async function loadPageData(requestedPage) {
    if (requestedPage === 'Profile') {
        try {
            const myProfile = await apiRequest('/auth/me');
            current = myProfile.user;
            currentProfile = myProfile.profile || {};
        } catch (_) {}
    }

    if (current.role === 'admin') {
        const [complaintResult, departmentResult] = await Promise.all([
            apiRequest('/admin/complaints?limit=100'),
            apiRequest('/admin/departments')
        ]);
        complaints = (complaintResult.complaints || []).map(normalizeComplaint);
        departments = departmentResult;

        if (requestedPage === 'Dashboard') {
            const [summary, activityResult] = await Promise.all([
                apiRequest('/admin/dashboard-summary'),
                apiRequest('/admin/activities?limit=5')
            ]);
            dashboardSummary = summary;
            dashboardSummary.recentActivities = activityResult.activities || [];
        } else if (requestedPage === 'AI Operations') {
            aiSuggestions = await apiRequest('/admin/ai/pending');
        }
    } else {
        const complaintResult = await apiRequest('/complaints/mine?limit=100');
        complaints = (complaintResult.complaints || []).map(normalizeComplaint);

        if (requestedPage === 'Home') {
            dashboardSummary = await apiRequest('/dashboard/citizen-summary');
        } else if (requestedPage === 'Notifications') {
            const result = await apiRequest('/notifications');
            notifications = result.notifications || [];
            dashboardSummary = { unreadNotificationsCount: result.unreadCount || 0 };
        }
    }
    if (requestedPage === page) loadedPage = requestedPage;
}

function brand() {
    return `<div class="brand"><div class="brand-mark">❧</div><div><div class="brand-name">Nagar Drishti</div><div class="brand-sub">Har Shikayat Par Nazar</div></div></div>`;
}

function navItems() {
    return current.role === 'admin'
        ? [['▦', 'Dashboard'], ['▤', 'Complaints'], ['⚠', 'Incidents'], ['♙', 'Departments'], ['◇', 'Verification'], ['◉', 'AI Operations'], ['▧', 'Reports'], ['◎', 'Profile'], ['⚙', 'Settings']]
        : [['⌂', 'Home'], ['▤', 'Report Issue'], ['▣', 'My Complaints'], ['♧', 'Track Status'], ['♧', 'Notifications'], ['◎', 'Profile']];
}

function shell() {
    const unread = current.role === 'citizen' ? dashboardSummary?.unreadNotificationsCount || 0 : 0;
    return `
    <div class="shell">
        <aside class="sidebar" id="sidebar">
            ${brand()}
            <div class="nav-label">Workspace</div>
            <nav class="nav">
                ${navItems().map(([icon, name]) => `
                    <button class="${page === name ? 'active' : ''}" data-page="${name}">
                        <span class="ico">${icon}</span>${name}
                    </button>
                `).join('')}
            </nav>
            <div class="sidebar-bottom">
                <button type="button" class="theme-toggle-btn" id="themeToggleBtn" title="Toggle Light/Dark Theme">
                    <span class="theme-icon">${theme === 'dark' ? '☀️' : '🌙'}</span>
                    <span class="theme-text">${theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
                <button type="button" class="logout-btn" id="sidebarLogoutBtn" title="Sign out of your account">
                    <span class="ico">⎋</span> Log Out
                </button>
                <div class="side-art">
                    <strong>Cleaner Cities</strong>
                    <small>Happier communities<br>One report at a time.</small>
                </div>
            </div>
        </aside>

        <main class="main">
            <header class="topbar">
                <button class="icon-btn menu-toggle" id="menuToggle">☰</button>
                <label class="search">
                    ⌕ <input id="searchInput" placeholder="${current.role === 'admin' ? 'Search complaints, incidents, departments…' : 'Search issues, locations, or categories…'}" value="${esc(query)}">
                </label>
                <div class="top-actions">
                    <button class="icon-btn theme-icon-btn" id="topThemeToggle" title="Toggle Theme">
                        ${theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                    <button class="icon-btn" id="bell" title="Notifications">
                        ♧<span class="dot">${unread}</span>
                    </button>
                    <div class="user-mini" data-page="Profile" style="cursor:pointer" title="Click to view & edit Profile">
                        <div class="avatar">${esc((current.name || 'U')[0].toUpperCase())}</div>
                        <div class="user-text">
                            ${esc(current.name)}
                            <small>${current.role === 'admin' ? 'City Operations' : 'Citizen'}</small>
                        </div>
                    </div>
                    <button class="icon-btn logout-icon-btn" id="signout" title="Log Out">⎋</button>
                </div>
            </header>
            <section class="content" id="content"></section>
        </main>
    </div>
    `;
}

function stat(label, value, icon, kind = '') {
    return `<article class="stat"><div class="stat-top"><span class="stat-icon ${kind}">${icon}</span><label>${label}</label></div><strong>${value}</strong><div class="trend">${label === 'Pending' ? '↓ Needs attention' : '↑ Updated recently'}</div></article>`;
}

function statusClass(status) {
    return String(status || '').replace(/\s/g, '-');
}

function cardHead(title, link = '') {
    return `<div class="card-head"><h2>${title}</h2>${link ? `<button class="text-link" data-page="${link}">View all ›</button>` : ''}</div>`;
}

function categoryButtons() {
    return `
    <div class="category-grid" id="categoryGrid">
        ${CATEGORIES.map(category => `
            <button type="button" class="category ${selectedCategory === category.name ? 'selected' : ''}" data-cat="${esc(category.name)}">
                <span class="cat-icon">${category.icon}</span>
                <span class="cat-label">${esc(category.name)}</span>
            </button>
        `).join('')}
    </div>
    `;
}

function reportForm() {
    return `
    <div class="card">
        ${cardHead('Report an Issue')}
        <p style="color:var(--muted);font-size:12px;margin:-6px 0 16px">Click a category card below and provide details about the problem.</p>
        
        ${categoryButtons()}

        <form id="reportForm" style="margin-top:18px">
            <div class="form-grid">
                <div class="field">
                    <label>Issue Title *</label>
                    <input name="title" minlength="5" required placeholder="e.g. Dangerous pothole near market entrance">
                </div>
                <div class="field">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <label>Location / Area *</label>
                        <button type="button" class="text-link" id="detectLocationBtn" style="font-size:11px">📍 Use GPS</button>
                    </div>
                    <input name="location" id="reportLocationInput" minlength="3" required placeholder="Street, sector or landmark">
                </div>
            </div>

            <div class="form-grid" style="margin-top:4px">
                <div class="field">
                    <label>Nearby Landmark (Optional)</label>
                    <input name="landmark" placeholder="e.g. Opposite State Bank branch">
                </div>
                <div class="field">
                    <label>Priority</label>
                    <select name="priority">
                        <option value="medium" selected>Medium (Standard 48h SLA)</option>
                        <option value="high">High (Priority 24h SLA)</option>
                        <option value="urgent">Urgent (Emergency 12h SLA)</option>
                        <option value="low">Low (Standard 96h SLA)</option>
                    </select>
                </div>
            </div>

            <div class="field">
                <label>Description *</label>
                <textarea name="description" rows="3" minlength="10" required placeholder="Describe the issue and any useful details to help engineers resolve it…"></textarea>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;flex-wrap:wrap;gap:10px">
                <button class="btn" type="submit" id="submitReportBtn">＋ Submit civic report</button>
                <span style="font-size:12px;color:var(--muted)">Selected category: <strong id="selectedCatBadge" style="color:var(--green)">${esc(selectedCategory)}</strong></span>
            </div>
        </form>
    </div>
    `;
}

function matches(complaint) {
    const term = query.toLowerCase().trim();
    return !term || [complaint.id, complaint.title, complaint.category, complaint.location, complaint.status, complaint.priority, complaint.citizen]
        .some(value => String(value || '').toLowerCase().includes(term));
}

function table(rows) {
    if (!rows.length) return '<div class="empty">No complaints found.</div>';

    let displayRows = [...rows];
    if (current && current.role === 'admin') {
        displayRows = enrichComplaintsWithClusters(displayRows);
        // Sort priority-wise: higher cluster weight first (more reports on same issue = higher priority)
        displayRows.sort((a, b) => (b.clusterWeight || 0) - (a.clusterWeight || 0));
    }

    return `<div class="table-wrap"><table><thead><tr>
        <th>ID</th>
        <th>Issue</th>
        <th>Category</th>
        <th>Location</th>
        ${current && current.role === 'admin' ? '<th>Crowd Reports</th><th>Department</th><th>Priority</th>' : ''}
        <th>Status</th>
        <th>Date</th>
        <th>Action</th>
    </tr></thead><tbody>${displayRows.map(complaint => {
        const id = esc(complaint.backendId || complaint.id);
        let actions = '—';
        if (current && current.role === 'admin' && complaint.verification_status === 'pending_verification') {
            actions = `<button class="text-link" data-verify="${id}">Verify</button> <button class="text-link" data-reject="${id}">Reject</button>`;
        } else if (current && current.role === 'admin' && complaint.status !== 'Resolved') {
            const options = departments.map(department => `<option value="${esc(department.id)}" ${complaint.department_id === department.id ? 'selected' : ''}>${esc(department.name)}</option>`).join('');
            actions = `${departments.length ? `<select data-assign="${id}" aria-label="Assign department"><option value="">Assign department</option>${options}</select>` : ''}<button class="text-link" data-resolve="${id}">Resolve</button>`;
        } else if (current && current.role === 'citizen' && complaint.status === 'Resolved') {
            actions = `<button class="text-link" data-reopen="${id}">Request reopen</button>`;
        }

        const crowdBadge = (complaint.clusterCount || 1) >= 3
            ? `<span class="cluster-badge urgent">🔥 ${complaint.clusterCount} Reports (Hotspot)</span>`
            : ((complaint.clusterCount || 1) === 2
                ? `<span class="cluster-badge high">⚠️ 2 Reports</span>`
                : `<span class="cluster-badge single">1 Report</span>`);

        const deptDisplay = complaint.department_name
            ? `<span style="font-weight:600;font-size:11px;color:var(--ink)">${esc(complaint.department_name)}</span>`
            : `<span class="cluster-badge high" style="font-size:10px">⚡ Unassigned</span>`;

        const escalationBadge = complaint.is_escalated
            ? `<div style="margin-top:3px"><span class="cluster-badge urgent" style="font-size:9px" title="${esc(complaint.escalation_reason || 'Escalated to Higher Authorities')}">🚨 Escalated to Higher Authorities</span></div>`
            : '';

        return `<tr>
            <td><b>#${esc(complaint.id)}</b></td>
            <td><b>${esc(complaint.title)}</b>${escalationBadge}</td>
            <td><span class="pill" style="font-size:11px">${esc(complaint.category)}</span></td>
            <td>${esc(complaint.location)}</td>
            ${current && current.role === 'admin' ? `<td>${crowdBadge}</td><td>${deptDisplay}</td><td><span class="status ${statusClass(complaint.crowdPriority || complaint.priority)}">${esc(complaint.crowdPriority || complaint.priority)}</span></td>` : ''}
            <td><span class="status ${statusClass(complaint.status)}">${esc(complaint.status)}</span></td>
            <td>${esc(complaint.date)}</td>
            <td>${actions}</td>
        </tr>`;
    }).join('')}</tbody></table></div>`;

}


function citizenHome() {
    const stats = dashboardSummary?.stats || {};
    return `<div class="welcome"><h1>Hello, ${esc(current.name.split(' ')[0])}!</h1><p>Your voice helps make our city cleaner and safer.</p><p class="sub">Report issues, track progress, and be part of a better tomorrow.</p></div><div class="stats">${stat('Total Complaints', stats.total ?? complaints.length, '▤')}${stat('Resolved', stats.resolved ?? 0, '✓')}${stat('Pending', stats.pending ?? 0, '◷', 'amber')}${stat('In Progress', stats.inProgress ?? 0, '▣', 'blue')}</div><div class="grid-two"><div>${reportForm()}</div><div class="card">${cardHead('How it works')}<div class="activity">${[['①', 'Report the issue', 'Choose a category and add the location.'], ['②', 'Team reviews it', 'The relevant department receives your report.'], ['③', 'Track the status', 'Follow updates until the issue is resolved.'], ['④', 'Better neighbourhood', 'Your report helps improve public services.']].map(item => `<div class="activity-item"><span class="activity-icon">${item[0]}</span><div><strong>${item[1]}</strong><small>${item[2]}</small></div></div>`).join('')}</div><div class="notice">♧ Together for a cleaner, safer city! <span>↗</span></div></div></div><div class="card">${cardHead('Recent Complaints', 'My Complaints')}${table(complaints.filter(matches).slice(0, 5))}</div>`;
}

function adminDashboard() {
    const summary = dashboardSummary || {};
    const metrics = summary.metrics || {};
    const priorities = summary.priorityBreakdown || {};
    const statusCounts = { Pending: metrics.pending || 0, 'In Progress': metrics.inProgress || 0, Resolved: metrics.resolved || 0 };
    const total = metrics.total ?? complaints.length;
    const maxPriority = Math.max(1, ...Object.values(priorities));
    const recentActivities = summary.recentActivities || [];
    const departmentSummary = summary.departmentSummary || [];
    return `<div class="page-heading"><div><h1>Good morning, ${esc(current.name.split(' ')[0])}!</h1><p>Here's what's happening in the city today.</p></div><span class="pill">${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span></div><div class="stats">${stat('Total Complaints', total, '▤')}${stat('Resolved', metrics.resolved || 0, '✓')}${stat('Pending', metrics.pending || 0, '◷', 'amber')}${stat('In Progress', metrics.inProgress || 0, '⚙', 'blue')}</div><div class="grid-two"><div class="card">${cardHead('Issue Status')}${Object.entries(statusCounts).map(([label, amount]) => `<div class="bar-row"><span>${label}</span><div class="bar"><span style="width:${Math.max(3, total ? amount / total * 100 : 0)}%"></span></div><b>${amount}</b></div>`).join('')}</div><div class="card">${cardHead('Priority Breakdown')}${[['Urgent', priorities.urgent], ['High', priorities.high], ['Medium', priorities.medium], ['Low', priorities.low]].map(([label, amount]) => `<div class="bar-row"><span>${label}</span><div class="bar"><span style="width:${Math.max(3, (amount || 0) / maxPriority * 100)}%"></span></div><b>${amount || 0}</b></div>`).join('')}</div></div><div class="grid-two"><div class="card">${cardHead('Department Workload')}${departmentSummary.length ? departmentSummary.map(department => `<div class="bar-row"><span>${esc(department.department_name)}</span><div class="bar"><span style="width:${Math.max(3, total ? Number(department.total_complaints || 0) / total * 100 : 0)}%"></span></div><b>${department.total_complaints || 0}</b></div>`).join('') : '<div class="empty">No department data available.</div>'}</div><div class="card">${cardHead('Recent Activities')}<div class="activity">${recentActivities.length ? recentActivities.map(activity => `<div class="activity-item"><span class="activity-icon">▤</span><div><strong>${esc(activity.summary || activity.action || 'Activity')}</strong><small>${esc(activity.timestamp ? new Date(activity.timestamp).toLocaleString() : '')}</small></div></div>`).join('') : '<div class="empty">No recent activity.</div>'}</div></div></div><div class="card">${cardHead('All Complaints', 'Complaints')}${table(complaints.filter(matches).slice(0, 6))}</div><div class="notice">◉ ${metrics.aiSuggestionsAwaitingReview || 0} AI suggestions awaiting review <span>${metrics.overdue || 0} overdue reports</span></div>`;
}

function citizenComplaintList() {
    return `<div class="page-heading"><div><h1>${page === 'Track Status' ? 'Track Status' : 'My Complaints'}</h1><p>Follow the progress of issues reported by you.</p></div><button class="btn" data-page="Report Issue">＋ New Report</button></div><div class="card">${cardHead('Complaint history')}${table(complaints.filter(matches))}</div>`;
}

function profilePage() {
    const prof = currentProfile || {};
    const isCitizen = current.role === 'citizen';
    const initial = esc((current.name || 'U')[0].toUpperCase());

    return `
    <div class="page-heading">
        <div>
            <h1>Profile Settings</h1>
            <p>Manage and update your personal information and contact preferences.</p>
        </div>
        <div style="display:flex;gap:8px">
            <button type="button" class="btn" style="background:#ef4444;border-color:transparent" id="profileLogoutBtn">⎋ Sign Out</button>
        </div>
    </div>

    <div class="profile-layout">
        <div class="card profile-overview-card">
            <div class="profile-avatar-large">${initial}</div>
            <h2 style="margin:12px 0 4px">${esc(current.name)}</h2>
            <div style="color:var(--muted);font-size:12px;word-break:break-all">${esc(current.email)}</div>
            <div style="margin:10px 0">
                <span class="pill badge-role">${isCitizen ? '🟢 Verified Citizen' : '🛡 Municipal Admin'}</span>
            </div>

            <div class="profile-meta-list" style="margin-top:16px;text-align:left;border-top:1px solid var(--line);padding-top:14px;display:flex;flex-direction:column;gap:10px;font-size:12px;width:100%">
                <div class="meta-item" style="display:flex;justify-content:space-between">
                    <span style="color:var(--muted)">Account Role:</span>
                    <strong>${isCitizen ? 'Citizen' : 'Administrator'}</strong>
                </div>
                ${isCitizen ? `
                <div class="meta-item" style="display:flex;justify-content:space-between">
                    <span style="color:var(--muted)">Total Reports:</span>
                    <strong>${complaints.length}</strong>
                </div>
                <div class="meta-item" style="display:flex;justify-content:space-between">
                    <span style="color:var(--muted)">Resolved Reports:</span>
                    <strong>${complaints.filter(c => c.status === 'Resolved').length}</strong>
                </div>
                ` : `
                <div class="meta-item" style="display:flex;justify-content:space-between">
                    <span style="color:var(--muted)">Employee ID:</span>
                    <strong>${esc(prof.employee_id || 'ND-ADM')}</strong>
                </div>
                <div class="meta-item" style="display:flex;justify-content:space-between">
                    <span style="color:var(--muted)">Designation:</span>
                    <strong>${esc(prof.designation || 'Civic Officer')}</strong>
                </div>
                `}
                <div class="meta-item" style="display:flex;justify-content:space-between">
                    <span style="color:var(--muted)">Member Since:</span>
                    <span>${current.created_at ? new Date(current.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '2026'}</span>
                </div>
            </div>
        </div>

        <div class="card">
            ${cardHead('Edit Profile Information')}
            <p style="color:var(--muted);font-size:12px;margin:-6px 0 18px">Update your contact information so municipal authorities can reach you regarding reports.</p>

            <form id="profileEditForm">
                <div class="form-grid">
                    <div class="field">
                        <label>Full Name *</label>
                        <input name="name" value="${esc(current.name || '')}" required minlength="2" placeholder="Your full name">
                    </div>
                    <div class="field">
                        <label>Email Address (Managed)</label>
                        <input value="${esc(current.email || '')}" readonly disabled style="opacity:0.65;cursor:not-allowed">
                    </div>
                </div>

                <div class="form-grid">
                    <div class="field">
                        <label>Phone Number</label>
                        <input name="phone" type="tel" value="${esc(current.phone || prof.phone || '')}" placeholder="+91-9876543210">
                    </div>
                    ${isCitizen ? `
                    <div class="field">
                        <label>Ward / Sector</label>
                        <input name="ward" value="${esc(prof.ward || '')}" placeholder="e.g. Ward 12, Sector 4">
                    </div>
                    ` : `
                    <div class="field">
                        <label>Official Designation</label>
                        <input name="designation" value="${esc(prof.designation || '')}" placeholder="e.g. Municipal Commissioner">
                    </div>
                    `}
                </div>

                ${isCitizen ? `
                <div class="field">
                    <label>Street Address</label>
                    <input name="address" value="${esc(prof.address || '')}" placeholder="House/Flat number, Street name, Locality">
                </div>

                <div class="form-grid">
                    <div class="field">
                        <label>City</label>
                        <input name="city" value="${esc(prof.city || 'Delhi-NCR')}" placeholder="City">
                    </div>
                    <div class="field">
                        <label>Postal Pincode</label>
                        <input name="pincode" value="${esc(prof.pincode || '')}" maxlength="10" placeholder="e.g. 110001">
                    </div>
                </div>

                <div class="field">
                    <label>Preferred Communication Language</label>
                    <select name="preferred_language">
                        <option value="en" ${(!prof.preferred_language || prof.preferred_language === 'en') ? 'selected' : ''}>English</option>
                        <option value="hi" ${prof.preferred_language === 'hi' ? 'selected' : ''}>Hindi (हिन्दी)</option>
                        <option value="pa" ${prof.preferred_language === 'pa' ? 'selected' : ''}>Punjabi (ਪੰਜਾਬੀ)</option>
                        <option value="bn" ${prof.preferred_language === 'bn' ? 'selected' : ''}>Bengali (বাংলা)</option>
                        <option value="mr" ${prof.preferred_language === 'mr' ? 'selected' : ''}>Marathi (मराठी)</option>
                    </select>
                </div>
                ` : ''}

                <div style="display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:20px;border-top:1px solid var(--line);padding-top:16px">
                    <button type="submit" class="btn" id="saveProfileBtn">Save Profile Changes</button>
                </div>
            </form>
        </div>
    </div>
    `;
}

function adminComplaintsPage() {
    const enriched = enrichComplaintsWithClusters(complaints.filter(matches));
    const hotspots = enriched.filter(c => (c.clusterCount || 1) >= 2);
    const urgent = enriched.filter(c => c.crowdPriority === 'Urgent' || c.priority === 'Urgent');
    const escalated = enriched.filter(c => c.is_escalated);
    const pending = enriched.filter(c => c.status === 'Pending');

    let displayed = enriched;
    if (complaintTableFilter === 'hotspots') displayed = hotspots;
    else if (complaintTableFilter === 'urgent') displayed = urgent;
    else if (complaintTableFilter === 'escalated') displayed = escalated;
    else if (complaintTableFilter === 'pending') displayed = pending;

    return `
    <div class="page-heading">
        <div>
            <h1>Complaints Directory</h1>
            <p>Review civic reports, AI-assigned departments, and crowd-prioritized duplicates.</p>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button type="button" class="btn" id="run5DayEscalationBtn" style="font-size:11px;padding:6px 14px;background:#b91c1c;color:#fff">🚨 5-Day SLA Check & Alert Higher Authorities</button>
            <button type="button" class="btn" id="runAiAutoAssignBtn" style="font-size:11px;padding:6px 14px">🤖 n8n AI Auto-Assign Departments</button>
            <span class="pill">${complaints.length} total reports</span>
        </div>
    </div>
    <div class="card">
        ${cardHead('All Complaints')}
        <div class="table-filter-bar">
            <button type="button" class="table-filter-btn ${complaintTableFilter === 'all' ? 'active' : ''}" data-table-filter="all">All (${complaints.length})</button>
            <button type="button" class="table-filter-btn ${complaintTableFilter === 'hotspots' ? 'active' : ''}" data-table-filter="hotspots">🔥 Hotspots & Duplicates (${hotspots.length})</button>
            <button type="button" class="table-filter-btn ${complaintTableFilter === 'escalated' ? 'active' : ''}" data-table-filter="escalated">🚨 5-Day Escalated (${escalated.length})</button>
            <button type="button" class="table-filter-btn ${complaintTableFilter === 'urgent' ? 'active' : ''}" data-table-filter="urgent">⚡ Urgent (${urgent.length})</button>
            <button type="button" class="table-filter-btn ${complaintTableFilter === 'pending' ? 'active' : ''}" data-table-filter="pending">◷ Pending (${pending.length})</button>
        </div>
        ${table(displayed)}
    </div>`;
}

function incidentsPage() {
    const filtered = complaints.filter(matches);
    const clusters = getClusteredIncidents(filtered);
    const hotspots = clusters.filter(c => c.isHotspot);
    const duplicates = clusters.filter(c => c.isDuplicate);

    return `
    <div class="page-heading">
        <div>
            <h1>Civic Incidents & Hotspots</h1>
            <p>Crowd-sourced duplicate detection & priority scaling: more reports on the same issue automatically escalate municipal priority.</p>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button type="button" class="btn" id="runAiAutoAssignBtn" style="font-size:11px;padding:6px 14px">🤖 n8n AI Auto-Assign Departments</button>
            <span class="pill">${clusters.length} incident clusters</span>
        </div>
    </div>

    <div class="stats">
        ${stat('Active Incident Clusters', clusters.length, '⚠')}
        ${stat('Urgent Hotspots (3+ reports)', hotspots.length, '🔥', 'amber')}
        ${stat('High Duplicates (2 reports)', duplicates.length, '⚡', 'blue')}
        ${stat('Total Sub-reports Tracked', complaints.length, '▤')}
    </div>

    ${clusters.length ? clusters.map(cluster => `
        <div class="incident-card ${cluster.crowdPriority.toLowerCase()}">
            <div class="incident-header">
                <div class="incident-title-box">
                    <span class="incident-icon">${cluster.count >= 3 ? '🔥' : (cluster.count === 2 ? '⚠️' : '▤')}</span>
                    <div>
                        <h3 style="margin:0 0 6px;font-size:16px;font-weight:700">${esc(cluster.primary.title)}</h3>
                        <div class="incident-meta-badges">
                            <span class="cluster-badge ${cluster.crowdPriority.toLowerCase()}">
                                ${cluster.count >= 3 ? `🔥 Urgent Hotspot (${cluster.count} Citizen Reports)` : (cluster.count === 2 ? `⚠️ High Priority Duplicate (${cluster.count} Citizen Reports)` : '1 Single Report')}
                            </span>
                            <span class="status ${statusClass(cluster.crowdPriority)}">Escalated Priority: ${cluster.crowdPriority}</span>
                            <span class="pill">📍 ${esc(cluster.location)}</span>
                            <span class="pill">📁 ${esc(cluster.category)}</span>
                            ${cluster.departmentName ? `<span class="pill" style="font-weight:700;color:var(--ink)">🏢 ${esc(cluster.departmentName)}</span>` : '<span class="cluster-badge high">⚡ Department Unassigned</span>'}
                        </div>
                    </div>
                </div>
            </div>

            <div class="incident-subreports">
                <table>
                    <thead>
                        <tr>
                            <th>Tracking ID</th>
                            <th>Citizen Reporter</th>
                            <th>Report Title</th>
                            <th>Reported Location</th>
                            <th>Status</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cluster.reports.map(r => `
                            <tr>
                                <td><b>#${esc(r.id)}</b></td>
                                <td>${esc(r.citizen)}</td>
                                <td>${esc(r.title)}</td>
                                <td>${esc(r.location)}</td>
                                <td><span class="status ${statusClass(r.status)}">${esc(r.status)}</span></td>
                                <td>${esc(r.date)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="incident-actions-bar">
                <div style="font-size:12px;color:var(--muted)">
                    Cluster Operations (${cluster.count} linked reports):
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                    ${departments.length ? `
                        <select data-cluster-assign="${cluster.reports.map(r => r.backendId || r.id).join(',')}" style="font-size:11px;padding:6px 10px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--ink)">
                            <option value="">Batch Assign Department…</option>
                            ${departments.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}
                        </select>
                    ` : ''}
                    <button type="button" class="btn" data-cluster-resolve="${cluster.reports.map(r => r.backendId || r.id).join(',')}" style="font-size:11px;padding:6px 12px;background:#059669">
                        ✓ Batch Resolve Cluster (${cluster.count})
                    </button>
                </div>
            </div>
        </div>
    `).join('') : '<div class="card"><div class="empty">No incidents found matching query.</div></div>'}
    `;
}

function contentForPage() {
    if (page === 'Profile') return profilePage();
    if (current.role === 'admin') {
        if (page === 'Incidents') return incidentsPage();
        if (page === 'Complaints') return adminComplaintsPage();

        if (page === 'Verification') {
            const queue = complaints.filter(complaint => complaint.verification_status === 'pending_verification');
            return `<div class="page-heading"><div><h1>Verification Queue</h1><p>Review resolutions before they are confirmed.</p></div></div><div class="card">${table(queue)}</div>`;
        }
        if (page === 'Departments') {
            return `<div class="page-heading"><div><h1>Departments</h1><p>Active municipal service teams.</p></div></div><div class="card">${departments.length ? departments.map(department => `<div class="bar-row"><span>${esc(department.name)}</span><div class="bar"><span style="width:100%"></span></div><b>${esc(department.code || '')}</b></div>`).join('') : '<div class="empty">No active departments.</div>'}</div>`;
        }
        if (page === 'AI Operations') {
            return `<div class="page-heading"><div><h1>AI Operations</h1><p>Review workflow recommendations before they affect complaint records.</p></div></div><div class="card">${aiSuggestions.length ? aiSuggestions.map(suggestion => `<article class="activity-item"><span class="activity-icon">◉</span><div><strong>${esc(suggestion.suggestion_type)} · ${esc(suggestion.complaint_title || suggestion.public_number || suggestion.complaint_id)}</strong><small>${esc(JSON.stringify(suggestion.suggestion_data || {}))} · ${Math.round(Number(suggestion.confidence_score || 0) * 100)}% confidence</small><p><button class="text-link" data-ai-review="${esc(suggestion.id)}" data-decision="accepted">Accept</button> <button class="text-link" data-ai-review="${esc(suggestion.id)}" data-decision="rejected">Reject</button></p></div></article>`).join('') : '<div class="empty">There are no AI recommendations awaiting review.</div>'}</div>`;
        }
        if (page === 'Reports') return `<div class="page-heading"><div><h1>Reports</h1><p>Summary of civic issues submitted to Nagar Drishti.</p></div><button class="btn" id="exportBtn">Export CSV</button></div><div class="card">${cardHead('Report data')}${table(complaints.filter(matches))}</div>`;
        if (page === 'Settings') return `<div class="page-heading"><div><h1>Settings</h1><p>Account information.</p></div></div><div class="card"><h2>Admin account</h2><p style="margin:12px 0;color:var(--muted)">Signed in as ${esc(current.email)}. Admin accounts are managed by your system administrator.</p></div>`;
        return adminDashboard();
    }
    if (page === 'Report Issue') return `<div class="page-heading"><div><h1>Report an Issue</h1><p>Help the city team understand and resolve the problem.</p></div></div>${reportForm()}`;
    if (page === 'My Complaints' || page === 'Track Status') return citizenComplaintList();
    if (page === 'Notifications') {
        return `<div class="page-heading"><div><h1>Notifications</h1><p>Recent updates about your civic reports.</p></div><button class="text-link" id="markAllRead">Mark all as read</button></div><div class="card"><div class="activity">${notifications.length ? notifications.map(notification => `<div class="activity-item"><span class="activity-icon">${notification.read_at ? '✓' : '♧'}</span><div><strong>${esc(notification.title)}</strong><small>${esc(notification.message)} · ${esc(notification.created_at ? new Date(notification.created_at).toLocaleString() : '')}</small>${!notification.read_at ? `<button class="text-link" data-read="${esc(notification.id)}">Mark as read</button>` : ''}</div></div>`).join('') : '<div class="empty">You have no notifications.</div>'}</div></div>`;
    }
    return citizenHome();
}

function renderAuth(mode = 'login', role = 'citizen') {
    app.innerHTML = `
    <div class="auth-wrap">
        <section class="auth-side">
            <div class="auth-badge">● Smart city • Better communities</div>
            <h1>Har Shikayat Par Nazar.</h1>
            <p>See a Problem? Speak Up. Together, Let's Build a Smarter, Cleaner, Safer City.</p>
        </section>
        <section class="auth-main">
            <div class="auth-box">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    ${brand()}
                    <button type="button" class="theme-toggle-btn auth-theme-toggle" id="authThemeToggle" title="Toggle Theme" style="width:auto;padding:5px 10px;font-size:11px">
                        <span class="theme-icon">${theme === 'dark' ? '☀️' : '🌙'}</span>
                    </button>
                </div>
                <h2>${mode === 'login' ? 'Welcome to Nagar Drishti 💚' : 'Create your account'}</h2>
                <p class="muted">${mode === 'login' ? 'Sign in to continue to your Nagar Drishti dashboard.' : 'Join your community and report civic issues.'}</p>
                <div class="auth-switch">
                    <button type="button" class="${role === 'citizen' ? 'active' : ''}" data-role="citizen">Citizen login</button>
                    <button type="button" class="${role === 'admin' ? 'active' : ''}" data-role="admin">Admin login</button>
                </div>
                ${role === 'citizen' ? `
                <div class="auth-switch">
                    <button type="button" class="${mode === 'login' ? 'active' : ''}" data-mode="login">Sign In</button>
                    <button type="button" class="${mode === 'signup' ? 'active' : ''}" data-mode="signup">Register</button>
                </div>` : ''}
                <form id="authForm">
                    <div class="field">
                        <label>Email address</label>
                        <input type="email" name="email" placeholder="${role === 'admin' ? 'admin@nagardrishti.gov.in' : 'you@example.com'}" required>
                    </div>
                    <div class="field">
                        <label>Password</label>
                        <input type="password" name="password" minlength="6" placeholder="Enter your password" required>
                    </div>
                    ${mode === 'signup' ? '<div class="field"><label>Full name</label><input name="name" minlength="2" placeholder="Your full name" required></div>' : ''}
                    <button class="btn" type="submit" style="width:100%;margin-top:8px">${mode === 'login' ? 'Sign in' : 'Create account'} →</button>
                </form>
                <p class="auth-foot">By continuing, you agree to use this portal responsibly. Keep reports accurate and respectful.</p>
                ${role === 'admin' ? '<div class="auth-note">Admin access is controlled by your system administrator. Use the credentials provided to your department.</div>' : ''}
                <div class="auth-foot">API: ${esc(API_BASE)}</div>
            </div>
        </section>
    </div>`;

    initAiAssistant();

    const authTheme = document.getElementById('authThemeToggle');
    if (authTheme) {
        authTheme.onclick = () => {
            toggleTheme();
            renderAuth(mode, role);
        };
    }

    app.querySelectorAll('[data-role]').forEach(button => {
        button.onclick = () => renderAuth(mode, button.dataset.role);
    });
    app.querySelectorAll('[data-mode]').forEach(button => {
        button.onclick = () => renderAuth(button.dataset.mode, 'citizen');
    });
    document.getElementById('authForm').onsubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const submit = form.querySelector('button[type="submit"]');
        const values = Object.fromEntries(new FormData(form));
        submit.disabled = true;
        try {
            const session = await apiRequest(mode === 'signup' ? '/auth/register' : '/auth/login', {
                method: 'POST',
                body: mode === 'signup'
                    ? { name: values.name.trim(), email: values.email.trim(), password: values.password, role: 'citizen' }
                    : { email: values.email.trim(), password: values.password }
            });
            if (session.user.role !== role) throw new Error(`This account is registered as ${session.user.role}, not ${role}.`);
            token = session.token;
            current = session.user;
            currentProfile = session.profile || {};
            localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user: current, profile: currentProfile }));
            page = current.role === 'admin' ? 'Dashboard' : 'Home';
            loadedPage = '';
            await render({ refresh: true });
        } catch (error) {
            notify(error.message);
        } finally {
            submit.disabled = false;
        }
    };
}

function bindContent() {
    // 1. Report Form Handlers & Category Clicks
    const reportFormElement = document.getElementById('reportForm');
    if (reportFormElement) {
        reportFormElement.onsubmit = async event => {
            event.preventDefault();
            const submitBtn = document.getElementById('submitReportBtn');
            if (submitBtn) submitBtn.disabled = true;
            const values = Object.fromEntries(new FormData(reportFormElement));
            const category = CATEGORIES.find(item => item.name === selectedCategory);
            try {
                const created = await apiRequest('/complaints', {
                    method: 'POST',
                    body: {
                        title: values.title.trim(),
                        description: values.description.trim(),
                        location_text: values.location.trim(),
                        priority: values.priority || 'medium',
                        ...(category?.id ? { category_id: category.id } : {})
                    }
                });
                notify(`Complaint submitted: ${created.public_number || created.id}`);
                page = 'My Complaints';
                await render({ refresh: true });
            } catch (error) {
                notify(error.message);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        };
    }

    // Direct click listeners for category cards inside content
    document.querySelectorAll('[data-cat]').forEach(button => {
        button.onclick = (e) => {
            e.preventDefault();
            selectedCategory = button.dataset.cat;
            document.querySelectorAll('[data-cat]').forEach(b => {
                b.classList.toggle('selected', b.dataset.cat === selectedCategory);
            });
            const badge = document.getElementById('selectedCatBadge');
            if (badge) badge.textContent = selectedCategory;
        };
    });

    // GPS location detection
    const detectLocationBtn = document.getElementById('detectLocationBtn');
    if (detectLocationBtn) {
        detectLocationBtn.onclick = () => {
            if (!navigator.geolocation) {
                notify('Geolocation is not supported by your browser.');
                return;
            }
            detectLocationBtn.textContent = '📍 Detecting…';
            navigator.geolocation.getCurrentPosition(
                position => {
                    const lat = position.coords.latitude.toFixed(5);
                    const lng = position.coords.longitude.toFixed(5);
                    const locInput = document.getElementById('reportLocationInput');
                    if (locInput) locInput.value = `GPS: ${lat}, ${lng}`;
                    detectLocationBtn.textContent = '📍 Located!';
                    notify(`Location detected: ${lat}, ${lng}`);
                    setTimeout(() => { detectLocationBtn.textContent = '📍 Use GPS'; }, 3000);
                },
                err => {
                    detectLocationBtn.textContent = '📍 Use GPS';
                    notify(`Location error: ${err.message || 'Permission denied'}`);
                },
                { timeout: 8000 }
            );
        };
    }

    // 2. Profile Editing Form Handler
    const profileForm = document.getElementById('profileEditForm');
    if (profileForm) {
        profileForm.onsubmit = async event => {
            event.preventDefault();
            const submitBtn = document.getElementById('saveProfileBtn');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Saving changes…';
            }
            const values = Object.fromEntries(new FormData(profileForm));
            try {
                const updated = await apiRequest('/auth/profile', {
                    method: 'PUT',
                    body: {
                        name: values.name?.trim(),
                        phone: values.phone?.trim() || null,
                        ...(current.role === 'citizen' ? {
                            address: values.address?.trim() || null,
                            ward: values.ward?.trim() || null,
                            city: values.city?.trim() || 'Delhi-NCR',
                            pincode: values.pincode?.trim() || null,
                            preferred_language: values.preferred_language || 'en'
                        } : {
                            designation: values.designation?.trim() || null
                        })
                    }
                });
                if (updated.user) current = updated.user;
                if (updated.profile) currentProfile = updated.profile;
                localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user: current, profile: currentProfile }));
                notify('Profile updated successfully! ✨');
                document.querySelectorAll('.user-text').forEach(el => {
                    el.innerHTML = `${esc(current.name)}<small>${current.role === 'admin' ? 'City Operations' : 'Citizen'}</small>`;
                });
                document.querySelectorAll('.avatar').forEach(el => {
                    el.textContent = esc((current.name || 'U')[0].toUpperCase());
                });
                document.getElementById('content').innerHTML = contentForPage();
                bindContent();
            } catch (error) {
                notify(`Update failed: ${error.message}`);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Save Profile Changes';
                }
            }
        };
    }

    const profileLogout = document.getElementById('profileLogoutBtn');
    if (profileLogout) {
        profileLogout.onclick = () => doLogout();
    }

    // 3. Admin & Workflow Actions
    document.querySelectorAll('[data-assign]').forEach(select => {
        select.onchange = async () => {
            if (!select.value) return;
            try {
                await apiRequest(`/admin/complaints/${encodeURIComponent(select.dataset.assign)}/assign`, {
                    method: 'POST', body: { department_id: select.value }
                });
                notify('Complaint assigned to the department.');
                await render({ refresh: true });
            } catch (error) {
                notify(error.message);
            }
        };
    });
    document.querySelectorAll('[data-resolve]').forEach(button => {
        button.onclick = async () => {
            const notes = prompt('Enter resolution notes:');
            if (!notes?.trim()) return;
            try {
                await apiRequest(`/admin/complaints/${encodeURIComponent(button.dataset.resolve)}/resolve`, {
                    method: 'POST', body: { resolution_notes: notes.trim() }
                });
                notify('Resolution submitted for verification.');
                await render({ refresh: true });
            } catch (error) {
                notify(error.message);
            }
        };
    });
    document.querySelectorAll('[data-verify], [data-reject]').forEach(button => {
        button.onclick = async () => {
            const decision = button.hasAttribute('data-verify') ? 'verified' : 'rejected';
            const id = button.dataset.verify || button.dataset.reject;
            try {
                await apiRequest(`/admin/complaints/${encodeURIComponent(id)}/verify`, {
                    method: 'POST', body: { decision }
                });
                notify(`Complaint resolution ${decision}.`);
                await render({ refresh: true });
            } catch (error) {
                notify(error.message);
            }
        };
    });
    document.querySelectorAll('[data-reopen]').forEach(button => {
        button.onclick = async () => {
            const reason = prompt('Why does this complaint need to be reopened?');
            if (!reason?.trim()) return;
            try {
                await apiRequest(`/complaints/${encodeURIComponent(button.dataset.reopen)}/reopen`, {
                    method: 'POST', body: { reason: reason.trim() }
                });
                notify('Reopen request submitted.');
                await render({ refresh: true });
            } catch (error) {
                notify(error.message);
            }
        };
    });
    document.querySelectorAll('[data-read]').forEach(button => {
        button.onclick = async () => {
            try {
                await apiRequest(`/notifications/${encodeURIComponent(button.dataset.read)}/read`, { method: 'PATCH' });
                await render({ refresh: true });
            } catch (error) {
                notify(error.message);
            }
        };
    });
    const markAllRead = document.getElementById('markAllRead');
    if (markAllRead) {
        markAllRead.onclick = async () => {
            try {
                await apiRequest('/notifications/read-all', { method: 'PATCH' });
                await render({ refresh: true });
            } catch (error) {
                notify(error.message);
            }
        };
    }
    document.querySelectorAll('[data-ai-review]').forEach(button => {
        button.onclick = async () => {
            try {
                await apiRequest(`/admin/ai/review/${encodeURIComponent(button.dataset.aiReview)}`, {
                    method: 'POST', body: { decision: button.dataset.decision }
                });
                notify(`AI recommendation ${button.dataset.decision}.`);
                await render({ refresh: true });
            } catch (error) {
                notify(error.message);
            }
        };
    });

    // 4. Incident Cluster & Hotspot Batch Actions
    document.querySelectorAll('[data-cluster-assign]').forEach(select => {
        select.onchange = async () => {
            if (!select.value) return;
            const ids = select.dataset.clusterAssign.split(',').map(s => s.trim()).filter(Boolean);
            try {
                await apiRequest('/admin/clusters/assign', {
                    method: 'POST',
                    body: { complaint_ids: ids, department_id: select.value }
                });
                notify(`Batch assigned ${ids.length} complaints to department!`);
                await render({ refresh: true });
            } catch (error) {
                notify(error.message);
            }
        };
    });

    document.querySelectorAll('[data-cluster-resolve]').forEach(button => {
        button.onclick = async () => {
            const ids = button.dataset.clusterResolve.split(',').map(s => s.trim()).filter(Boolean);
            const notes = prompt(`Enter resolution notes for all ${ids.length} linked complaints in this hotspot:`);
            if (!notes?.trim()) return;
            try {
                await apiRequest('/admin/clusters/resolve', {
                    method: 'POST',
                    body: { complaint_ids: ids, resolution_notes: notes.trim() }
                });
                notify(`Batch resolved ${ids.length} complaints in incident cluster!`);
                await render({ refresh: true });
            } catch (error) {
                notify(error.message);
            }
        };
    });

    // 5. Table Quick Filter Tabs
    document.querySelectorAll('[data-table-filter]').forEach(button => {
        button.onclick = async () => {
            complaintTableFilter = button.dataset.tableFilter;
            await render();
        };
    });

    // 6. AI & n8n Autonomous Department Assignment Trigger
    const aiAutoAssignBtn = document.getElementById('runAiAutoAssignBtn');
    if (aiAutoAssignBtn) {
        aiAutoAssignBtn.onclick = async () => {
            aiAutoAssignBtn.disabled = true;
            aiAutoAssignBtn.textContent = '🤖 Evaluating categories…';
            try {
                const res = await apiRequest('/admin/ai/auto-assign', {
                    method: 'POST',
                    body: {}
                });
                notify(`🤖 n8n AI assigned departments to ${res.count || 0} complaint(s)!`);
                await render({ refresh: true });
            } catch (error) {
                notify(`AI Auto-Assign error: ${error.message}`);
            } finally {
                if (aiAutoAssignBtn) {
                    aiAutoAssignBtn.disabled = false;
                    aiAutoAssignBtn.textContent = '🤖 n8n AI Auto-Assign Departments';
                }
            }
        };
    }

    // 7. 5-Day SLA Breach Escalation & Higher Authority Email Dispatch
    const run5DayBtn = document.getElementById('run5DayEscalationBtn');
    if (run5DayBtn) {
        run5DayBtn.onclick = async () => {
            run5DayBtn.disabled = true;
            run5DayBtn.textContent = '🚨 Checking 5-day stagnant issues…';
            try {
                const res = await apiRequest('/webhooks/n8n/escalate-unresponded', {
                    method: 'POST',
                    body: { days_unresponded: 5, send_email: true }
                });
                notify(res.message || '5-Day SLA check complete. Alert emails dispatched to Higher Authorities!');
                await render({ refresh: true });
            } catch (error) {
                notify(`Escalation check error: ${error.message}`);
            } finally {
                if (run5DayBtn) {
                    run5DayBtn.disabled = false;
                    run5DayBtn.textContent = '🚨 5-Day SLA Check & Alert Higher Authorities';
                }
            }
        };
    }


    const exportButton = document.getElementById('exportBtn');
    if (exportButton) {
        exportButton.onclick = () => {
            const rows = [['ID', 'Issue', 'Category', 'Location', 'Status', 'Date', 'Priority'], ...complaints.map(item => [item.id, item.title, item.category, item.location, item.status, item.date, item.priority])];
            const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
            const link = document.createElement('a');
            link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
            link.download = 'nagar-drishti-reports.csv';
            link.click();
            URL.revokeObjectURL(link.href);
        };
    }
}

function render({ refresh = false } = {}) {
    if (!current || !token) return renderAuth();
    const requestId = ++renderSequence;
    const requestedPage = page;
    app.innerHTML = shell();
    const content = document.getElementById('content');
    if (refresh || loadedPage !== page) {
        content.innerHTML = '<div class="empty">Loading your latest data…</div>';
        loadPageData(requestedPage).then(() => {
            if (requestId !== renderSequence) return;
            content.innerHTML = contentForPage();
            bindContent();
        }).catch(error => {
            if (requestId !== renderSequence) return;
            if (/HTTP 401|token has expired|Invalid authentication token/i.test(error.message)) {
                clearSession();
                renderAuth();
            } else {
                content.innerHTML = `<div class="notice">Unable to load data: ${esc(error.message)}</div>`;
            }
        });
    } else {
        content.innerHTML = contentForPage();
        bindContent();
    }

    // Theme toggles
    const topThemeBtn = document.getElementById('topThemeToggle');
    if (topThemeBtn) topThemeBtn.onclick = () => toggleTheme();
    const sideThemeBtn = document.getElementById('themeToggleBtn');
    if (sideThemeBtn) sideThemeBtn.onclick = () => toggleTheme();

    // Log out buttons
    const signoutBtn = document.getElementById('signout');
    if (signoutBtn) signoutBtn.onclick = () => doLogout();
    const sideLogoutBtn = document.getElementById('sidebarLogoutBtn');
    if (sideLogoutBtn) sideLogoutBtn.onclick = () => doLogout();

    // Navigation items
    app.querySelectorAll('[data-page]').forEach(button => {
        button.onclick = () => {
            page = button.dataset.page;
            query = '';
            render();
        };
    });

    // Search bar
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.oninput = event => {
            query = event.target.value;
            const position = event.target.selectionStart;
            document.getElementById('content').innerHTML = contentForPage();
            bindContent();
            const input = document.getElementById('searchInput');
            if (input) {
                input.value = query;
                input.focus();
                input.setSelectionRange(position, position);
            }
        };
    }

    // Bell / Notifications
    const bellBtn = document.getElementById('bell');
    if (bellBtn) {
        bellBtn.onclick = () => {
            page = current.role === 'admin' ? 'Complaints' : 'Notifications';
            render();
        };
    }

    // Mobile menu toggle
    const menuToggle = document.getElementById('menuToggle');
    if (menuToggle) {
        menuToggle.onclick = () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('open');
        };
    }
}

// Global click event delegation for category cards
document.addEventListener('click', event => {
    const catBtn = event.target.closest('[data-cat]');
    if (catBtn) {
        event.preventDefault();
        selectedCategory = catBtn.dataset.cat;
        document.querySelectorAll('[data-cat]').forEach(b => {
            b.classList.toggle('selected', b.dataset.cat === selectedCategory);
        });
        const badge = document.getElementById('selectedCatBadge');
        if (badge) badge.textContent = selectedCategory;
    }
});

// ==========================================================
// AI ASSISTANT WIDGET & n8n WORKFLOW INTEGRATION
// ==========================================================
const N8N_WEBHOOK_KEY = 'nd_n8n_chat_webhook';
let isAiChatOpen = false;

function formatAiText(text = '') {
    return esc(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/• (.*?)(?=(\n|$))/g, '<li style="margin-left:16px">$1</li>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>');
}

function initAiAssistant() {
    if (document.getElementById('aiFabBtn')) return;

    const savedWebhook = localStorage.getItem(N8N_WEBHOOK_KEY) || '';

    // Create FAB
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'aiFabBtn';
    fab.className = 'ai-fab-btn';
    fab.title = 'Open Nagar Drishti AI Assistant (n8n Workflow)';
    fab.innerHTML = `
        <span class="ai-fab-pulse"></span>
        <span>✨ Civic AI</span>
    `;

    // Create Chat Window
    const chatWindow = document.createElement('div');
    chatWindow.id = 'aiChatWindow';
    chatWindow.className = 'ai-chat-window closed';
    chatWindow.innerHTML = `
        <div class="ai-chat-header">
            <div class="ai-chat-header-title">
                <div class="ai-chat-avatar">🤖</div>
                <div>
                    <h3>Nagar Drishti AI</h3>
                    <small><span class="ai-fab-pulse" style="width:6px;height:6px"></span> n8n Workflow ${savedWebhook ? '(Custom)' : '(Active)'}</small>
                </div>
            </div>
            <div style="display:flex;gap:6px">
                <button type="button" class="ai-header-btn" id="aiConfigToggle" title="Configure n8n Webhook">⚙️</button>
                <button type="button" class="ai-header-btn" id="aiCloseBtn" title="Close AI Assistant">✕</button>
            </div>
        </div>

        <div class="ai-config-drawer" id="aiConfigDrawer">
            <label>n8n Webhook Connection</label>
            <p style="color:var(--muted);margin:0 0 6px">Connect your custom n8n webhook URL or leave blank to use the backend civic engine:</p>
            <input type="url" id="aiWebhookUrlInput" placeholder="https://your-n8n.cloud/webhook/citizen-chat" value="${esc(savedWebhook)}">
            <div class="ai-config-drawer-btns">
                <button type="button" class="btn secondary" id="aiResetWebhookBtn" style="padding:4px 8px">Reset</button>
                <button type="button" class="btn" id="aiSaveWebhookBtn" style="padding:4px 10px">Save Webhook</button>
            </div>
        </div>

        <div class="ai-messages" id="aiMessagesList">
            <div class="ai-msg bot">
                <span class="ai-msg-badge">⚡ n8n Workflow</span>
                <div>
                    Namaste! 🙏 I am your <strong>Nagar Drishti Civic AI</strong>, powered by an autonomous <strong>n8n workflow</strong>.<br><br>
                    How can I assist you today? You can ask about:
                    <ul style="margin:6px 0 0;padding:0">
                        <li style="margin-left:16px">Checking your complaint status & SLA</li>
                        <li style="margin-left:16px">How to report potholes, water bursts, or streetlight issues</li>
                        <li style="margin-left:16px">Reopening unresolved complaints</li>
                    </ul>
                </div>
                <div class="ai-chips-list">
                    <button type="button" class="ai-chip" data-query="Check my complaint status">🔍 My complaint status</button>
                    <button type="button" class="ai-chip" data-query="What are the SLA resolution hours for each issue?">⏱ SLA resolution hours</button>
                    <button type="button" class="ai-chip" data-query="How to report road damage / potholes?">🚧 How to report pothole</button>
                    <button type="button" class="ai-chip" data-query="How do I reopen an issue that was not properly fixed?">🔄 Reopen an issue</button>
                </div>
            </div>
        </div>

        <div class="ai-chat-footer">
            <form class="ai-input-form" id="aiChatForm">
                <input type="text" id="aiChatInput" placeholder="Ask about civic issues, complaints, or rules…" autocomplete="off" required>
                <button type="submit" class="ai-send-btn" id="aiSendBtn" title="Send message">➤</button>
            </form>
        </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(chatWindow);

    // Event listeners for open / close
    fab.onclick = () => {
        isAiChatOpen = !isAiChatOpen;
        chatWindow.classList.toggle('closed', !isAiChatOpen);
        if (isAiChatOpen) {
            setTimeout(() => document.getElementById('aiChatInput')?.focus(), 150);
        }
    };

    document.getElementById('aiCloseBtn').onclick = () => {
        isAiChatOpen = false;
        chatWindow.classList.add('closed');
    };

    // Config Drawer
    const configToggle = document.getElementById('aiConfigToggle');
    const configDrawer = document.getElementById('aiConfigDrawer');
    if (configToggle && configDrawer) {
        configToggle.onclick = () => configDrawer.classList.toggle('open');
    }

    const saveWebhookBtn = document.getElementById('aiSaveWebhookBtn');
    if (saveWebhookBtn) {
        saveWebhookBtn.onclick = () => {
            const inputVal = document.getElementById('aiWebhookUrlInput').value.trim();
            if (inputVal) {
                localStorage.setItem(N8N_WEBHOOK_KEY, inputVal);
                notify('n8n Webhook URL saved! 🔗');
            } else {
                localStorage.removeItem(N8N_WEBHOOK_KEY);
                notify('n8n Webhook reset to default.');
            }
            configDrawer.classList.remove('open');
        };
    }

    const resetWebhookBtn = document.getElementById('aiResetWebhookBtn');
    if (resetWebhookBtn) {
        resetWebhookBtn.onclick = () => {
            document.getElementById('aiWebhookUrlInput').value = '';
            localStorage.removeItem(N8N_WEBHOOK_KEY);
            notify('Webhook reset to default civic engine.');
            configDrawer.classList.remove('open');
        };
    }

    // Submit message handler
    const chatForm = document.getElementById('aiChatForm');
    if (chatForm) {
        chatForm.onsubmit = async event => {
            event.preventDefault();
            const input = document.getElementById('aiChatInput');
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            await processAiQuery(text);
        };
    }

    // Chip click delegation
    chatWindow.addEventListener('click', event => {
        const chip = event.target.closest('.ai-chip');
        if (chip && chip.dataset.query) {
            processAiQuery(chip.dataset.query);
        }
    });
}

async function processAiQuery(text) {
    const list = document.getElementById('aiMessagesList');
    if (!list) return;

    // 1. Append User Message
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-msg user';
    userMsg.textContent = text;
    list.appendChild(userMsg);

    // 2. Append Typing Indicator
    const typing = document.createElement('div');
    typing.className = 'ai-typing';
    typing.id = 'aiTypingIndicator';
    typing.innerHTML = '<span></span><span></span><span></span>';
    list.appendChild(typing);
    list.scrollTop = list.scrollHeight;

    const sendBtn = document.getElementById('aiSendBtn');
    if (sendBtn) sendBtn.disabled = true;

    try {
        const customWebhook = localStorage.getItem(N8N_WEBHOOK_KEY);
        let reply = '';
        let sourceTag = '⚡ n8n Workflow';

        if (customWebhook && /^https?:\/\//i.test(customWebhook)) {
            // Direct call to custom n8n webhook
            const res = await fetch(customWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: text,
                    userId: current?.id,
                    userName: current?.name || 'Citizen',
                    email: current?.email,
                    role: current?.role || 'citizen',
                    complaints: complaints.slice(0, 5)
                })
            });
            const data = await res.json();
            reply = data.reply || data.output || data.message || data.response || (typeof data === 'string' ? data : JSON.stringify(data));
            sourceTag = '⚡ n8n Webhook';
        } else {
            // Route through backend /api/ai/chat
            if (!token) {
                reply = 'Please sign in to your Nagar Drishti account to access personalized complaint tracking and verified civic AI assistance.';
            } else {
                const res = await apiRequest('/ai/chat', {
                    method: 'POST',
                    body: { question: text }
                });
                reply = res.reply || 'No response received from civic AI.';
                sourceTag = res.source === 'n8n_workflow' ? '⚡ n8n Workflow' : '🏛 Nagar Drishti AI';
            }
        }

        // 3. Remove Typing & Append Bot Message
        typing.remove();

        const botMsg = document.createElement('div');
        botMsg.className = 'ai-msg bot';
        botMsg.innerHTML = `<span class="ai-msg-badge">${esc(sourceTag)}</span><div>${formatAiText(reply)}</div>`;
        list.appendChild(botMsg);
    } catch (err) {
        typing.remove();
        const errMsg = document.createElement('div');
        errMsg.className = 'ai-msg bot';
        errMsg.style.borderColor = 'var(--danger, #ef4444)';
        errMsg.innerHTML = `<span class="ai-msg-badge" style="color:#ef4444">⚠️ Error</span><div>Could not get a response: ${esc(err.message)}</div>`;
        list.appendChild(errMsg);
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        list.scrollTop = list.scrollHeight;
    }
}

async function startApp() {
    initAiAssistant();
    const saved = readSession();
    if (!saved?.token) {
        clearSession();
        return renderAuth();
    }
    token = saved.token;
    try {
        const profile = await apiRequest('/auth/me');
        current = profile.user;
        currentProfile = profile.profile || {};
        page = current.role === 'admin' ? 'Dashboard' : 'Home';
        await render({ refresh: true });
    } catch (error) {
        clearSession();
        renderAuth();
        notify(`Your saved session could not be restored: ${error.message}`);
    }
}

startApp();
