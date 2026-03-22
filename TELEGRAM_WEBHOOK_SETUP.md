# 🔧 Telegram Webhook Setup - Fix 409 Conflict

## Problem: Telegram Polling Conflict
```
error: ETELEGRAM: 409 Conflict: terminated by other getUpdates request
```

**Root Cause**: Multiple bot instances trying to poll for updates simultaneously.

**Solution**: Switch from polling to webhooks (like WhatsApp).

---

## ✅ What Changed

### Before (Polling Mode)
```javascript
const bot = new TelegramBot(token, { polling: true });
// Multiple instances = conflict!
```

### After (Webhook Mode)
```javascript
const useWebhook = process.env.NODE_ENV === 'production';
const bot = new TelegramBot(token, { polling: !useWebhook });
// Webhooks in production, no conflicts!
```

---

## 🚀 Setup Instructions

### Step 1: Push Code to Render
```bash
git push origin main
```

Render will automatically deploy the updated code.

### Step 2: Set Telegram Webhook

#### Option A: Quick Setup (Recommended)
Run this command after deployment:

```bash
node scripts/setup-telegram-webhook.js
```

Or use curl:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -d "url=https://neurvinial.onrender.com/channels/telegram/webhook"
```

#### Option B: Use BotFather (Manual)
1. Open Telegram
2. Find @BotFather
3. Send: `/setwebhook`
4. Enter URL: `https://neurvinial.onrender.com/channels/telegram/webhook`

### Step 3: Verify Webhook

Check webhook status:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "url": "https://neurvinial.onrender.com/channels/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

### Step 4: Test Telegram Bot

Send a message to your bot:
```
/start
/register
/request 50
```

No more 409 errors! ✅

---

## 🔍 How It Works Now

### Development (Local)
- Uses **polling** (no webhook needed)
- `NODE_ENV=development` (default)
- Easy for testing locally

### Production (Render)
- Uses **webhooks**
- `NODE_ENV=production`
- No polling conflicts
- More reliable

---

## 📊 Benefits of Webhooks

| Feature | Polling | Webhooks |
|---------|---------|----------|
| **Conflicts** | ❌ 409 errors | ✅ No conflicts |
| **Scaling** | ❌ Single instance | ✅ Multi-instance |
| **Latency** | ~1-2 seconds | ✅ Instant |
| **Resources** | ❌ Constant polling | ✅ On-demand only |
| **Production** | ❌ Not recommended | ✅ Best practice |

---

## 🎯 Environment Variables

Make sure these are set in Render dashboard:

```bash
NODE_ENV=production          # Enables webhooks
TELEGRAM_BOT_TOKEN=your_token_here
BASE_URL=https://neurvinial.onrender.com
```

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Code pushed to Render
- [ ] Render deployment successful
- [ ] Webhook URL set via API or BotFather
- [ ] `getWebhookInfo` shows correct URL
- [ ] Test `/start` command works
- [ ] No 409 errors in logs
- [ ] Both Telegram and WhatsApp working

---

## 🔧 Troubleshooting

### Issue: Still Getting 409 Errors

**Solution**: Old polling session still active. Delete webhook and set again:

```bash
# Delete webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/deleteWebhook"

# Wait 10 seconds
sleep 10

# Set webhook again
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://neurvinial.onrender.com/channels/telegram/webhook"
```

### Issue: Webhook Not Receiving Updates

**Check 1**: Verify webhook URL is correct
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

**Check 2**: Test webhook endpoint manually
```bash
curl -X POST https://neurvinial.onrender.com/channels/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{"message":{"chat":{"id":12345},"text":"test"}}'
```

**Check 3**: Check Render logs for errors
- Go to Render dashboard
- View logs
- Look for webhook errors

### Issue: Local Development Not Working

**Solution**: Make sure `NODE_ENV` is NOT set to "production" locally:

```bash
# .env file (local)
NODE_ENV=development   # or remove this line
```

---

## 🎉 Success Indicators

When properly configured, you'll see:

### Render Logs (No More Errors)
```
✓ Telegram bot initialized with webhook
✓ Service is live at https://neurvinial.onrender.com
(No 409 errors!)
```

### Telegram Working
```
User: /start
Bot: 🤖 Welcome to SENTINEL (responds immediately)

User: /request 50
Bot: ✅ Loan Approved! (works perfectly)
```

### WhatsApp Also Working
```
User: register
Bot: ✅ Registration Successful

Both channels working simultaneously! ✅
```

---

## 📱 Quick Test Commands

After webhook setup, test both channels:

### Telegram:
```
/start
/register
/limit
/request 50
/balance
/history
```

### WhatsApp:
```
register
limit
request 50
balance
history
```

Both should work without conflicts! 🎉

---

## 💡 Pro Tips

1. **Always use webhooks in production** - More reliable than polling
2. **Keep polling for local dev** - Easier to test without webhooks
3. **Monitor Render logs** - Watch for any webhook errors
4. **Test after each deploy** - Ensure webhook still works

---

## 🚀 Next Steps

Once webhook is set:

1. ✅ Both Telegram and WhatsApp work
2. ✅ No more 409 conflicts
3. ✅ Ready for real users
4. ✅ Can scale to multiple instances

---

## 📞 Need Help?

If you still see 409 errors after webhook setup:

1. Check `NODE_ENV=production` is set in Render
2. Verify webhook URL with `getWebhookInfo`
3. Delete and re-set webhook
4. Check Render logs for errors
5. Make sure no local bot instances are running

---

**Summary**: Telegram now uses webhooks in production (like WhatsApp), eliminating polling conflicts. Run the setup script or use BotFather to configure the webhook URL, then both channels will work perfectly! 🎉
