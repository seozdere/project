-- ClassLog Pro v39 Patch
-- Updating view functions to include parent_notice column directly

CREATE OR REPLACE FUNCTION cl_get_teacher_view(
    p_token TEXT,
    p_class_name TEXT,
    p_subject_id TEXT,
    p_term_id TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_caller   classlog_teachers%ROWTYPE;
    v_settings JSONB;
    v_term_id  TEXT;
    v_base_id  TEXT;
    v_subject_row classlog_storage%ROWTYPE;
    v_base_row classlog_storage%ROWTYPE;
BEGIN
    v_caller := cl_check_session(p_token);
    IF v_caller.id IS NULL THEN
        RETURN '{"ok":false,"reason":"unauthorized"}'::JSONB;
    END IF;

    IF NOT cl_is_teacher_authorized(v_caller, p_class_name, p_subject_id) THEN
        RETURN '{"ok":false,"reason":"forbidden"}'::JSONB;
    END IF;

    v_settings := cl_get_settings_blob();
    v_term_id := COALESCE(NULLIF(trim(p_term_id), ''), NULLIF(v_settings->>'activeTermId', ''));
    v_base_id := cl_term_prefix(v_term_id) || p_class_name;

    SELECT * INTO v_base_row
    FROM classlog_storage
    WHERE id = v_base_id;

    SELECT * INTO v_subject_row
    FROM classlog_storage
    WHERE id = v_base_id || '_' || p_subject_id;

    RETURN jsonb_build_object(
        'ok', true,
        'class_name', p_class_name,
        'subject_id', p_subject_id,
        'term_id', v_term_id,
        'students', COALESCE(v_base_row.students, '[]'::JSONB),
        'notes', COALESCE(v_base_row.notes, '{}'::JSONB),
        'parent_notice', public.cl_normalize_parent_notice(v_base_row.parent_notice),
        'records', COALESCE(v_subject_row.records, '{}'::JSONB),
        'classRecords', COALESCE(v_subject_row."classRecords", '{}'::JSONB),
        'settings', v_settings,
        'server_ts', NOW(),
        'base_updated_at', v_base_row.last_updated,
        'subject_updated_at', v_subject_row.last_updated
    );
END;
$$;

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
    SELECT * INTO v_link
    FROM classlog_parent_links
    WHERE token = p_parent_token
      AND active = true;

    IF v_link.class_name IS NULL THEN
        RETURN '{"ok":false,"reason":"invalid"}'::JSONB;
    END IF;

    v_settings := cl_get_settings_blob();
    v_term_id := NULLIF(v_settings->>'activeTermId', '');
    v_base_id := cl_term_prefix(v_term_id) || v_link.class_name;

    SELECT * INTO v_base_row
    FROM classlog_storage
    WHERE id = v_base_id;

    SELECT * INTO v_subject_row
    FROM classlog_storage
    WHERE id = v_base_id || '_' || p_subject_id;

    RETURN jsonb_build_object(
        'ok', true,
        'class_name', v_link.class_name,
        'subject_id', p_subject_id,
        'term_id', v_term_id,
        'students', COALESCE(v_base_row.students, '[]'::JSONB),
        'notes', COALESCE(v_base_row.notes, '{}'::JSONB),
        'parent_notice', public.cl_normalize_parent_notice(v_base_row.parent_notice),
        'records', COALESCE(v_subject_row.records, '{}'::JSONB),
        'classRecords', COALESCE(v_subject_row."classRecords", '{}'::JSONB),
        'settings', v_settings,
        'server_ts', NOW(),
        'base_updated_at', v_base_row.last_updated,
        'subject_updated_at', v_subject_row.last_updated
    );
END;
$$;
