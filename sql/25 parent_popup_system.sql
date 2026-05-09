-- ClassLog Pro v40
-- Veli Pop-up Duyuru Sistemi Altyapısı

BEGIN;

ALTER TABLE public.classlog_storage
    ADD COLUMN IF NOT EXISTS parent_popup JSONB;

CREATE OR REPLACE FUNCTION public.cl_save_parent_popup(
    p_token TEXT,
    p_class_name TEXT,
    p_popup JSONB
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $fn$
    WITH caller AS (
        SELECT public.cl_check_session(p_token) AS teacher
    ),
    allowed AS (
        SELECT
            (caller.teacher).id IS NOT NULL
            AND public.cl_is_teacher_authorized((caller.teacher), p_class_name, NULL) AS ok
        FROM caller
    ),
    settings AS (
        SELECT public.cl_get_settings_blob() AS settings
    ),
    storage_id AS (
        SELECT public.cl_term_prefix(NULLIF(settings.settings->>'activeTermId', '')) || p_class_name AS id
        FROM settings
    ),
    upsert_row AS (
        INSERT INTO public.classlog_storage (id, students, notes, parent_popup, last_updated)
        SELECT
            storage_id.id,
            '[]'::jsonb,
            '{}'::jsonb,
            public.cl_normalize_parent_notice(p_popup), -- Aynı normalizasyon mantığını kullanıyoruz
            NOW()
        FROM storage_id
        WHERE COALESCE((SELECT ok FROM allowed), false)
        ON CONFLICT (id) DO UPDATE SET
            parent_popup = public.cl_normalize_parent_notice(p_popup),
            last_updated = NOW()
        RETURNING true
    )
    SELECT COALESCE((SELECT true FROM upsert_row LIMIT 1), false)
$fn$;

-- Görünüm fonksiyonlarını güncelle (v2 dahil)
CREATE OR REPLACE FUNCTION cl_get_parent_view(
    p_parent_token TEXT,
    p_subject_id TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_link     classlog_parent_links%ROWTYPE;
    v_settings JSONB;
    v_term_id  TEXT;
    v_base_id  TEXT;
    v_base_row classlog_storage%ROWTYPE;
    v_subject_row classlog_storage%ROWTYPE;
BEGIN
    SELECT * INTO v_link FROM classlog_parent_links WHERE token = p_parent_token AND active = true;
    IF v_link.class_name IS NULL THEN RETURN '{"ok":false,"reason":"invalid"}'::JSONB; END IF;
    v_settings := cl_get_settings_blob();
    v_term_id := NULLIF(v_settings->>'activeTermId', '');
    v_base_id := cl_term_prefix(v_term_id) || v_link.class_name;
    SELECT * INTO v_base_row FROM classlog_storage WHERE id = v_base_id;
    SELECT * INTO v_subject_row FROM classlog_storage WHERE id = v_base_id || '_' || p_subject_id;

    RETURN jsonb_build_object(
        'ok', true,
        'class_name', v_link.class_name,
        'subject_id', p_subject_id,
        'term_id', v_term_id,
        'students', COALESCE(v_base_row.students, '[]'::JSONB),
        'notes', COALESCE(v_base_row.notes, '{}'::JSONB),
        'parent_notice', public.cl_normalize_parent_notice(v_base_row.parent_notice),
        'parent_popup', public.cl_normalize_parent_notice(v_base_row.parent_popup),
        'records', COALESCE(v_subject_row.records, '{}'::JSONB),
        'classRecords', COALESCE(v_subject_row."classRecords", '{}'::JSONB),
        'settings', v_settings,
        'server_ts', NOW(),
        'base_updated_at', v_base_row.last_updated,
        'subject_updated_at', v_subject_row.last_updated
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cl_save_parent_popup(TEXT, TEXT, JSONB) TO anon, authenticated;
ALTER FUNCTION public.cl_save_parent_popup(TEXT, TEXT, JSONB) SET search_path = public, extensions, pg_temp;

COMMIT;
