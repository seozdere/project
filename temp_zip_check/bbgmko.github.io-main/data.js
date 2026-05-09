// Shared data layer for ClassLog Pro

const SUPABASE_URL = "https://hshpppvwuuklewinvjeu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzaHBwcHZ3dXVrbGV3aW52amV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODE1NTcsImV4cCI6MjA5MTc1NzU1N30.gW2UC46GwVUfDMnxceAP_vslXsNRnAuQMqcofhwqsmA";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const CLASSLOG_CLIENT_ID = (() => {
    try {
        const existing = sessionStorage.getItem('classlog_client_id');
        if (existing) return existing;
        const next = `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem('classlog_client_id', next);
        return next;
    } catch (error) {
        return `cl_${Math.random().toString(36).slice(2, 10)}`;
    }
})();
if (typeof window !== 'undefined') window.CLASSLOG_CLIENT_ID = CLASSLOG_CLIENT_ID;
const CLASSLOG_RUNTIME_ID = `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
if (typeof window !== 'undefined') window.CLASSLOG_RUNTIME_ID = CLASSLOG_RUNTIME_ID;

const SCHOOL_NAME = "Büyükşehir Belediyesi Gazi Mustafa Kemal Ortaokulu";
const SCHOOL_SHORT = "BBGMKO";

const SUBJECTS = [
    { id: 'turkce', label: 'Türkçe',          emoji: '📖', color: '#6366F1', showInParent: true  },
    { id: 'mat',    label: 'Matematik',       emoji: '📐', color: '#0EA5E9', showInParent: true  },
    { id: 'fen',    label: 'Fen Bilimleri',   emoji: '🔬', color: '#10B981', showInParent: true  },
    { id: 'sosyal', label: 'Sosyal Bilgiler', emoji: '🌍', color: '#F59E0B', showInParent: true  },
];

const CLASSLOG_PARENT_GLOBAL_CHANNEL = 'classlog_parent_global_v33';
const CLASSLOG_TEACHER_GLOBAL_CHANNEL = 'classlog_teacher_global_v33';
const CLASSLOG_LOCAL_PARENT_EVENT = 'classlog_parent_refresh_local_v34';
const CLASSLOG_LOCAL_TEACHER_EVENT = 'classlog_teacher_refresh_local_v34';
const CLASSLOG_PARENT_TOKEN_CACHE_KEY = 'classlog_parent_tokens_v1';

// Sabit tahta kanalı — QR kodu hiç değişmez
const CLASSLOG_BOARD_FIXED_ID = 'CLASSLOG_BOARD_BBGMKO_V1';
const CLASSLOG_BOARD_CHANNEL  = 'board_auth_' + CLASSLOG_BOARD_FIXED_ID;

function _htmlEncode(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _safeChannelId(value) {
    return encodeURIComponent(String(value)).replace(/%/g, '_');
}

function _adminSyncChannelName(id) {
    return `cl_sync_${_safeChannelId(id)}`;
}

function _parentSyncChannelName(token) {
    return `parent_sync_${_safeChannelId(token)}`;
}

const _channelCache = new Map();
const _browserChannelCache = new Map();

function _readParentTokenCache() {
    try {
        return JSON.parse(localStorage.getItem(CLASSLOG_PARENT_TOKEN_CACHE_KEY) || '{}');
    } catch (error) {
        return {};
    }
}

function _writeParentTokenCache(cache) {
    try {
        localStorage.setItem(CLASSLOG_PARENT_TOKEN_CACHE_KEY, JSON.stringify(cache || {}));
    } catch (error) {}
}

function _clearParentTokenCache() {
    try {
        localStorage.removeItem(CLASSLOG_PARENT_TOKEN_CACHE_KEY);
    } catch (error) {}
}

function _connectRealtimeSocket() {
    try {
        _supabase?.realtime?.connect?.();
    } catch (error) {
        // Socket zaten acik olabilir; sessiz gec.
    }
}

async function _restartRealtimeSocket() {
    try {
        _supabase?.realtime?.disconnect?.();
    } catch (error) {
        // Baglanti zaten kopuk olabilir.
    }
    await new Promise(resolve => setTimeout(resolve, 120));
    _connectRealtimeSocket();
    await new Promise(resolve => setTimeout(resolve, 120));
}

async function _disposeBroadcastChannel(name, channelOverride = null) {
    const cached = _channelCache.get(name);
    _channelCache.delete(name);
    const channel = channelOverride || cached?.channel || null;
    if (!channel) return;
    try {
        await _supabase.removeChannel(channel);
    } catch (error) {
        // Kanal zaten kapanmis olabilir.
    }
}

function _cloneData(value) {
    if (value === null || value === undefined) return value;
    if (typeof structuredClone === 'function') {
        try { return structuredClone(value); } catch (error) {}
    }
    return JSON.parse(JSON.stringify(value));
}

function getClassMarkStats(value) {
    if (value === null || value === undefined || value === '') {
        return { pos: 0, neg: 0 };
    }

    const fromNumber = typeof value === 'string' ? Number(value) : value;
    if (typeof fromNumber === 'number' && Number.isFinite(fromNumber)) {
        if (fromNumber === 1) return { pos: 1, neg: 0 };
        if (fromNumber === -1) return { pos: 0, neg: 1 };
        return { pos: 0, neg: 0 };
    }

    if (typeof value !== 'object') {
        return { pos: 0, neg: 0 };
    }

    const posRaw = Number(value.pos ?? value.plus ?? 0);
    const negRaw = Number(value.neg ?? value.minus ?? 0);
    const pos = Number.isFinite(posRaw) ? Math.max(0, Math.floor(posRaw)) : 0;
    const neg = Number.isFinite(negRaw) ? Math.max(0, Math.floor(negRaw)) : 0;
    return { pos, neg };
}

function normalizeClassMarkEntry(value) {
    const stats = getClassMarkStats(value);
    if (!stats.pos && !stats.neg) return undefined;
    return { pos: stats.pos, neg: stats.neg };
}

function getClassMarkCount(value, status) {
    const stats = getClassMarkStats(value);
    if (status === 1) return stats.pos;
    if (status === -1) return stats.neg;
    return 0;
}

function getClassMarkNet(value) {
    const stats = getClassMarkStats(value);
    return stats.pos - stats.neg;
}

function _getBrowserChannel(name) {
    if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') return null;
    if (_browserChannelCache.has(name)) return _browserChannelCache.get(name);
    const channel = new BroadcastChannel(name);
    _browserChannelCache.set(name, channel);
    return channel;
}

function _emitLocalRealtime(name, payload = {}) {
    if (typeof window === 'undefined') return;
    const eventPayload = { ts: Date.now(), ...payload };
    try {
        localStorage.setItem(name, JSON.stringify(eventPayload));
        localStorage.removeItem(name);
    } catch (error) {}

    try {
        const channel = _getBrowserChannel(name);
        if (channel) channel.postMessage(eventPayload);
    } catch (error) {}
}

function _listenLocalRealtime(name, handler) {
    if (typeof window === 'undefined') return () => {};

    const onStorage = event => {
        if (event.key !== name || !event.newValue) return;
        try { handler(JSON.parse(event.newValue)); }
        catch (error) { handler({ ts: Date.now() }); }
    };

    window.addEventListener('storage', onStorage);

    const channel = _getBrowserChannel(name);
    let onMessage = null;
    if (channel) {
        onMessage = event => handler(event.data || { ts: Date.now() });
        channel.addEventListener('message', onMessage);
    }

    return () => {
        window.removeEventListener('storage', onStorage);
        if (channel && onMessage) channel.removeEventListener('message', onMessage);
    };
}

async function _getBroadcastChannel(name) {
    const cached = _channelCache.get(name);
    if (cached?.promise) return cached.promise;

    _connectRealtimeSocket();

    const channel = _supabase.channel(name);
    const ready = new Promise((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
            if (!settled) {
                settled = true;
                void _disposeBroadcastChannel(name, channel);
                reject(new Error(`Broadcast subscribe timeout: ${name}`));
            }
        }, 8000);

        channel.subscribe(status => {
            if (settled) return;
            if (status === 'SUBSCRIBED') {
                settled = true;
                clearTimeout(timeout);
                resolve(channel);
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                settled = true;
                clearTimeout(timeout);
                void _disposeBroadcastChannel(name, channel);
                reject(new Error(`Broadcast subscribe failed: ${name} (${status})`));
            }
        });
    });

    _channelCache.set(name, { channel, promise: ready });
    return ready;
}

async function _sendBroadcastEvent(name, eventName, payload = {}, attempts = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            if (attempt > 1) {
                await _disposeBroadcastChannel(name);
                await _restartRealtimeSocket();
            }

            const channel = await _getBroadcastChannel(name);
            await channel.send({
                type: 'broadcast',
                event: eventName,
                payload: { ts: Date.now(), ...payload }
            });
            return true;
        } catch (error) {
            lastError = error;
            console.error(`Broadcast send attempt ${attempt} failed:`, name, error);
            await _disposeBroadcastChannel(name);
            if (attempt < attempts) {
                await new Promise(resolve => setTimeout(resolve, 450 * attempt));
            }
        }
    }

    throw lastError || new Error(`Broadcast send failed: ${name}`);
}

async function _broadcastRefresh(name, payload = {}) {
    try {
        await _sendBroadcastEvent(name, 'refresh', payload, 3);
        return true;
    } catch (error) {
        console.error('Broadcast error:', name, error);
        return false;
    }
}

const ClassLogAuth = {
    async login(username, password) {
        try {
            const { data, error } = await _supabase.rpc('cl_authenticate', {
                p_username: username.trim().toLowerCase(),
                p_password: password.trim()
            });
            if (error) {
                console.error('Auth RPC error:', error);
                return { ok: false, reason: 'error' };
            }
            if (!data || !data.ok) return { ok: false, reason: data?.reason || 'wrong' };
            sessionStorage.setItem('cl_session', data.session_token);
            sessionStorage.setItem('cl_teacher', JSON.stringify(data.teacher));
            sessionStorage.setItem('cl_session_kind', data.session_kind || 'teacher');
            return { ok: true, teacher: data.teacher };
        } catch (error) {
            console.error('Login error:', error);
            return { ok: false, reason: 'error' };
        }
    },

    logout() {
        const token = this.getSessionToken();
        if (token) {
            try {
                _supabase.rpc('cl_logout', { p_token: token }).catch(() => {});
            } catch (error) {
                console.error('Logout error:', error);
            }
        }
        sessionStorage.removeItem('cl_session');
        sessionStorage.removeItem('cl_teacher');
        sessionStorage.removeItem('cl_session_kind');
        sessionStorage.removeItem('cl_kiosk');
        sessionStorage.removeItem('cl_kiosk_expires_at');
        sessionStorage.removeItem('cl_kiosk_context');
        sessionStorage.removeItem('cl_kiosk_parent_token');
        sessionStorage.removeItem('cl_board_presence_token');
        sessionStorage.removeItem('cl_board_target_code');
        localStorage.removeItem('cl_last_board_code');
        _clearParentTokenCache();
        ClassLogData.parentToken = null;
        ClassLogData.parentTokenCache = {};
    },

    getSessionToken() {
        return sessionStorage.getItem('cl_session') || null;
    },

    getTeacher() {
        try {
            return JSON.parse(sessionStorage.getItem('cl_teacher') || 'null');
        } catch {
            return null;
        }
    },

    getSessionKind() {
        return sessionStorage.getItem('cl_session_kind') || 'teacher';
    },

    isLoggedIn() {
        return !!this.getTeacher() && !!this.getSessionToken();
    },

    isKioskSession() {
        return this.getSessionKind() === 'kiosk' || sessionStorage.getItem('cl_kiosk') === '1';
    },

    isAdmin() {
        const teacher = this.getTeacher();
        return !!teacher && !this.isKioskSession() && teacher.role === 'admin';
    },

    hasFullTeacherSession() {
        return this.isLoggedIn() && !this.isKioskSession();
    },

    canAccessClass(className) {
        const teacher = this.getTeacher();
        if (!teacher) return false;
        if (teacher.role === 'admin' || !teacher.classes || teacher.classes.length === 0) return true;
        return teacher.classes.includes(className);
    },

    canAccessSubject(subjectId) {
        const teacher = this.getTeacher();
        if (!teacher) return false;
        if (teacher.role === 'admin' || !teacher.subjects || teacher.subjects.length === 0) return true;
        return teacher.subjects.includes(subjectId);
    },

    async changePassword(newPassword) {
        const { data, error } = await _supabase.rpc('cl_change_password', {
            p_token: this.getSessionToken(),
            p_new_password: newPassword.trim()
        });
        return !error && data === true;
    },

    async createKioskSession(context = {}) {
        try {
            const { data, error } = await _supabase.rpc('cl_issue_kiosk_session', {
                p_token: this.getSessionToken(),
                p_class_name: context.className || null,
                p_subject_id: context.subjectId || null,
                p_term_id: context.viewingTermId ?? context.activeTermId ?? null
            });
            if (error) {
                const rawMessage = String(error.message || error.details || error.hint || '').toLowerCase();
                console.error('createKioskSession error:', error);
                if (rawMessage.includes('cl_issue_kiosk_session') && (rawMessage.includes('could not find') || rawMessage.includes('does not exist'))) {
                    throw new Error('Supabase tahta güvenlik güncellemesi eksik. `supabase_v36_scoped_kiosk_security.sql` dosyasını uygulayın.');
                }
                throw new Error(error.message || 'Tahta oturumu oluşturulamadı.');
            }
            if (!data?.ok || !data.session_token) {
                console.error('createKioskSession error:', data);
                if (data?.reason === 'forbidden') {
                    throw new Error('Bu sınıf veya ders için tahta açma yetkiniz yok.');
                }
                if (data?.reason === 'unauthorized') {
                    throw new Error('Oturum geçersiz. Lütfen yeniden giriş yapın.');
                }
                throw new Error('Tahta oturumu oluşturulamadı.');
            }
            return {
                sessionToken: data.session_token,
                sessionKind: data.session_kind || 'kiosk',
                teacher: data.teacher || null,
                expiresAt: data.expires_at || null
            };
        } catch (error) {
            console.error('createKioskSession exception:', error);
            throw error;
        }
    },

    async listTeachers() {
        const { data, error } = await _supabase.rpc('cl_list_teachers', {
            p_token: this.getSessionToken()
        });
        if (error) {
            console.error('listTeachers error:', error);
            return [];
        }
        return data || [];
    },

    async saveTeacher(teacher) {
        const { data, error } = await _supabase.rpc('cl_save_teacher', {
            p_token: this.getSessionToken(),
            p_teacher: teacher
        });
        return !error && data === true;
    },

    async deleteTeacher(id) {
        const { data, error } = await _supabase.rpc('cl_delete_teacher', {
            p_token: this.getSessionToken(),
            p_id: parseInt(id, 10)
        });
        return !error && data === true;
    }
};

const ClassLogData = {
    students: [],
    records: {},
    classRecords: {},
    notes: {},
    parentNotice: null,
    currentClass: '5A',
    currentSubject: 'turkce',
    termString: null,
    activeTermId: null,
    viewingTermId: null,
    terms: [],
    parentToken: null,
    parentTokenCache: _readParentTokenCache(),
    syncMeta: {
        source: 'idle',
        lastSyncAt: null,
        serverTs: null,
        baseUpdatedAt: null,
        subjectUpdatedAt: null
    },
    lastError: null,
    availableClasses: [
        '5A','5B','5C','5D','5E','5F','5G','5H','5I','5İ','5J',
        '6A','6B','6C','6D','6E','6F','6G','6H','6I','6İ','6J',
        '7A','7B','7C','7D','7E','7F','7G','7H','7I','7İ','7J',
        '8A','8B','8C','8D','8E','8F','8G','8H','8I','8İ','8J'
    ],

    _allowedHomeworkStatuses: new Set([1, -1, 0, 2, 3]),
    _allowedClassStatuses: new Set([1, -1]),

    _activeTid() {
        return this.viewingTermId !== null && this.viewingTermId !== undefined
            ? this.viewingTermId
            : (this.activeTermId || null);
    },

    _termPfx() {
        const termId = this._activeTid();
        return termId ? `${termId}__` : '';
    },

    _baseId(cls) {
        return this._termPfx() + (cls || this.currentClass);
    },

    _dbId(cls, subj) {
        return this._termPfx() + (cls || this.currentClass) + '_' + (subj || this.currentSubject);
    },

    getToken(className = this.currentClass) {
        return this.parentTokenCache[className] || null;
    },

    _teacherTermId() {
        return this.viewingTermId !== null && this.viewingTermId !== undefined
            ? this.viewingTermId
            : null;
    },

    _clearError() {
        this.lastError = null;
    },

    _setError(message, detail = null) {
        this.lastError = {
            message: String(message || 'Bilinmeyen hata'),
            detail: detail || null,
            at: new Date().toISOString()
        };
        return this.lastError;
    },

    getLastError() {
        return _cloneData(this.lastError);
    },

    _applySettings(settings) {
        if (!settings || typeof settings !== 'object') return;

        if (Array.isArray(settings.subjects)) {
            SUBJECTS.splice(0, SUBJECTS.length, ...settings.subjects);
            SUBJECTS.forEach(subject => {
                if (subject.showInParent === undefined || subject.showInParent === null) {
                    subject.showInParent = true;
                }
                if (subject.id === 'turkce') subject.showInParent = true;
                if (subject.label === 'Fen Bilgisi') subject.label = 'Fen Bilimleri';
            });
        }

        this.termString = settings.termString || null;
        this.activeTermId = settings.activeTermId || null;
        this.terms = Array.isArray(settings.terms) ? settings.terms : [];
    },

    _normalizeStatusValue(value, kind) {
        if (value === null || value === undefined || value === '') return undefined;
        const parsed = typeof value === 'string' ? Number(value) : value;
        if (!Number.isFinite(parsed)) return undefined;
        const normalized = Number(parsed);
        const allowed = kind === 'class' ? this._allowedClassStatuses : this._allowedHomeworkStatuses;
        return allowed.has(normalized) ? normalized : undefined;
    },

    _sanitizeStatusMap(source, kind) {
        const out = {};
        for (const [date, row] of Object.entries(source || {})) {
            if (!row || typeof row !== 'object') continue;
            const cleanRow = {};
            for (const [student, value] of Object.entries(row)) {
                const normalized = kind === 'class'
                    ? normalizeClassMarkEntry(value)
                    : this._normalizeStatusValue(value, kind);
                if (normalized !== undefined) cleanRow[student] = normalized;
            }
            if (Object.keys(cleanRow).length) out[date] = cleanRow;
        }
        return out;
    },

    _sanitizeStudents(students) {
        return Array.from(new Set((students || []).map(item => String(item || '').trim()).filter(Boolean)));
    },

    _sanitizeNotes(notes) {
        const out = {};
        for (const [student, note] of Object.entries(notes || {})) {
            const cleanStudent = String(student || '').trim();
            const cleanNote = String(note || '').trim();
            if (cleanStudent && cleanNote) out[cleanStudent] = cleanNote;
        }
        return out;
    },

    _normalizeParentNotice(notice) {
        if (!notice || typeof notice !== 'object') return null;
        const text = String(notice.text || '').trim();
        if (!text) return null;
        const expiresAt = notice.expires_at || notice.expiresAt || null;
        if (expiresAt) {
            const parsed = new Date(expiresAt);
            if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) return null;
        }
        return {
            text,
            expires_at: expiresAt || null
        };
    },

    _pruneViewDataToStudents(studentList, dataMap, kind) {
        const allowed = new Set(this._sanitizeStudents(studentList));
        const source = this._sanitizeStatusMap(dataMap || {}, kind);
        const out = {};
        for (const [date, row] of Object.entries(source)) {
            const nextRow = {};
            for (const [student, value] of Object.entries(row || {})) {
                if (allowed.has(student)) nextRow[student] = value;
            }
            if (Object.keys(nextRow).length) out[date] = nextRow;
        }
        return out;
    },

    _pruneNotesToStudents(studentList, notes) {
        const allowed = new Set(this._sanitizeStudents(studentList));
        const source = this._sanitizeNotes(notes || {});
        const out = {};
        for (const [student, note] of Object.entries(source)) {
            if (allowed.has(student)) out[student] = note;
        }
        return out;
    },

    _applySyncMeta(payload, source) {
        this.syncMeta = {
            source: source || 'unknown',
            lastSyncAt: new Date().toISOString(),
            serverTs: payload?.server_ts || null,
            baseUpdatedAt: payload?.base_updated_at || null,
            subjectUpdatedAt: payload?.subject_updated_at || null
        };
    },

    _applyViewPayload(payload) {
        this.students = this._sanitizeStudents(payload?.students || []);
        this.notes = this._pruneNotesToStudents(this.students, payload?.notes || {});
        this.records = this._pruneViewDataToStudents(this.students, payload?.records || {}, 'homework');
        this.classRecords = this._pruneViewDataToStudents(this.students, payload?.classRecords || {}, 'class');
        this.parentNotice = this._normalizeParentNotice(payload?.parent_notice || payload?.parentNotice || null);
        if (payload?.class_name) this.currentClass = payload.class_name;
        if (payload?.settings) this._applySettings(payload.settings);
    },

    async _loadTeacherParentNotice(className = this.currentClass) {
        if (!ClassLogAuth.isAdmin()) {
            this.parentNotice = null;
            return false;
        }
        try {
            const { data, error } = await _supabase.rpc('cl_get_parent_notice', {
                p_token: ClassLogAuth.getSessionToken(),
                p_class_name: className
            });
            if (error) {
                console.error('loadTeacherParentNotice error:', error);
                return false;
            }
            if (data?.ok) {
                this.parentNotice = this._normalizeParentNotice(data.parent_notice || null);
                return true;
            }
        } catch (error) {
            console.error('loadTeacherParentNotice exception:', error);
        }
        return false;
    },

    async _loadParentNoticeByToken(parentToken = this.parentToken) {
        try {
            const { data, error } = await _supabase.rpc('cl_get_parent_notice_by_token', {
                p_parent_token: parentToken
            });
            if (error) {
                console.error('loadParentNoticeByToken error:', error);
                return false;
            }
            if (data?.ok) {
                this.parentNotice = this._normalizeParentNotice(data.parent_notice || null);
                return true;
            }
        } catch (error) {
            console.error('loadParentNoticeByToken exception:', error);
        }
        return false;
    },

    async setClass(className) {
        this.currentClass = className;
        return this.sync();
    },

    async sync() {
        if (!ClassLogAuth.isLoggedIn()) {
            this._setError('Oturum bulunamadı. Lütfen yeniden giriş yapın.');
            return false;
        }
        try {
            const { data, error } = await _supabase.rpc('cl_get_teacher_view', {
                p_token: ClassLogAuth.getSessionToken(),
                p_class_name: this.currentClass,
                p_subject_id: this.currentSubject,
                p_term_id: this._teacherTermId()
            });
            if (error || !data?.ok) {
                console.error('Teacher sync error:', error || data);
                this._setError('Öğretmen verileri yüklenemedi.', error || data);
                return false;
            }
            this._applyViewPayload(data);
            await this._loadTeacherParentNotice(this.currentClass);
            this._applySyncMeta(data, 'teacher');
            this._clearError();
            return true;
        } catch (error) {
            console.error('Sync error:', error);
            this._setError('Öğretmen verileri senkronize edilemedi.', error);
            return false;
        }
    },

    async syncParent(parentToken = this.parentToken) {
        if (!parentToken) {
            this._setError('Veli baglantisi eksik.');
            return false;
        }
        try {
            const { data, error } = await _supabase.rpc('cl_get_parent_view', {
                p_parent_token: parentToken,
                p_subject_id: this.currentSubject
            });
            if (error || !data?.ok) {
                console.error('Parent sync error:', error || data);
                this._setError('Veli verileri yuklenemedi.', error || data);
                return false;
            }
            this.parentToken = parentToken;
            if (data?.class_name) {
                this.parentTokenCache[data.class_name] = parentToken;
                _writeParentTokenCache(this.parentTokenCache);
            }
            this._applyViewPayload(data);
            await this._loadParentNoticeByToken(parentToken);
            this._applySyncMeta(data, 'parent');
            this._clearError();
            return true;
        } catch (error) {
            console.error('Parent sync exception:', error);
            this._setError('Veli verileri senkronize edilemedi.', error);
            return false;
        }
    },

    async syncSettings() {
        if (!ClassLogAuth.isLoggedIn()) {
            this._setError('Ayarlar yuklenemedi; oturum bulunamadi.');
            return false;
        }
        try {
            const { data, error } = await _supabase.rpc('cl_get_settings', {
                p_token: ClassLogAuth.getSessionToken()
            });
            if (error || !data?.ok) {
                console.error('syncSettings error:', error || data);
                this._setError('Ayarlar yuklenemedi.', error || data);
                return false;
            }
            this._applySettings(data.settings || {});
            this._clearError();
            return true;
        } catch (error) {
            console.error('syncSettings exception:', error);
            this._setError('Ayarlar senkronize edilemedi.', error);
            return false;
        }
    },

    async ensureParentToken(className = this.currentClass, forceRefresh = false) {
        if (!forceRefresh && this.parentTokenCache[className]) {
            return this.parentTokenCache[className];
        }
        const { data, error } = await _supabase.rpc('cl_get_parent_link', {
            p_token: ClassLogAuth.getSessionToken(),
            p_class_name: className
        });
        if (error || !data?.ok || !data.parent_token) {
            console.error('ensureParentToken error:', error || data);
            this._setError('Veli linki oluşturulamadı.', error || data);
            return null;
        }
        this.parentTokenCache[className] = data.parent_token;
        _writeParentTokenCache(this.parentTokenCache);
        if (className === this.currentClass) this.parentToken = data.parent_token;
        this._clearError();
        return data.parent_token;
    },

    async upsertBoardPresence({
        boardId = CLASSLOG_BOARD_FIXED_ID,
        boardCode,
        clientToken,
        state = 'waiting',
        ttlSeconds = 45
    } = {}) {
        try {
            const { data, error } = await _supabase.rpc('cl_upsert_board_presence', {
                p_board_id: boardId,
                p_board_code: boardCode,
                p_client_token: clientToken,
                p_state: state,
                p_ttl_seconds: ttlSeconds
            });
            if (error || data !== true) {
                console.error('upsertBoardPresence error:', error || data);
                const rawMessage = String(error?.message || error?.details || error?.hint || '').toLowerCase();
                if (rawMessage.includes('cl_upsert_board_presence') && (rawMessage.includes('could not find') || rawMessage.includes('does not exist'))) {
                    this._setError('Supabase tahta polling guncellemesi eksik.', error);
                }
                return false;
            }
            return true;
        } catch (error) {
            console.error('upsertBoardPresence exception:', error);
            return false;
        }
    },

    async pollBoardCommand({
        clientToken,
        lastCommandId = null
    } = {}) {
        try {
            const { data, error } = await _supabase.rpc('cl_poll_board_command', {
                p_client_token: clientToken,
                p_last_command_id: lastCommandId
            });
            if (error) {
                console.error('pollBoardCommand error:', error);
                const rawMessage = String(error.message || error.details || error.hint || '').toLowerCase();
                if (rawMessage.includes('cl_poll_board_command') && (rawMessage.includes('could not find') || rawMessage.includes('does not exist'))) {
                    this._setError('Supabase tahta polling guncellemesi eksik.', error);
                }
                return null;
            }
            return data || null;
        } catch (error) {
            console.error('pollBoardCommand exception:', error);
            return null;
        }
    },

    async issueBoardCommand({
        boardId = CLASSLOG_BOARD_FIXED_ID,
        boardCode,
        commandType,
        payload = {}
    } = {}) {
        let lastError = null;
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                const { data, error } = await _supabase.rpc('cl_issue_board_command', {
                    p_token: ClassLogAuth.getSessionToken(),
                    p_board_id: boardId,
                    p_board_code: boardCode,
                    p_command_type: commandType,
                    p_payload: payload
                });
                if (error) {
                    console.error('issueBoardCommand error:', error);
                    const rawMessage = String(error.message || error.details || error.hint || '').toLowerCase();
                    if (rawMessage.includes('cl_issue_board_command') && (rawMessage.includes('could not find') || rawMessage.includes('does not exist'))) {
                        throw new Error('Supabase tahta polling guncellemesi eksik. `supabase_v37_board_command_polling.sql` dosyasini uygulayin.');
                    }
                    throw new Error(error.message || 'Tahta komutu gonderilemedi.');
                }
                if (!data?.ok) {
                    if (data?.reason === 'board_not_found') {
                        lastError = new Error('Bu kodla eslesen aktif bir tahta bulunamadi. Tahtadaki kodu yenileyip tekrar deneyin.');
                        if (attempt < 4) {
                            await new Promise(resolve => setTimeout(resolve, 350 * attempt));
                            continue;
                        }
                        throw lastError;
                    }
                    if (data?.reason === 'unauthorized') {
                        throw new Error('Oturum gecersiz. Lutfen yeniden giris yapin.');
                    }
                    throw new Error('Tahta komutu gonderilemedi.');
                }
                return data;
            } catch (error) {
                lastError = error;
                if (attempt < 4) {
                    await new Promise(resolve => setTimeout(resolve, 250 * attempt));
                    continue;
                }
                console.error('issueBoardCommand exception:', error);
                throw error;
            }
        }
        throw lastError || new Error('Tahta komutu gonderilemedi.');
    },

    _clean(recs) {
        return this._sanitizeStatusMap(recs, 'homework');
    },

    async _pushBase(cls) {
        const { data, error } = await _supabase.rpc('cl_save_base', {
            p_token: ClassLogAuth.getSessionToken(),
            p_id: this._baseId(cls),
            p_students: this.students,
            p_notes: this.notes
        });
        if (error || data !== true) {
            console.error('pushBase error:', error || data);
            this._setError('Öğrenci listesi veya notlar kaydedilemedi.', error || data);
            return false;
        }
        this._clearError();
        return true;
    },

    async _pushRecords(cls, subj) {
        const id = this._dbId(cls, subj);
        const { data: existing, error: readError } = await _supabase.rpc('cl_get_teacher_view', {
            p_token: ClassLogAuth.getSessionToken(),
            p_class_name: cls || this.currentClass,
            p_subject_id: subj || this.currentSubject,
            p_term_id: this._teacherTermId()
        });
        if (readError || !existing?.ok) {
            console.error('pushRecords prefetch error:', readError || existing);
            this._setError('Kayıt öncesi mevcut ders verisi okunamadı.', readError || existing);
            return false;
        }
        const { data, error } = await _supabase.rpc('cl_save_records', {
            p_token: ClassLogAuth.getSessionToken(),
            p_id: id,
            p_records: this.records,
            p_class_records: existing.classRecords || this.classRecords
        });
        if (error || data !== true) {
            console.error('pushRecords error:', error || data);
            this._setError('Ödev kaydı kaydedilemedi.', error || data);
            return false;
        }
        this._clearError();
        return true;
    },

    async _pushClassRecords(cls, subj) {
        const id = this._dbId(cls, subj);
        const { data: existing, error: readError } = await _supabase.rpc('cl_get_teacher_view', {
            p_token: ClassLogAuth.getSessionToken(),
            p_class_name: cls || this.currentClass,
            p_subject_id: subj || this.currentSubject,
            p_term_id: this._teacherTermId()
        });
        if (readError || !existing?.ok) {
            console.error('pushClassRecords prefetch error:', readError || existing);
            this._setError('Kayıt öncesi ders içi verisi okunamadı.', readError || existing);
            return false;
        }
        const { data, error } = await _supabase.rpc('cl_save_records', {
            p_token: ClassLogAuth.getSessionToken(),
            p_id: id,
            p_records: existing.records || this.records,
            p_class_records: this.classRecords
        });
        if (error || data !== true) {
            console.error('pushClassRecords error:', error || data);
            this._setError('Ders içi kaydı kaydedilemedi.', error || data);
            return false;
        }
        this._clearError();
        return true;
    },

    async _notifyTeacher(ids, payload = {}) {
        const eventPayload = {
            clientId: CLASSLOG_CLIENT_ID,
            runtimeId: CLASSLOG_RUNTIME_ID,
            className: this.currentClass,
            subjectId: this.currentSubject,
            ...payload
        };
        const channels = [...new Set(ids.map(id => _adminSyncChannelName(id)).concat(CLASSLOG_TEACHER_GLOBAL_CHANNEL))];
        await Promise.all(channels.map(name => _broadcastRefresh(name, eventPayload)));
        _emitLocalRealtime(CLASSLOG_LOCAL_TEACHER_EVENT, { ids, ...eventPayload });
    },

    async _notifyParents(cls = this.currentClass) {
        const token = await this.ensureParentToken(cls);
        if (!token) return false;
        await Promise.all([
            _broadcastRefresh(_parentSyncChannelName(token), { clientId: CLASSLOG_CLIENT_ID, className: cls }),
            _broadcastRefresh(CLASSLOG_PARENT_GLOBAL_CHANNEL, { clientId: CLASSLOG_CLIENT_ID, className: cls })
        ]);
        _emitLocalRealtime(CLASSLOG_LOCAL_PARENT_EVENT, {
            clientId: CLASSLOG_CLIENT_ID,
            className: cls,
            parentToken: token,
            subjectId: this.currentSubject
        });
        return true;
    },

    async _afterWrite(ids, cls = this.currentClass, payload = {}) {
        await this._notifyTeacher(ids, payload);
        await this._notifyParents(cls);
    },

    getStudents() { return _cloneData(this.students) || []; },
    getRecords() { return _cloneData(this.records) || {}; },
    getClassRecords() { return _cloneData(this.classRecords) || {}; },
    getNotes() { return _cloneData(this.notes) || {}; },
    getParentNotice() { return _cloneData(this.parentNotice) || null; },
    getSyncMeta() { return _cloneData(this.syncMeta) || {}; },

    async saveStudents(students) {
        const beforeRecords = JSON.stringify(this.records || {});
        const beforeClassRecords = JSON.stringify(this.classRecords || {});
        this.students = this._sanitizeStudents(students);
        this.notes = this._pruneNotesToStudents(this.students, this.notes);
        this.records = this._pruneViewDataToStudents(this.students, this.records, 'homework');
        this.classRecords = this._pruneViewDataToStudents(this.students, this.classRecords, 'class');
        const ok = await this._pushBase();
        if (ok) {
            if (beforeRecords !== JSON.stringify(this.records || {})) {
                await this._pushRecords();
            }
            if (beforeClassRecords !== JSON.stringify(this.classRecords || {})) {
                await this._pushClassRecords();
            }
            await this._afterWrite([this._baseId(), this._dbId()]);
        }
        return ok;
    },

    async saveRecords(records, payload = {}) {
        this.records = this._sanitizeStatusMap(records, 'homework');
        const ok = await this._pushRecords();
        if (ok) await this._afterWrite([this._dbId()], this.currentClass, payload);
        return ok;
    },

    async saveClassRecords(classRecords, payload = {}) {
        this.classRecords = this._sanitizeStatusMap(classRecords, 'class');
        const ok = await this._pushClassRecords();
        if (ok) await this._afterWrite([this._dbId()], this.currentClass, payload);
        return ok;
    },

    async saveNotes(notes) {
        this.notes = this._sanitizeNotes(notes);
        const ok = await this._pushBase();
        if (ok) await this._afterWrite([this._baseId()]);
        return ok;
    },

    async saveParentNotice({ className = this.currentClass, text = '', expiresAt = null } = {}) {
        if (!ClassLogAuth.isAdmin()) {
            this._setError('Bu işlem yalnızca admin tarafından yapılabilir.');
            return false;
        }
        const cleanText = String(text || '').trim();
        const payload = cleanText
            ? {
                text: cleanText,
                expires_at: expiresAt || null
            }
            : null;

        try {
            const { data, error } = await _supabase.rpc('cl_save_parent_notice', {
                p_token: ClassLogAuth.getSessionToken(),
                p_class_name: className,
                p_notice: payload
            });
            if (error || data !== true) {
                console.error('saveParentNotice error:', error || data);
                const rawMessage = String(error?.message || error?.details || error?.hint || '').toLowerCase();
                if (rawMessage.includes('cl_save_parent_notice') && (rawMessage.includes('could not find') || rawMessage.includes('does not exist'))) {
                    this._setError('Supabase veli uyarı güncellemesi eksik. `supabase_v38_parent_notice_bar.sql` dosyasını uygulayın.', error || data);
                } else {
                    this._setError('Veli uyarısı kaydedilemedi.', error || data);
                }
                return false;
            }
            if (className === this.currentClass) {
                this.parentNotice = this._normalizeParentNotice(payload);
            }
            this._clearError();
            await this._afterWrite([this._baseId(className)], className, { parentNotice: true });
            return true;
        } catch (error) {
            console.error('saveParentNotice exception:', error);
            this._setError('Veli uyarısı kaydedilemedi.', error);
            return false;
        }
    },

    async saveSettings() {
        const payload = {
            subjects: SUBJECTS,
            termString: this.termString || '',
            activeTermId: this.activeTermId || null,
            terms: this.terms || []
        };
        const { data, error } = await _supabase.rpc('cl_save_settings_v2', {
            p_token: ClassLogAuth.getSessionToken(),
            p_settings: payload
        });
        if (error || data !== true) {
            console.error('saveSettings error:', error || data);
            this._setError('Sistem ayarlari kaydedilemedi.', error || data);
            return false;
        }
        await Promise.all([
            _broadcastRefresh(CLASSLOG_PARENT_GLOBAL_CHANNEL, { settings: true }),
            _broadcastRefresh(CLASSLOG_TEACHER_GLOBAL_CHANNEL, { settings: true })
        ]);
        _emitLocalRealtime(CLASSLOG_LOCAL_PARENT_EVENT, { settings: true, className: this.currentClass });
        _emitLocalRealtime(CLASSLOG_LOCAL_TEACHER_EVENT, { settings: true, className: this.currentClass });
        this._clearError();
        return true;
    },

    formatDate(dateStr) {
        const [, month, day] = dateStr.split('-');
        return `${day}/${month}`;
    },

    formatDateLong(dateStr) {
        const [, month, day] = dateStr.split('-');
        const months = ['Oca','Sub','Mar','Nis','May','Haz','Tem','Agu','Eyl','Eki','Kas','Ara'];
        return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1]}`;
    },

    getStatusMeta(status) {
        const metas = {
            '1':  { label: '+', class: 'pos', text: 'Tamam' },
            '-1': { label: '−', class: 'neg', text: 'Eksik' },
            '0':  { label: '●', class: 'neutral', text: 'Kitap Yok' },
            '2':  { label: '●', class: 'half', text: 'Yarım' },
            '3':  { label: '●', class: 'absent', text: 'Gelmedi' }
        };
        return metas[String(status)] || { label: '', class: '', text: '' };
    },

    updateStatusDot() {},

    getAcademicTermHeader() {
        if (this.termString) return this.termString;
        const d = new Date();
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        let ac;
        let t;
        if (m >= 9) {
            ac = `${y}-${y + 1}`;
            t = '1. Donem';
        } else if (m === 1) {
            ac = `${y - 1}-${y}`;
            t = '1. Donem';
        } else {
            ac = `${y - 1}-${y}`;
            t = '2. Donem';
        }
        return `${ac} Egitim Ogretim Yili ${t}`;
    }
};
