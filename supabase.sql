-- ═══════════════════════════════════════════════════════════════════════════
-- HƯỚNG DẪN CÀI ĐẶT — Dán toàn bộ file này vào Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════
-- Mục đích: Tránh double-credit profit khi user mở app trên 2 máy cùng lúc.
-- Cơ chế:   CAS (Compare-And-Swap) trên cột next_profit_time của investments.
--            Chỉ 1 tab "thắng" được ghi, tab còn lại bị reject (RETURN FALSE).

-- 1. Thêm cột updated_at vào investments nếu chưa có
ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 1b. Thêm cột referred_by vào users nếu chưa có (dùng cho referral tracking)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referred_by TEXT DEFAULT '';

-- 2. Hàm credit_profit — atomic profit credit với CAS lock
CREATE OR REPLACE FUNCTION credit_profit(
  p_user_id        BIGINT,
  p_investment_id  TEXT,
  p_profit         NUMERIC,
  p_new_earned     NUMERIC,
  p_next_time      BIGINT,
  p_old_next_time  BIGINT,
  p_tx_id          TEXT,
  p_tx_label       TEXT,
  p_now            BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INT;
BEGIN
  -- ── Step 1: CAS update trên investments ──────────────────────────────────
  -- Chỉ update nếu next_profit_time vẫn bằng giá trị cũ (p_old_next_time).
  -- Nếu tab khác đã cập nhật next_profit_time trước → WHERE không khớp
  -- → updated_count = 0 → RETURN FALSE → tab này bỏ qua, không double-credit.
  UPDATE investments
  SET
    earned           = p_new_earned,
    next_profit_time = p_next_time,
    updated_at       = NOW()
  WHERE
    id              = p_investment_id
    AND user_id     = p_user_id
    AND next_profit_time = p_old_next_time;  -- điều kiện CAS

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Không có row nào được update → tab khác đã credit trước
  IF updated_count = 0 THEN
    RETURN FALSE;
  END IF;

  -- ── Step 2: Cộng balance + today_profit cho user ──────────────────────────
  UPDATE users
  SET
    balance      = balance + p_profit,
    today_profit = today_profit + p_profit,
    updated_at   = NOW()
  WHERE id = p_user_id;

  -- ── Step 3: Insert profit transaction (idempotent) ────────────────────────
  INSERT INTO transactions (id, user_id, type, label, amount, status, created_at)
  VALUES (p_tx_id, p_user_id, 'profit', p_tx_label, p_profit, 'completed', p_now)
  ON CONFLICT (id) DO NOTHING;

  RETURN TRUE;
END;
$$;

-- Grant quyền gọi RPC cho anon/authenticated
GRANT EXECUTE ON FUNCTION credit_profit(BIGINT, TEXT, NUMERIC, NUMERIC, BIGINT, BIGINT, TEXT, TEXT, BIGINT)
  TO anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC BẬT REALTIME (nếu chưa bật)
-- Vào Supabase Dashboard → Database → Replication → chọn các bảng:
--   ✅ users
--   ✅ investments
--   ✅ transactions
-- ═══════════════════════════════════════════════════════════════════════════

-- Kiểm tra Realtime đang bật cho bảng nào:
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';

-- Nếu chưa có → bật thủ công:
-- ALTER PUBLICATION supabase_realtime ADD TABLE users;
-- ALTER PUBLICATION supabase_realtime ADD TABLE investments;
-- ALTER PUBLICATION supabase_realtime ADD TABLE transactions;

-- ═══════════════════════════════════════════════════════════════════════════
-- KIỂM TRA FUNCTION ĐÃ TẠO CHƯA:
-- SELECT proname FROM pg_proc WHERE proname = 'credit_profit';
-- Kết quả trả về 1 dòng "credit_profit" = thành công.
-- ═══════════════════════════════════════════════════════════════════════════