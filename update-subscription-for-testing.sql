-- Update TestSubT to have payment tomorrow so we can test notifications

UPDATE subscriptions 
SET next_payment_date = CURRENT_DATE + INTERVAL '1 day'
WHERE name = 'TestSubT' 
  AND user_id = 'a9357098-8841-4442-8530-ec9a49c4b3cb';

-- Verify the update
SELECT 
  name, 
  next_payment_date, 
  reminder_period,
  CURRENT_DATE as today,
  (next_payment_date - CURRENT_DATE) as days_until_payment
FROM subscriptions 
WHERE user_id = 'a9357098-8841-4442-8530-ec9a49c4b3cb';
