CREATE OR REPLACE FUNCTION qt_get_recent_payouts()
RETURNS TABLE (
    masked_email text,
    amount_usd numeric,
    method text,
    created_at timestamptz
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN p.email IS NOT NULL AND position('@' in p.email) > 0 THEN 
                substring(p.email from 1 for 1) || '***' || substring(p.email from position('@' in p.email))
            ELSE 
                'u***@user.com'
        END AS masked_email,
        w.amount_usd,
        w.method,
        w.created_at
    FROM qt_withdrawals w
    LEFT JOIN qt_profiles p ON p.id = w.user_id
    WHERE w.status = 'completed'
    ORDER BY w.created_at DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION qt_get_recent_payouts() TO authenticated;
GRANT EXECUTE ON FUNCTION qt_get_recent_payouts() TO anon;
