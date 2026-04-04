# ACWG Verifier — Incident Response Runbook

## Quick Reference

| Symptom | Likely cause | First action |
|---|---|---|
| `/api/verify` returning 500 | DB connection / env var | Check Vercel function logs |
| All verifications slow (>3s) | Vendor API degraded | Check `verify:signals_collected` checkpoint |
| Queue page empty / errors | DB query issue | Check `GET /api/orders` response |
| No decisions being recorded | `POST /api/decision` failing | Check auth + DB |
| Webhooks not processing | HMAC secret mismatch | Verify `SHOPIFY_WEBHOOK_SECRET` / `WOO_WEBHOOK_SECRET` |

---

## Severity Levels

- **P0** — All verifications failing, fraud decisions blocked
- **P1** — >10% error rate, significant queue backlog, data integrity concern
- **P2** — Single vendor degraded, some false positives, UI errors
- **P3** — Non-critical admin features broken, cosmetic issues

---

## P0: Verifications Completely Down

1. **Check Vercel function logs** → Functions → `api/verify`
2. **Look for checkpoint logs:**
   - `verify:start` logged → inputs OK
   - `verify:signals_collected` logged → vendors OK, DB failing
   - Neither → request not reaching function
3. **Check DATABASE_URL env var** is set correctly in Vercel
4. **Check Supabase status** at status.supabase.com
5. **Rollback last deployment** if recent deploy introduced the issue:
   - Vercel → Deployments → prior deployment → Promote to Production

---

## Vendor Timeout / Degradation

If one vendor (Smarty, Twilio, ip-api) is slow:

1. Verify via function logs: timing for `verify:signals_collected`
2. All integrations run in parallel — one slow vendor affects total time
3. Short-term: integrations already have 2-attempt retry with backoff
4. Escalation: increase `attempts` in `withRetry()` calls or add `signal: AbortSignal.timeout(2000)`

---

## Queue Backlog

If the Review Queue is growing faster than it's being cleared:

1. Check `GET /api/admin/reports` → `aging` bucket — look for `over24h > 0`
2. Check if auto-queue decisions are being created (`system` actor in audit logs)
3. If Slack alerts are enabled, `aging_queue` alert fires after 24h breach
4. Add reviewers or lower the `queued` threshold in risk rules

---

## Webhook Processing Failures

1. Check `WebhookEvent` table for `status=failed` records via Supabase Table Editor
2. Common causes:
   - HMAC secret rotated on platform but not in Vercel env
   - Platform sending malformed payload (check `errorMessage` column)
   - DB write failure
3. Failed webhooks are persisted — replay by re-triggering from platform admin or update status manually

---

## Rules Rollback

If a bad rules version was published:

1. Go to `/admin/rules`
2. Find the last known-good version in the history list
3. Click **Rollback** — this creates a new published version from the old config
4. Verify by running Preview against a sample high-risk payload

---

## Database Recovery

If Supabase goes down:

1. All in-flight verify requests will fail with 500
2. MSW mock layer is available for dev — flip `NEXT_PUBLIC_USE_MOCK=true` for testing
3. When DB recovers, pending QueueJob records will be retried on next job run

---

## Key Environment Variables Checklist

```
DATABASE_URL          — Supabase pooler URL (port 6543)
DIRECT_URL            — Supabase direct URL (port 5432)
ANTHROPIC_API_KEY     — Claude summaries
TWILIO_ACCOUNT_SID    — Phone verification
TWILIO_AUTH_TOKEN     — Phone verification
SMARTY_AUTH_ID        — Address verification
SMARTY_AUTH_TOKEN     — Address verification
SHOPIFY_WEBHOOK_SECRET — Webhook HMAC
SHOPIFY_ACCESS_TOKEN  — Write-back
ENCRYPTION_KEY_v1     — PII field encryption
ENCRYPTION_KEY_VERSION — Current key version
```

---

## Contacts

- **On-call**: See internal contact sheet
- **Supabase**: support.supabase.com
- **Vercel**: vercel.com/support
- **Anthropic API status**: status.anthropic.com
