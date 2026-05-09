// ClassLog Pro - Parent View

let students = [];
let records = {};
let classRecords = {};
let notes = {};
let currentView = 'homework';
let currentSubject = 'turkce';
let currentParentToken = null;
let leaderExpanded = { homework: false, class: false };
let parentSubjectChannel = null;
let parentGlobalChannel = null;
let parentPollTimer = null;
let parentLocalRealtimeCleanup = null;
let parentRefreshInFlight = false;
let lastParentRefreshAt = 0;
let parentUsesLegacyToken = false;
const PARENT_SESSION_STORAGE_KEY = 'cl_parent_session';
const PARENT_SESSION_EXPIRES_STORAGE_KEY = 'cl_parent_session_expires_at';

function escQ(s) {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function renderParentNoticeBar() {
    const bar = document.getElementById('parentNoticeBar');
    if (!bar) return;
    const notice = ClassLogData.parentNotice;
    if (!notice?.text) {
        bar.style.display = 'none';
        bar.innerHTML = '';
        return;
    }
    bar.innerHTML = `
        <div class="notice-icon-wrap">
            <span class="notice-icon-anim">📢</span>
        </div>
        <span class="notice-text-anim">${_htmlEncode(notice.text)}</span>
    `;
    bar.style.display = 'flex';
}

let lastPopupShown = null;
function renderCriticalPopup() {
    const modal = document.getElementById('criticalPopup');
    const content = document.getElementById('criticalPopupContent');
    if (!modal || !content) return;
    
    const popup = ClassLogData.parentPopup;
    if (!popup?.text) {
        modal.style.display = 'none';
        return;
    }

    // Eğer bu mesajı bu oturumda zaten gösterdiysek tekrar açma (kullanıcıyı darlamamak için)
    if (lastPopupShown === popup.text) return;

    content.textContent = popup.text;
    modal.style.display = 'flex';
    lastPopupShown = popup.text;
}

async function syncParentState() {
    const ok = parentUsesLegacyToken
        ? await ClassLogData.syncParent(currentParentToken)
        : await ClassLogData.syncParentSession(currentParentToken);
    if (!ok) return false;
    students = ClassLogData.getStudents();
    records = ClassLogData.getRecords();
    classRecords = ClassLogData.getClassRecords();
    notes = ClassLogData.getNotes();
    return true;
}

function storeParentSession(session) {
    if (!session?.sessionToken) return;
    sessionStorage.setItem(PARENT_SESSION_STORAGE_KEY, session.sessionToken);
    if (session.expiresAt) {
        sessionStorage.setItem(PARENT_SESSION_EXPIRES_STORAGE_KEY, String(session.expiresAt));
    } else {
        sessionStorage.removeItem(PARENT_SESSION_EXPIRES_STORAGE_KEY);
    }
}

function readStoredParentSession() {
    const sessionToken = sessionStorage.getItem(PARENT_SESSION_STORAGE_KEY);
    if (!sessionToken) return null;
    const expiresAt = sessionStorage.getItem(PARENT_SESSION_EXPIRES_STORAGE_KEY);
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
        clearStoredParentSession();
        return null;
    }
    return { sessionToken, expiresAt };
}

function clearStoredParentSession() {
    sessionStorage.removeItem(PARENT_SESSION_STORAGE_KEY);
    sessionStorage.removeItem(PARENT_SESSION_EXPIRES_STORAGE_KEY);
}

let parentLastStateHash = '';

async function refreshParentView(force = false) {
    const now = Date.now();
    if (parentRefreshInFlight) return false;
    if (!force && now - lastParentRefreshAt < 1200) return false;

    parentRefreshInFlight = true;
    try {
        const ok = await syncParentState();
        if (!ok) return false;
        lastParentRefreshAt = Date.now();
        
        const currentStateHash = JSON.stringify({
            students, 
            records, 
            classRecords, 
            notes, 
            currentSubject, 
            currentView,
            parentNotice: ClassLogData.parentNotice,
            parentPopup: ClassLogData.parentPopup // Pop-up değişince de fark edelim
        });
        if (!force && currentStateHash === parentLastStateHash) {
            return true;
        }
        parentLastStateHash = currentStateHash;

        renderSubjectTabs();
        updateBranding();
        renderCurrentView();
        renderParentNoticeBar();
        renderCriticalPopup(); // Pop-up kontrolünü ekledik
        return true;
    } finally {
        parentRefreshInFlight = false;
    }
}

function renderSubjectTabs() {
    const container = document.getElementById('subjectTabsParent');
    if (!container) return;

    const parentSubjects = SUBJECTS.filter(subject => subject.showInParent);
    if (!parentSubjects.find(subject => subject.id === currentSubject) && parentSubjects.length > 0) {
        currentSubject = parentSubjects[0].id;
        ClassLogData.currentSubject = currentSubject;
    }

    container.innerHTML = parentSubjects.map(subject => `
        <button class="subject-tab-parent ${subject.id === currentSubject ? 'active' : ''}"
                style="--tab-color:${subject.color}"
                onclick="switchSubjectParent('${subject.id}')">
            ${_htmlEncode(subject.emoji)} ${_htmlEncode(subject.label)}
        </button>
    `).join('');
}

window.switchSubjectParent = async function(subjectId) {
    currentSubject = subjectId;
    ClassLogData.currentSubject = subjectId;
    renderSubjectTabs();
    await refreshParentView(true);
};

function updateBranding() {
    const classBranding = document.getElementById('classBranding');
    const termBranding = document.getElementById('termBranding');
    const subject = SUBJECTS.find(item => item.id === currentSubject) || SUBJECTS[0];
    const upperSubject = subject.label.toLocaleUpperCase('tr-TR');

    if (termBranding) termBranding.textContent = ClassLogData.getAcademicTermHeader();
    if (!classBranding) return;

    if (currentView === 'homework') {
        classBranding.textContent = `${ClassLogData.currentClass} SINIFI - ${upperSubject} ÖDEV TAKİP ÇİZELGESİ`;
    } else if (currentView === 'class') {
        classBranding.textContent = `${ClassLogData.currentClass} SINIFI - ${upperSubject} DERS İÇİ PERFORMANS`;
    } else {
        classBranding.textContent = `${ClassLogData.currentClass} SINIFI - LİDERLİK TABLOSU`;
    }
}

function renderCurrentView() {
    if (currentView === 'homework') renderExcel();
    else if (currentView === 'class') renderClassView();
    else renderLeader();
}

window.switchView = function(view) {
    currentView = view;
    const homeworkView = document.getElementById('homeworkView');
    const classView = document.getElementById('classView');
    const leaderPanel = document.getElementById('leaderPanel');
    const btnHomework = document.getElementById('btnHomework');
    const btnClass = document.getElementById('btnClass');
    const btnLeader = document.getElementById('btnLeader');
    const legend = document.getElementById('mainLegend');

    [btnHomework, btnClass, btnLeader].forEach(button => button && button.classList.remove('active'));
    if (homeworkView) homeworkView.style.display = 'none';
    if (classView) classView.style.display = 'none';
    if (leaderPanel) leaderPanel.style.display = 'none';

    if (view === 'homework') {
        if (homeworkView) homeworkView.style.display = '';
        if (btnHomework) btnHomework.classList.add('active');
        if (legend) legend.style.display = '';
    } else if (view === 'class') {
        if (classView) classView.style.display = '';
        if (btnClass) btnClass.classList.add('active');
        if (legend) legend.style.display = 'none';
    } else {
        if (leaderPanel) leaderPanel.style.display = 'flex';
        if (btnLeader) btnLeader.classList.add('active');
        if (legend) legend.style.display = 'none';
    }

    updateBranding();
    renderCurrentView();
    renderParentNoticeBar();
};

window.toggleLeader = function() {
    switchView(currentView === 'leader' ? 'homework' : 'leader');
};

function renderExcel() {
    const table = document.getElementById('excelTable');
    if (!table) return;
    const dates = Object.keys(records).sort();

    let headerHTML = '<tr><th class="sticky-col sticky-header student-header">Öğrenciler</th>';
    dates.forEach(date => {
        headerHTML += `<th class="sticky-header date-header">${ClassLogData.formatDate(date)}</th>`;
    });
    headerHTML += '</tr>';
    table.querySelector('thead').innerHTML = headerHTML;

    if (!students.length) {
        table.querySelector('tbody').innerHTML = '<tr><td colspan="99" style="text-align:center;padding:60px;color:var(--p-muted);">Öğrenci listesi henüz oluşturulmamış.</td></tr>';
        return;
    }

    let bodyHTML = '';
    students.forEach((student, idx) => {
        const hasNote = notes[student];
        bodyHTML += `<tr>
            <td class="sticky-col student-name" onclick="showStudentSummaryByIndex(${idx})" style="cursor:pointer;">
                <strong>${_htmlEncode(student)}</strong>${hasNote
                    ? `<span class="note-indicator" onclick="event.stopPropagation();showNoteByIndex(${idx})">?</span>`
                    : ''}
            </td>`;
        dates.forEach(date => {
            const status = records[date] ? records[date][student] : undefined;
            const meta = ClassLogData.getStatusMeta(status);
            let cellClass = 'cell-empty';
            let dot = '';
            if (status !== undefined) {
                dot = `<span class="hw-text-mark" style="font-weight:900;font-size:1.15rem;color:var(--s-${meta.class})">${meta.label}</span>`;
                cellClass = `cell-active cell-${meta.class}`;
            }
            bodyHTML += `<td class="${cellClass}"
                onmouseover="updateStatusInfoByIndex(${idx},'${date}',${JSON.stringify(status)})"
                onclick="updateStatusInfoByIndex(${idx},'${date}',${JSON.stringify(status)},true)">${dot}</td>`;
        });
        bodyHTML += '</tr>';
    });
    table.querySelector('tbody').innerHTML = bodyHTML;
}

function renderClassView() {
    const table = document.getElementById('classTable');
    if (!table) return;

    const dates = Object.keys(classRecords).sort().filter(date =>
        Object.values(classRecords[date] || {}).some(value => {
            const stats = getClassMarkStats(value);
            return stats.pos > 0 || stats.neg > 0;
        })
    );
    const activeStudents = students.filter(student =>
        dates.some(date => {
            const stats = getClassMarkStats(classRecords[date]?.[student]);
            return stats.pos > 0 || stats.neg > 0;
        })
    );

    if (!dates.length || !activeStudents.length) {
        table.querySelector('thead').innerHTML = '';
        table.querySelector('tbody').innerHTML = '<tr><td colspan="2" style="text-align:center;padding:60px 20px;color:var(--p-muted);">Henüz ders içi kaydı bulunmuyor.</td></tr>';
        return;
    }

    let headerHTML = '<tr><th class="sticky-col sticky-header student-header">Öğrenciler</th>';
    dates.forEach(date => {
        const [, month, day] = date.split('-');
        const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
        headerHTML += `<th class="sticky-header class-date-header"><span style="font-size:.75rem;opacity:.8;">${parseInt(day, 10)} ${months[parseInt(month, 10) - 1]}</span></th>`;
    });
    headerHTML += '<th class="sticky-header total-header">Toplam</th></tr>';
    table.querySelector('thead').innerHTML = headerHTML;

    let bodyHTML = '';
    activeStudents.forEach(student => {
        const studentIndex = students.indexOf(student);
        const hasNote = notes[student];
        let posCount = 0;
        let negCount = 0;
        let cells = '';

        dates.forEach(date => {
            const stats = getClassMarkStats(classRecords[date]?.[student]);
            posCount += stats.pos;
            negCount += stats.neg;

            if (stats.pos > 0 || stats.neg > 0) {
                const cellClass = stats.pos > 0 && stats.neg > 0
                    ? 'cell-active'
                    : stats.pos > 0 ? 'cell-pos' : 'cell-neg';
                let marks = '';
                if (stats.pos > 0) {
                    marks += `<span class="class-mark pos-mark">+${stats.pos}</span>`;
                }
                if (stats.neg > 0) {
                    marks += `<span class="class-mark neg-mark">${stats.pos > 0 ? ' ' : ''}−${stats.neg}</span>`;
                }
                cells += `<td class="${cellClass} class-cell" onmouseover="updateClassStatusInfoByIndex(${studentIndex},'${date}',${stats.pos},${stats.neg})">${marks}</td>`;
            } else {
                cells += '<td class="class-cell class-cell-empty"></td>';
            }
        });

        let totalBadge = '<span style="color:#94a3b8">-</span>';
        if (posCount > 0 || negCount > 0) {
            totalBadge = '<div style="display:flex;gap:6px;align-items:center;justify-content:center;font-size:0.85rem">';
            if (posCount > 0) totalBadge += `<span style="color:#16a34a;font-weight:800">+${posCount}</span>`;
            if (posCount > 0 && negCount > 0) totalBadge += '<span style="color:#cbd5e1;font-size:0.7rem">|</span>';
            if (negCount > 0) totalBadge += `<span style="color:#dc2626;font-weight:800">−${negCount}</span>`;
            totalBadge += '</div>';
        }

        cells += `<td class="class-cell total-cell"><span class="total-badge" style="background:#f8fafc;border:1px solid #e2e8f0;padding:2px 8px;width:fit-content;margin:0 auto;height:auto">${totalBadge}</span></td>`;
        bodyHTML += `<tr>
            <td class="sticky-col student-name" onclick="showStudentSummaryClassByIndex(${studentIndex})" style="cursor:pointer;">
                <strong>${_htmlEncode(student)}</strong>${hasNote
                    ? `<span class="note-indicator" onclick="event.stopPropagation();showNoteByIndex(${studentIndex})">?</span>`
                    : ''}
            </td>${cells}</tr>`;
    });

    table.querySelector('tbody').innerHTML = bodyHTML;
}

function renderLeader() {
    const panel = document.getElementById('leaderPanel');
    if (!panel) return;

    const homeworkScores = {};
    const classScores = {};
    students.forEach(student => {
        homeworkScores[student] = Object.values(records).reduce((total, day) => total + (day && day[student] === 1 ? 1 : 0), 0);
        classScores[student] = Object.values(classRecords).reduce((total, day) => total + getClassMarkNet(day?.[student]), 0);
    });

    const nameSorter = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
    const homeworkTop = [...students].sort((a, b) => (homeworkScores[b] - homeworkScores[a]) || nameSorter.compare(a, b));
    const classTop = [...students].sort((a, b) => (classScores[b] - classScores[a]) || nameSorter.compare(a, b));
    const medals = ['🥇', '🥈', '🥉'];
    const rankColors = ['#F59E0B', '#94A3B8', '#CD7C40'];
    const barColors = [
        'linear-gradient(90deg,#F59E0B,#FBBF24)',
        'linear-gradient(90deg,#94A3B8,#CBD5E1)',
        'linear-gradient(90deg,#CD7C40,#D97706)',
        'linear-gradient(90deg,#6366F1,#818CF8)',
        'linear-gradient(90deg,#6366F1,#818CF8)'
    ];

    function podiumHTML(list, scores, unit, type) {
        if (!students.length) return '<p style="color:var(--p-muted);text-align:center;padding:32px 0;">Öğrenci listesi henüz oluşturulmamış.</p>';
        const maxScore = Math.max(1, scores[list[0]] || 0);
        const isExpanded = !!leaderExpanded[type];
        const visibleList = isExpanded ? list : list.slice(0, 5);
        const rows = visibleList.map((student, index) => {
            const score = scores[student] || 0;
            const pct = Math.max(12, Math.round((score / maxScore) * 100));
            const colorIndex = Math.min(index, barColors.length - 1);
            const rankDisplay = medals[index] || `${index + 1}.`;
            return `
                <div class="leader-row rank-${index + 1}" style="animation-delay:${index * 0.07}s">
                    <div class="leader-rank" style="color:${rankColors[index] || '#64748B'}">${rankDisplay}</div>
                    <div class="leader-name">${_htmlEncode(student)}</div>
                    <div class="leader-bar-wrap"><div class="leader-bar" style="width:${pct}%;background:${barColors[colorIndex]}"></div></div>
                    <div class="leader-score">${score} ${unit}</div>
                </div>
            `;
        }).join('');
        const remaining = Math.max(0, list.length - 5);
        if (!remaining) return rows;
        const buttonText = isExpanded ? 'Daha az göster' : `Daha fazlasını gör (${remaining})`;
        return `${rows}
            <button type="button" class="leader-more-btn" onclick="toggleLeaderList('${type}')">${buttonText}</button>
        `;
    }

    panel.innerHTML = `
        <div class="leader-panel-inner">
            <div class="leader-section">
                <h3 class="leader-title">📚 Ödev Liderliği</h3>
                <p class="leader-sub">En çok ödev tamamlayan öğrenciler</p>
                <div class="leader-list">${podiumHTML(homeworkTop, homeworkScores, 'ödev', 'homework')}</div>
            </div>
            <div class="leader-section">
                <h3 class="leader-title">⚡ Ders İçi Liderliği</h3>
                <p class="leader-sub">En yüksek net ders içi puanı</p>
                <div class="leader-list">${podiumHTML(classTop, classScores, 'puan', 'class')}</div>
            </div>
        </div>
    `;
}

window.toggleLeaderList = function(type) {
    if (type !== 'homework' && type !== 'class') return;
    leaderExpanded[type] = !leaderExpanded[type];
    renderLeader();
};

window.showNote = function(student) {
    const note = notes[student];
    if (!note) return;
    const popup = document.getElementById('notePopup');
    if (!popup) return;
    document.getElementById('notePopupContent').innerHTML = `<strong>📝 ${_htmlEncode(student)}</strong><p>${_htmlEncode(note)}</p>`;
    popup.style.display = 'block';
};

function getParentStudentByIndex(index) {
    const numericIndex = Number(index);
    if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= students.length) return null;
    return students[numericIndex] || null;
}

window.showNoteByIndex = function(index) {
    const student = getParentStudentByIndex(index);
    if (!student) return;
    showNote(student);
};

window.showStudentSummaryByIndex = function(index) {
    const student = getParentStudentByIndex(index);
    if (!student) return;
    showStudentSummary(student);
};

window.showStudentSummaryClassByIndex = function(index) {
    const student = getParentStudentByIndex(index);
    if (!student) return;
    showStudentSummaryClass(student);
};

window.updateStatusInfoByIndex = function(index, date, status) {
    const student = getParentStudentByIndex(index);
    if (!student) return;
    updateStatusInfo(student, date, status);
};

window.updateClassStatusInfoByIndex = function(index, date, pos, neg) {
    const student = getParentStudentByIndex(index);
    if (!student) return;
    updateClassStatusInfo(student, date, pos, neg);
};

window.showStudentSummary = function(student) {
    const panel = document.getElementById('statusInfo');
    const count = { tamam: 0, eksik: 0, yarim: 0, kitap: 0, gelmedi: 0 };
    Object.values(records).forEach(day => {
        if (!day || day[student] === undefined) return;
        const value = day[student];
        if (value === 1) count.tamam++;
        else if (value === -1) count.eksik++;
        else if (value === 2) count.yarim++;
        else if (value === 0) count.kitap++;
        else if (value === 3) count.gelmedi++;
    });
    panel.innerHTML = `<div class="student-summary">
        <strong>${_htmlEncode(student)}</strong>
        <span class="ss-item ss-tamam">✓ ${count.tamam}</span>
        <span class="ss-item ss-eksik">✗ ${count.eksik}</span>
        <span class="ss-item ss-yarim">● ${count.yarim}</span>
        <span class="ss-item ss-kitap">● ${count.kitap}</span>
        <span class="ss-item ss-gelmedi">● ${count.gelmedi}</span>
    </div>`;
};

window.showStudentSummaryClass = function(student) {
    const panel = document.getElementById('statusInfo');
    let pos = 0;
    let neg = 0;
    Object.values(classRecords).forEach(day => {
        if (!day) return;
        const stats = getClassMarkStats(day[student]);
        pos += stats.pos;
        neg += stats.neg;
    });
    panel.innerHTML = `<div class="student-summary">
        <strong>${_htmlEncode(student)}</strong>
        <span class="ss-item ss-tamam">+ ${pos}</span>
        <span class="ss-item ss-eksik">− ${neg}</span>
    </div>`;
};

window.updateClassStatusInfo = function(student, date, pos, neg) {
    const panel = document.getElementById('statusInfo');
    const totalPos = Number(pos) || 0;
    const totalNeg = Number(neg) || 0;
    if (!totalPos && !totalNeg) {
        panel.innerHTML = '<span style="opacity:.55;font-weight:400;">Bu tarihte kayıt yok.</span>';
        return;
    }

    const formattedDate = ClassLogData.formatDateLong(date);
    const badges = [];
    if (totalPos > 0) {
        badges.push(`<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#DCFCE7;color:#166534;font-weight:800;">+ ${totalPos}</span>`);
    }
    if (totalNeg > 0) {
        badges.push(`<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#FFE4E6;color:#9F1239;font-weight:800;">− ${totalNeg}</span>`);
    }
    panel.innerHTML = `<div class="status-info-badge" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        <strong>${_htmlEncode(student)}</strong> · ${formattedDate}: ${badges.join('')}
    </div>`;
};

window.updateStatusInfo = function(student, date, status) {
    const panel = document.getElementById('statusInfo');
    if (status === undefined || status === null || String(status) === 'undefined') {
        panel.innerHTML = '<span style="opacity:.55;font-weight:400;">Bu tarihte kayıt yok.</span>';
        return;
    }
    const meta = ClassLogData.getStatusMeta(status);
    const formattedDate = ClassLogData.formatDateLong(date);
    const colors = {
        '1': { bg: '#DCFCE7', color: '#166534' },
        '-1': { bg: '#FFE4E6', color: '#9F1239' },
        '2': { bg: '#FEF9C3', color: '#854D0E' },
        '0': { bg: '#faf5ff', color: '#7e22ce' },
        '3': { bg: '#f3f4f6', color: '#111827' }
    };
    const color = colors[String(status)] || { bg: 'transparent', color: '#1e293b' };
    panel.innerHTML = `<div class="status-info-badge" style="background:${color.bg};color:${color.color};">
        <strong>${_htmlEncode(student)}</strong> · ${formattedDate}: <span class="dot ${meta.class}"></span> <strong>${meta.text}</strong>
    </div>`;
};

window.manualRefresh = async function() {
    await refreshParentView(true);
};

function subscribeRealtime() {
    window.removeEventListener('focus', parentWindowFocusRefresh);
    document.removeEventListener('visibilitychange', parentVisibilityRefresh);
    window.removeEventListener('online', parentWindowFocusRefresh);
    if (parentSubjectChannel) {
        _supabase.removeChannel(parentSubjectChannel);
        parentSubjectChannel = null;
    }
    if (parentGlobalChannel) {
        _supabase.removeChannel(parentGlobalChannel);
        parentGlobalChannel = null;
    }
    if (parentPollTimer) {
        clearInterval(parentPollTimer);
        parentPollTimer = null;
    }
    if (parentLocalRealtimeCleanup) {
        parentLocalRealtimeCleanup();
        parentLocalRealtimeCleanup = null;
    }
    if (!currentParentToken) return;

    const handler = async () => { await refreshParentView(true); };

    parentGlobalChannel = _supabase
        .channel(CLASSLOG_PARENT_GLOBAL_CHANNEL)
        .on('broadcast', { event: 'refresh' }, handler)
        .subscribe();

    parentLocalRealtimeCleanup = _listenLocalRealtime(CLASSLOG_LOCAL_PARENT_EVENT, payload => {
        if (!payload) return;
        const matchesToken = payload.parentToken && payload.parentToken === currentParentToken;
        const matchesClass = payload.className && payload.className === ClassLogData.currentClass;
        if (!payload.settings && !matchesToken && !matchesClass) return;
        void refreshParentView(true);
    });

    window.addEventListener('focus', parentWindowFocusRefresh);
    document.addEventListener('visibilitychange', parentVisibilityRefresh);
    window.addEventListener('online', parentWindowFocusRefresh);

    parentPollTimer = setInterval(() => {
        if (document.hidden) return;
        void refreshParentView();
    }, 3000);
}

function parentWindowFocusRefresh() {
    void refreshParentView(true);
}

function parentVisibilityRefresh() {
    if (document.visibilityState === 'visible') void refreshParentView(true);
}

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkCode = urlParams.get('link');
    const legacyToken = urlParams.get('id');
    const loading = document.getElementById('loadingScreen');
    const dashboard = document.getElementById('mainDashboard');
    const invalid = document.getElementById('invalidScreen');

    if (linkCode) {
        const session = await ClassLogData.exchangeParentLink(linkCode);
        if (!session?.sessionToken) {
            clearStoredParentSession();
            if (loading) loading.style.display = 'none';
            if (invalid) invalid.style.display = 'flex';
            return;
        }
        storeParentSession(session);
        parentUsesLegacyToken = false;
        currentParentToken = session.sessionToken;
        ClassLogData.parentSessionToken = session.sessionToken;
        try {
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {}
    } else {
        const storedSession = readStoredParentSession();
        if (storedSession?.sessionToken) {
            parentUsesLegacyToken = false;
            currentParentToken = storedSession.sessionToken;
            ClassLogData.parentSessionToken = storedSession.sessionToken;
        } else if (legacyToken) {
            parentUsesLegacyToken = true;
            currentParentToken = legacyToken;
            ClassLogData.parentToken = legacyToken;
            try {
                window.history.replaceState({}, document.title, window.location.pathname);
            } catch (error) {}
            const ok = await ClassLogData.syncParent(legacyToken);
            if (!ok) {
                if (loading) loading.style.display = 'none';
                if (invalid) invalid.style.display = 'flex';
                return;
            }
            if (loading) loading.style.display = 'none';
            if (dashboard) dashboard.style.display = 'flex';
            renderSubjectTabs();
            switchView(currentView);
            renderParentNoticeBar();
            lastParentRefreshAt = Date.now();
            subscribeRealtime();
            return;
        }
    }

    if (!currentParentToken) {
        if (loading) loading.style.display = 'none';
        if (invalid) invalid.style.display = 'flex';
        return;
    }

    ClassLogData.currentSubject = currentSubject;

    const ok = await syncParentState();
    if (!ok) {
        clearStoredParentSession();
        if (loading) loading.style.display = 'none';
        if (invalid) invalid.style.display = 'flex';
        return;
    }

    if (loading) loading.style.display = 'none';
    if (dashboard) dashboard.style.display = 'flex';
    renderSubjectTabs();
    switchView(currentView);
    renderParentNoticeBar();
    lastParentRefreshAt = Date.now();
    subscribeRealtime();
}

init();
