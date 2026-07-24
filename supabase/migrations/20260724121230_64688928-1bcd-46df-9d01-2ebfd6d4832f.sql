
CREATE TABLE public.lot_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lot_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX lot_status_history_user_lot_idx ON public.lot_status_history (user_id, lot_id, created_at DESC);

GRANT SELECT, INSERT ON public.lot_status_history TO authenticated;
GRANT ALL ON public.lot_status_history TO service_role;

ALTER TABLE public.lot_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own status history"
  ON public.lot_status_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own status history"
  ON public.lot_status_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
