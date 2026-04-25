// ClassLog Pro - Parent View

let students = [];
let records = {};
let classRecords = {};
let notes = {};
let currentView = 'homework';
let currentSubject = 'turkce';
let currentParentToken = null;
let parentSubjectChannel = null;
let parentGlobalChannel = null;
let parentPollTimer = null;
let parentLocalRealtimeCleanup = null;
let parentRefreshInFlight = false;
let lastParentRefreshAt = 0;

function escQ(s) {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function syncParentState() {
    const ok = await ClassLogData.syncParent(currentParentToken);
    if (!ok) return false;
    students = ClassLogData.getStudents();
    records = ClassLogData.getRecords();
    classRecords = ClassLogData.getClassRecords();
    notes = ClassLogData.getNotes();
    return true;
}

async function refreshParentView(force = false) {
    const now = Date.now();
    if (parentRefreshInFlight) return false;
    if (!force && now - lastParentRefreshAt < 1200) return false;

    parentRefreshInFlight = true;
    try {
        const ok = await syncParentState();
        if (!ok) return false;
        lastParentRefreshAt = Date.now();
        renderSubjectTabs();
        updateBranding();
        renderCurrentView();
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
            ${subject.emoji} ${subject.label}
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
    students.forEach(student => {
        const hasNote = notes[student];
        bodyHTML += `<tr>
            <td class="sticky-col student-name" onclick="showStudentSummary('${escQ(student)}')" style="cursor:pointer;">
                <strong>${_htmlEncode(student)}</strong>${hasNote
                    ? `<span class="note-indicator" onclick="event.stopPropagation();showNote('${escQ(student)}')">?</span>`
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
                onmouseover="updateStatusInfo('${escQ(student)}','${date}',${JSON.stringify(status)})"
                onclick="updateStatusInfo('${escQ(student)}','${date}',${JSON.stringify(status)},true)">${dot}</td>`;
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
                cells += `<td class="${cellClass} class-cell" onmouseover="updateClassStatusInfo('${escQ(student)}','${date}',${stats.pos},${stats.neg})">${marks}</td>`;
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
            <td class="sticky-col student-name" onclick="showStudentSummaryClass('${escQ(student)}')" style="cursor:pointer;">
                <strong>${_htmlEncode(student)}</strong>${hasNote
                    ? `<span class="note-indicator" onclick="event.stopPropagation();showNote('${escQ(student)}')">?</span>`
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

    const homeworkTop = [...students].sort((a, b) => homeworkScores[b] - homeworkScores[a]).slice(0, 5).filter(student => homeworkScores[student] > 0);
    const classTop = [...students].sort((a, b) => classScores[b] - classScores[a]).slice(0, 5).filter(student => classScores[student] > 0);
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const rankColors = ['#F59E0B', '#94A3B8', '#CD7C40', '#64748B', '#64748B'];
    const barColors = [
        'linear-gradient(90deg,#F59E0B,#FBBF24)',
        'linear-gradient(90deg,#94A3B8,#CBD5E1)',
        'linear-gradient(90deg,#CD7C40,#D97706)',
        'linear-gradient(90deg,#6366F1,#818CF8)',
        'linear-gradient(90deg,#6366F1,#818CF8)'
    ];

    function podiumHTML(list, scores, unit) {
        if (!list.length) return '<p style="color:var(--p-muted);text-align:center;padding:32px 0;">Henüz kayıt yok.</p>';
        const maxScore = scores[list[0]] || 1;
        return list.map((student, index) => {
            const score = scores[student];
            const pct = Math.max(12, Math.round((score / maxScore) * 100));
            return `
                <div class="leader-row rank-${index + 1}" style="animation-delay:${index * 0.07}s">
                    <div class="leader-rank" style="color:${rankColors[index]}">${medals[index]}</div>
                    <div class="leader-name">${_htmlEncode(student)}</div>
                    <div class="leader-bar-wrap"><div class="leader-bar" style="width:${pct}%;background:${barColors[index]}"></div></div>
                    <div class="leader-score">${score} ${unit}</div>
                </div>
            `;
        }).join('');
    }

    panel.innerHTML = `
        <div class="leader-panel-inner">
            <div class="leader-section">
                <h3 class="leader-title">📚 Ödev Liderliği</h3>
                <p class="leader-sub">En çok ödev tamamlayan öğrenciler</p>
                <div class="leader-list">${podiumHTML(homeworkTop, homeworkScores, 'ödev')}</div>
            </div>
            <div class="leader-section">
                <h3 class="leader-title">⚡ Ders İçi Liderliği</h3>
                <p class="leader-sub">En yüksek net ders içi puanı</p>
                <div class="leader-list">${podiumHTML(classTop, classScores, 'puan')}</div>
            </div>
        </div>
    `;
}

window.showNote = function(student) {
    const note = notes[student];
    if (!note) return;
    const popup = document.getElementById('notePopup');
    if (!popup) return;
    document.getElementById('notePopupContent').innerHTML = `<strong>📝 ${_htmlEncode(student)}</strong><p>${_htmlEncode(note)}</p>`;
    popup.style.display = 'block';
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

    parentSubjectChannel = _supabase
        .channel(_parentSyncChannelName(currentParentToken))
        .on('broadcast', { event: 'refresh' }, handler)
        .subscribe();

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
    const token = urlParams.get('id');
    const loading = document.getElementById('loadingScreen');
    const dashboard = document.getElementById('mainDashboard');
    const invalid = document.getElementById('invalidScreen');

    if (!token) {
        if (loading) loading.style.display = 'none';
        if (invalid) invalid.style.display = 'flex';
        return;
    }

    currentParentToken = token;
    ClassLogData.parentToken = token;
    ClassLogData.currentSubject = currentSubject;

    const ok = await syncParentState();
    if (!ok) {
        if (loading) loading.style.display = 'none';
        if (invalid) invalid.style.display = 'flex';
        return;
    }

    if (loading) loading.style.display = 'none';
    if (dashboard) dashboard.style.display = 'flex';
    renderSubjectTabs();
    switchView(currentView);
    lastParentRefreshAt = Date.now();
    subscribeRealtime();
}

init();
