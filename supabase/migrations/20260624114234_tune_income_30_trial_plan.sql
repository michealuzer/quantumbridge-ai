update public.qt_plans
set
  name = 'Trial 30 Fund',
  daily_return_percent = 2.50,
  duration_days = 30,
  description = 'A short 30-day proof-of-performance plan for new investors to test the program before choosing longer-term funds.',
  featured = false,
  sort_order = 50
where slug = 'income-30';
