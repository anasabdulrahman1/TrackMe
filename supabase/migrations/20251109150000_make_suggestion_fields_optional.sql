-- ============================================================================
-- MAKE PRICE AND BILLING_CYCLE OPTIONAL IN SUBSCRIPTION_SUGGESTIONS
-- ============================================================================
-- Allow suggestions to be created even when price or billing cycle can't be extracted

-- Make price nullable
ALTER TABLE subscription_suggestions 
ALTER COLUMN price DROP NOT NULL;

-- Make billing_cycle nullable
ALTER TABLE subscription_suggestions 
ALTER COLUMN billing_cycle DROP NOT NULL;

-- Make currency nullable (for consistency)
ALTER TABLE subscription_suggestions 
ALTER COLUMN currency DROP NOT NULL;

-- Add comment
COMMENT ON COLUMN subscription_suggestions.price IS 'Subscription price (nullable if not found in email)';
COMMENT ON COLUMN subscription_suggestions.billing_cycle IS 'Billing cycle (nullable if not found in email)';
COMMENT ON COLUMN subscription_suggestions.currency IS 'Currency code (nullable if not found in email)';
