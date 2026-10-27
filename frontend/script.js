const app = document.getElementById('app');
const toastBox = document.getElementById('toast');
const API_BASE = String(window.NAGAR_DRISHTI_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
const SESSION_KEY = 'nd_session';
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

function esc(value = '') {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function notify(message) {
    toastBox.innerHTML = `<div class="toast">${esc(message)}</div>`;
    setTimeout(() => { toastBox.innerHTML = ''; }, 2800);
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
    localStorage.removeItem(SESSION_KEY);
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
        location: item.location_text || '',
        date: item.created_at
            ? new Date(item.created_at).toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: 'numeric' })
            : '',
        priority: String(item.priority || 'medium').replace(/^./, character => character.toUpperCase()),
        citizen: item.reporter_name || current?.name || 'Citizen',
        email: item.reporter_email || current?.email || '',
        status: item.status || 'Pending'
    };
}

async function loadPageData(requestedPage) {
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
        ? [['▦', 'Dashboard'], ['▤', 'Complaints'], ['⚠', 'Incidents'], ['♙', 'Departments'], ['◇', 'Verification'], ['◉', 'AI Operations'], ['▧', 'Reports'], ['⚙', 'Settings']]
        : [['⌂', 'Home'], ['▤', 'Report Issue'], ['▣', 'My Complaints'], ['♧', 'Track Status'], ['♧', 'Notifications'], ['◎', 'Profile']];
}

function shell() {
    const unread = current.role === 'citizen' ? dashboardSummary?.unreadNotificationsCount || 0 : 0;
    return `<div class="shell"><aside class="sidebar" id="sidebar">${brand()}<div class="nav-label">Workspace</div><nav class="nav">${navItems().map(([icon, name]) => `<button class="${page === name ? 'active' : ''}" data-page="${name}"><span class="ico">${icon}</span>${name}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="side-art"><strong>Cleaner Cities</strong><small>Happier communities<br>One report at a time.</small></div></div></aside><main class="main"><header class="topbar"><button class="icon-btn menu-toggle" id="menuToggle">☰</button><label class="search">⌕ <input id="searchInput" placeholder="${current.role === 'admin' ? 'Search complaints, incidents, departments…' : 'Search issues, locations, or categories…'}" value="${esc(query)}"></label><div class="top-actions"><button class="icon-btn" id="bell" title="Notifications">♧<span class="dot">${unread}</span></button><div class="user-mini"><div class="avatar">${esc(current.name[0].toUpperCase())}</div><div class="user-text">${esc(current.name)}<small>${current.role === 'admin' ? 'City Operations' : 'Citizen'}</small></div></div><button class="icon-btn" id="signout" title="Sign out">⌄</button></div></header><section class="content" id="content"></section></main></div>`;
}

function stat(label, value, icon, kind = '') {
    return `<article class="stat"><div class="stat-top"><span class="stat-icon ${kind}">${icon}</span><label>${label}</label></div><strong>${value}</strong><div class="trend">${label === 'Pending' ? '↓ Needs attention' : '↑ Updated recently'}</div></article>`;
}

function statusClass(status) {
    return status.replace(/\s/g, '-');
}

function cardHead(title, link = '') {
    return `<div class="card-head"><h2>${title}</h2>${link ? `<button class="text-link" data-page="${link}">View all ›</button>` : ''}</div>`;
}

function categoryButtons() {
    return `<div class="category-grid">${CATEGORIES.map(category => `<button type="button" class="category ${selectedCategory === category.name ? 'selected' : ''}" data-cat="${esc(category.name)}"><span class="cat-icon">${category.icon}</span>${esc(category.name)}</button>`).join('')}</div>`;
}

function reportForm() {
    return `<div class="card">${cardHead('Report an Issue')}<p style="color:var(--muted);font-size:11px;margin:-6px 0 15px">Select a category and provide details about the problem.</p>${categoryButtons()}<form id="reportForm" style="margin-top:17px"><div class="form-grid"><div class="field"><label>Issue title</label><input name="title" minlength="5" required placeholder="e.g. Pothole on the main road"></div><div class="field"><label>Location / area</label><input name="location" minlength="3" required placeholder="Street, sector or landmark"></div></div><div class="field"><label>Description</label><textarea name="description" minlength="10" required placeholder="Describe the issue and any useful details…"></textarea></div><button class="btn" type="submit">＋ Submit report</button></form></div>`;
}

function matches(complaint) {
    const term = query.toLowerCase().trim();
    return !term || [complaint.id, complaint.title, complaint.category, complaint.location, complaint.status, complaint.priority, complaint.citizen]
        .some(value => String(value || '').toLowerCase().includes(term));
}

function table(rows) {
    if (!rows.length) return '<div class="empty">No complaints found.</div>';
    return `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Issue</th><th>Category</th><th>Location</th><th>Status</th><th>Date</th>${current.role === 'admin' ? '<th>Priority</th>' : ''}<th>Action</th></tr></thead><tbody>${rows.map(complaint => {
        const id = esc(complaint.backendId || complaint.id);
        let actions = '—';
        if (current.role === 'admin' && complaint.verification_status === 'pending_verification') {
            actions = `<button class="text-link" data-verify="${id}">Verify</button> <button class="text-link" data-reject="${id}">Reject</button>`;
        } else if (current.role === 'admin' && complaint.status !== 'Resolved') {
            const options = departments.map(department => `<option value="${esc(department.id)}">${esc(department.name)}</option>`).join('');
            actions = `${departments.length ? `<select data-assign="${id}" aria-label="Assign department"><option value="">Assign department</option>${options}</select>` : ''}<button class="text-link" data-resolve="${id}">Resolve</button>`;
        } else if (current.role === 'citizen' && complaint.status === 'Resolved') {
            actions = `<button class="text-link" data-reopen="${id}">Request reopen</button>`;
        }
        return `<tr><td><b>#${esc(complaint.id)}</b></td><td>${esc(complaint.title)}</td><td>${esc(complaint.category)}</td><td>${esc(complaint.location)}</td><td><span class="status ${statusClass(complaint.status)}">${esc(complaint.status)}</span></td><td>${esc(complaint.date)}</td>${current.role === 'admin' ? `<td>${esc(complaint.priority)}</td>` : ''}<td>${actions}</td></tr>`;
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

function contentForPage() {
    if (current.role === 'admin') {
        if (page === 'Complaints' || page === 'Incidents') return `<div class="page-heading"><div><h1>Complaints</h1><p>Review incoming reports and update their status.</p></div><span class="pill">${complaints.length} total reports</span></div><div class="card">${cardHead('All complaints')}${table(complaints.filter(matches))}</div>`;
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
    if (page === 'Profile') return `<div class="page-heading"><div><h1>Profile</h1><p>Your Nagar Drishti account details.</p></div></div><div class="card profile-card"><div class="profile-avatar">${esc(current.name[0].toUpperCase())}</div><div><h2>${esc(current.name)}</h2><p>${esc(current.email)}</p><p>Citizen account</p></div></div>`;
    return citizenHome();
}

function renderAuth(mode = 'login', role = 'citizen') {
    app.innerHTML = `<div class="auth-wrap"><section class="auth-side"><div class="auth-badge">● Smart city • Better communities</div><h1>Har Shikayat Par Nazar.</h1><p>See a Problem? Speak Up. Together, Let's Build a Smarter, Cleaner, Safer City.</p></section><section class="auth-main"><div class="auth-box">${brand()}<h2>${mode === 'login' ? 'Welcome to Nagar Drishti 💚' : 'Create your account'}</h2><p class="muted">${mode === 'login' ? 'Sign in to continue to your Nagar Drishti dashboard.' : 'Join your community and report civic issues.'}</p><div class="auth-switch"><button type="button" class="${role === 'citizen' ? 'active' : ''}" data-role="citizen">Citizen login</button><button type="button" class="${role === 'admin' ? 'active' : ''}" data-role="admin">Admin login</button></div>${role === 'citizen' ? `<div class="auth-switch"><button type="button" class="${mode === 'login' ? 'active' : ''}" data-mode="login">Sign In</button><button type="button" class="${mode === 'signup' ? 'active' : ''}" data-mode="signup">Register</button></div>` : ''}<form id="authForm"><div class="field"><label>Email address</label><input type="email" name="email" placeholder="${role === 'admin' ? 'admin@nagardrishti.gov.in' : 'you@example.com'}" required></div><div class="field"><label>Password</label><input type="password" name="password" minlength="6" placeholder="Enter your password" required></div>${mode === 'signup' ? '<div class="field"><label>Full name</label><input name="name" minlength="2" placeholder="Your full name" required></div>' : ''}<button class="btn" type="submit" style="width:100%;margin-top:8px">${mode === 'login' ? 'Sign in' : 'Create account'} →</button></form><p class="auth-foot">By continuing, you agree to use this portal responsibly. Keep reports accurate and respectful.</p>${role === 'admin' ? '<div class="auth-note">Admin access is controlled by your system administrator. Use the account provided by your administrator.</div>' : ''}<div class="auth-foot">API: ${esc(API_BASE)}</div></div></section></div>`;

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
            localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user: current }));
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
    const reportFormElement = document.getElementById('reportForm');
    if (reportFormElement) {
        reportFormElement.onsubmit = async event => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(reportFormElement));
            const category = CATEGORIES.find(item => item.name === selectedCategory);
            try {
                const created = await apiRequest('/complaints', {
                    method: 'POST',
                    body: {
                        title: values.title.trim(),
                        description: values.description.trim(),
                        location_text: values.location.trim(),
                        ...(category?.id ? { category_id: category.id } : {})
                    }
                });
                notify(`Complaint submitted: ${created.public_number || created.id}`);
                page = 'My Complaints';
                await render({ refresh: true });
            } catch (error) {
                notify(error.message);
            }
        };
    }

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

    app.querySelectorAll('[data-page]').forEach(button => {
        button.onclick = () => {
            page = button.dataset.page;
            query = '';
            render();
        };
    });
    app.querySelectorAll('[data-cat]').forEach(button => {
        button.onclick = () => {
            selectedCategory = button.dataset.cat;
            document.getElementById('content').innerHTML = contentForPage();
            bindContent();
        };
    });
    document.getElementById('searchInput').oninput = event => {
        query = event.target.value;
        const position = event.target.selectionStart;
        document.getElementById('content').innerHTML = contentForPage();
        bindContent();
        const input = document.getElementById('searchInput');
        input.value = query;
        input.focus();
        input.setSelectionRange(position, position);
    };
    document.getElementById('signout').onclick = () => {
        clearSession();
        complaints = [];
        loadedPage = '';
        renderAuth();
    };
    document.getElementById('bell').onclick = () => {
        page = current.role === 'admin' ? 'Complaints' : 'Notifications';
        render();
    };
    document.getElementById('menuToggle').onclick = () => document.getElementById('sidebar').classList.toggle('open');
}

async function startApp() {
    const saved = readSession();
    if (!saved?.token) {
        clearSession();
        return renderAuth();
    }
    token = saved.token;
    try {
        const profile = await apiRequest('/auth/me');
        current = profile.user;
        page = current.role === 'admin' ? 'Dashboard' : 'Home';
        await render({ refresh: true });
    } catch (error) {
        clearSession();
        renderAuth();
        notify(`Your saved session could not be restored: ${error.message}`);
    }
}

startApp();
