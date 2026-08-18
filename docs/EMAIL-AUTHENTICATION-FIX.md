# Email Authentication Flow Fix

## Problem Solved

**Email prefetching issue:** Email security systems (Gmail, Outlook, etc.) can prefetch URLs in emails before the user clicks them. When your Supabase email template had a direct link to `{{ .ConfirmationURL }}`, these systems would immediately consume the verification token, causing a `403` error when the actual user clicked the link.

## Solution: Non-Consuming Landing Page

Instead of automatically verifying on page load, the solution uses a **two-step link flow** where the initial page performs no authentication:

```
Email arrives
    ↓
User sees two options:
    A) 8-digit verification code
    B) Confirm email link
    ↓
User chooses:
    ├─ OTP Path:
    │   User enters code → verifyOtp({ token, type: 'email' })
    │   ↓
    │   Session created
    │
    └─ Link Path:
        User clicks link → /auth/confirm (landing page only)
        ↓
        NO verification happens on page load
        ↓
        User sees "Ready to proceed?" page
        ↓
        User clicks "Confirm Email" button
        ↓
        verifyOtp({ token_hash, type: 'email' })
        ↓
        Session created + redirect to /login?confirmed=1
```

## Key Architecture Decision

**The critical difference from other approaches:** The `/auth/confirm` page initially performs **zero authentication operations**. It simply displays the landing page. Verification only occurs when the user explicitly clicks the confirm button.

This ensures that:
- Email security scanners that prefetch the URL perform no harmful operations
- The Supabase verification token remains unconsumed until the user acts
- Normal email clients follow the link harmlessly
- User retains full control over when the token is consumed

## Implementation Changes Made

### 1. New Route: `/auth/confirm`
- File: `src/pages/AuthConfirm.tsx`
- Purpose: Landing page for email confirmation links
- **What it does NOT do:** Does NOT call `verifyOtp()` on initial page load
- **What it does:** 
  - Extracts the `token_hash` parameter from the URL
  - Validates that it exists
  - Displays "Ready to proceed?" confirmation UI
  - Waits for user to click "Confirm Email" button
- **Only then:** Calls `verifyOtp({ token_hash, type: 'email' })`
- On success: Redirects to `/login?confirmed=1`
- On error: Shows error message and allows retry

### 2. Updated Login Page
- File: `src/pages/Login.tsx`
- `confirmationRedirectUrl` now points to `/auth/confirm`
- OTP input accepts exactly **8 digits** (Supabase's current token length per docs)
- Both paths use `type: 'email'` (current Supabase JavaScript API)
- Updated error messages to reflect 8-digit codes
- Handles `?error=` parameter from failed confirmations

### 3. Updated App Routes
- File: `src/App.tsx`
- Added route: `<Route path="/auth/confirm" element={<AuthConfirm />} />`

### 4. Demo Mode Updates
- File: `src/lib/supabase.ts`
- `verifyOtp()` now accepts both:
  - `token`: Direct OTP code from form submission (OTP path)
  - `token_hash`: Email link code from `/auth/confirm` route (Link path)
- `type: 'email'` is the only type accepted (current Supabase API)
- Demo accepts "12345678" (8-digit code per Supabase docs)

## Required Supabase Email Template Change

Your confirmation email template currently may look like:

```html
<!-- OLD - has prefetch vulnerability -->
<p>{{ .Token }}</p>
<a href="{{ .ConfirmationURL }}">Confirm email</a>
```

### New Template

```html
<!-- NEW - routes through your app's landing page first -->
<div style="margin: 20px 0; text-align: center;">
  <p style="font-size: 24px; font-weight: bold; font-family: monospace; letter-spacing: 2px;">
    {{ .Token }}
  </p>
  <p style="color: #666; margin: 10px 0;">
    Enter this 8-digit code in the app
  </p>
</div>

<div style="margin: 20px 0; text-align: center;">
  <a href="{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=email" 
     style="background-color: #FBBF24; color: #1a1304; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">
    Confirm Email
  </a>
  <p style="color: #999; font-size: 12px; margin-top: 10px;">
    Or paste this code: {{ .Token }}
  </p>
</div>

<p style="color: #999; font-size: 12px;">
  Use either the code OR the link above, but not both. 
  If you didn't create this account, please ignore this email.
</p>
```

### Key Points:
1. **`{{ .Token }}`** - The 8-digit OTP (display prominently)
2. **`{{ .TokenHash }}`** - Use this for the link parameter, never the raw confirmation URL
3. **`{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`** - Routes through your app's landing page first (uses `.RedirectTo` which is set from your configured `emailRedirectTo` parameter)
4. **`type=email`** parameter tells Supabase this is an email OTP verification
5. **Clear messaging** - Explain users should use one method (code OR link), not both

## How Users Interact

### Scenario A: User enters OTP code
1. Receives email with 8-digit code and a "Confirm Email" link
2. Opens app, sees verification screen
3. Enters 8-digit code (e.g., "12345678")
4. Submits → `verifyOtp({ email, token: '12345678', type: 'email' })`
5. ✅ Session created, redirects to dashboard

### Scenario B: User clicks confirmation link
1. Receives email with 8-digit code and a "Confirm Email" link
2. Clicks "Confirm Email" button
3. Goes to `https://yourapp.com/auth/confirm?token_hash=abc123hash&type=email`
4. Page loads → Shows "Ready to proceed?" message
5. **No verification happens yet** (scanner prefetching is harmless)
6. User sees the page and clicks "Confirm Email" button
7. NOW verifyOtp() is called: `verifyOtp({ token_hash: 'abc123hash', type: 'email' })`
8. ✅ Session created, redirects to `/login?confirmed=1`
9. User sees "Email confirmed. Sign in with your email and password to continue."

### Scenario C: Email security scanner prefetches the link
1. Email security scanner follows the link before user sees it
2. Scanner hits `/auth/confirm?token_hash=abc123hash&type=email`
3. Page renders with "Ready to proceed?" UI
4. **No verification request is made** (page performs no mutations)
5. Token remains unconsumed
6. User later clicks the email link
7. User sees the same "Ready to proceed?" page
8. User clicks "Confirm Email" button
9. ✅ Token is now consumed, session created
10. User continues to dashboard

### Scenario D: User uses code but also tries the link
1. User enters OTP code first → token consumed and session created
2. User tries clicking the email link
3. Link still works (shows "Ready to proceed?" page)
4. User clicks "Confirm Email" button
5. ✅ Attempt to verify already-consumed token fails
6. Page shows error: "That verification code is expired or was already used"
7. User must resend to get a new code and link

## Configuration Steps

### In Supabase Dashboard

1. **Go to:** Authentication → URL Configuration → Redirect URLs
2. **Add the base domain URLs** (these are required for `.RedirectTo` template variable):
   ```
   https://theprimemarkets.com
   https://www.theprimemarkets.com
   ```
3. **Keep your existing login URLs**:
   ```
   https://theprimemarkets.com/login
   https://www.theprimemarkets.com/login
   ```
4. **Final list should have all four**:
   ```
   https://theprimemarkets.com
   https://www.theprimemarkets.com
   https://theprimemarkets.com/login
   https://www.theprimemarkets.com/login
   ```
5. **Site URL should be**: `https://theprimemarkets.com` (no change needed if already set)

### Then update your Email Template

1. **Go to:** Authentication → Email Templates → Confirmation Email
2. **Replace the default template** with the new template above (see "New Template" section)
3. **Save and test with a brand-new account** (existing tokens may be expired/consumed)

### Environment Configuration

Make sure your Supabase project has:
- `VITE_SUPABASE_URL` set to your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` set to your anon key
- Email authentication enabled
- "Confirm email" setting enabled (requires email verification before login)

### Redirect URL Configuration (Critical for `.RedirectTo`)

The email template uses `{{ .RedirectTo }}`, which is set by the `emailRedirectTo` parameter in your `signUp()` and `resend()` calls.

**Important:** To avoid www/non-www inconsistencies, use a **hardcoded canonical domain** instead of `window.location.origin`.

In [Login.tsx](src/pages/Login.tsx), change:
```typescript
// OLD - unreliable because window.location.origin can be www or non-www
const confirmationRedirectUrl = `${window.location.origin}`;

// NEW - hardcoded canonical domain
const confirmationRedirectUrl = 'https://theprimemarkets.com';
```

This means:
- `emailRedirectTo` is always set to your canonical domain
- Supabase will use this value for `{{ .RedirectTo }}`
- The email template constructs: `{{ .RedirectTo }}/auth/confirm?token_hash=...`
- Result: `https://theprimemarkets.com/auth/confirm?token_hash=...` ✅ (consistent)

**Why not use `window.location.origin`?**
- Users accessing `https://www.theprimemarkets.com` would get a link for `www` version
- Users accessing `https://theprimemarkets.com` would get a different link
- If you redirect www to non-www (or vice versa), users get "invalid redirect URL" errors
- Using a hardcoded canonical domain ensures all email links are consistent

**Important:** Only add the base domain to Supabase Redirect URLs if you're using it for `emailRedirectTo`. Make sure these are configured:
```
https://theprimemarkets.com
https://www.theprimemarkets.com
https://theprimemarkets.com/login
https://www.theprimemarkets.com/login
```

### Testing the Landing Page

To verify the landing page is working correctly:
1. Copy the email link from your test email
2. Open it in a new tab
3. You should see "Ready to proceed?" page with a "Confirm Email" button
4. **Verify that no network requests to Supabase are made yet** (check browser DevTools → Network tab)
5. Now click the "Confirm Email" button
6. You should see a request to `auth.supabase.co` verify endpoint
7. On success, redirect to `/login?confirmed=1`

## Testing Checklist

- [ ] OTP signup works (enter 8-digit code)
- [ ] OTP verification succeeds and redirects to dashboard
- [ ] Email link signup works (click button in email)
- [ ] `/auth/confirm` landing page appears when link is clicked
- [ ] **No Supabase verification request on initial page load** (verify in DevTools Network tab)
- [ ] "Confirm Email" button appears and is clickable
- [ ] Clicking "Confirm Email" button triggers verification request (visible in DevTools)
- [ ] Successful link verification redirects to `/login?confirmed=1`
- [ ] User can sign in after email confirmation
- [ ] Error when trying to use both code and link from same email
- [ ] Resend code gives new code and new link
- [ ] Demo mode works with 12345678 code for both paths
- [ ] Error handling on invalid/expired codes is clear
- [ ] Browser DevTools shows no Supabase request when `/auth/confirm` page initially loads
- [ ] Browser DevTools shows verification request **only after** "Confirm Email" button is clicked
- [ ] Global auth initialization (e.g., `getSession()` on app load) doesn't trigger unexpected behavior on the landing page

## Notes

- **Token length:** Supabase currently sends 8-digit OTP codes per current documentation. The UI accepts exactly 8 digits.

- **Canonical domain requirement:** Production email links must use a consistent, hardcoded canonical domain (e.g., `'https://theprimemarkets.com'`) rather than `window.location.origin`. This prevents inconsistencies when users access the site via `www` and non-`www` variants. The code checks if running locally and uses `window.location.origin` for localhost development, but all production links are generated with the canonical domain.

- **Supabase Redirect URLs configuration:** Your Supabase project must allow all domain variants you want to support:
  ```
  https://theprimemarkets.com (required - for emailRedirectTo)
  https://www.theprimemarkets.com (required - for users who access via www)
  https://theprimemarkets.com/login (existing)
  https://www.theprimemarkets.com/login (existing)
  ```
  Even though the code sends only the canonical domain via `emailRedirectTo`, Supabase allows users to access your app via any of the registered URLs. The redirect URLs configuration tells Supabase which domains are allowed for verification redirects.

- **Redirect URL configuration:** The email template uses `{{ .RedirectTo }}`, which is set by the `emailRedirectTo` parameter. To ensure consistency across www and non-www versions, use a **hardcoded canonical domain** (e.g., `'https://theprimemarkets.com'`) instead of `window.location.origin`. The template then appends `/auth/confirm` to construct the full link. This approach prevents "invalid redirect URL" errors when users access the site via different domain variants.

  Your Supabase Redirect URLs configuration must include all variants you want to support:
  ```
  https://theprimemarkets.com
  https://www.theprimemarkets.com
  https://theprimemarkets.com/login
  https://www.theprimemarkets.com/login
  ```
  But your code sends a single canonical domain via `emailRedirectTo`, which Supabase uses for `{{ .RedirectTo }}`.

- **Testing for true non-consumption:** When testing the landing page, check browser DevTools (Network tab) to verify that **no requests to `auth.supabase.co`** are made on initial page load. Also verify that no indirect auth operations are triggered by your global Supabase initialization code. The page should be essentially inert until "Confirm Email" is clicked.

- **Testing with new accounts:** Always test email confirmation with a **brand-new account signup**. Existing confirmation emails/tokens can give misleading results because tokens may already be consumed or expired. After updating your Supabase email template and code, create a fresh test account to verify the complete flow.

- **Non-consuming landing page design:** The `/auth/confirm` route contains no `useEffect()` that auto-calls `verifyOtp()`. Verification happens **only** inside the button's `onClick` handler. This is the critical architectural detail that prevents email scanners from consuming the token during prefetch.

- **Email prefetch protection mechanism:** By routing through a non-consuming landing page (`/auth/confirm`), email security scanners that prefetch the URL perform no authentication operations. The initial page load performs zero Supabase verification calls. This aligns with Supabase's documented prefetch mitigation approach. This is not a guarantee against all forms of email scanning, but it ensures that a normal prefetch/follow operation causes no harm.

- **Both methods available:** Users can still choose between OTP and link-based verification. Supabase supports both approaches, and the implementation ensures they don't accidentally interfere with each other.

- **How `{{ .ConfirmationURL }}` differs:** Supabase's `{{ .ConfirmationURL }}` variable is a direct link to Supabase's `/auth/v1/verify` endpoint. This creates the prefetch vulnerability because scanners can activate the endpoint immediately. For this custom flow, we use `{{ .TokenHash }}` to construct our own URL through your app first. This is documented in Supabase's email template customization guide.

- **Implementation basis:** This approach follows Supabase's recommended pattern for custom email authentication links. Reference: Supabase Auth Email Templates guide, "Customizing email links" section.

- **API alignment:** Both OTP and link paths use `type: 'email'` and call Supabase's `verifyOtp()` method, which is the current documented pattern for email OTP verification in the Supabase JavaScript SDK.
