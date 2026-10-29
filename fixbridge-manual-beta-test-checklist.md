# FixBridge Manual Beta Test Checklist

Deployed URL: `https://fixbridge.netlify.app/`

Use this after the RC is live on Netlify. Check each box only after you verify it yourself.

---

## Pre-flight (external)

```text
[ ] Google exposed secret has been rotated in Google Cloud Console
[ ] Netlify GOOGLE_CLIENT_ID is a real GIS web client ID (…apps.googleusercontent.com) or left empty
[ ] Netlify does NOT store a Google secret in GOOGLE_CLIENT_ID
[ ] GOOGLE_CLIENT_SECRET (if present) is server-only and never VITE_*
[ ] Latest RC commit is deployed on Netlify
```

---

## HOMEOWNER MANUAL TEST

```text
[ ] Open FixBridge deployed URL

[ ] Create/login with password

[ ] Google button is hidden/disabled if Google config is invalid

[ ] Create/select property

[ ] Enter service request

[ ] Confirm "Get AI Assessment" is visible

[ ] Click Get AI Assessment

[ ] Confirm AI acknowledgment appears ONLY after clicking it

[ ] Checkbox starts unchecked

[ ] Accept acknowledgment

[ ] AI assessment loads

[ ] Test one normal issue

[ ] Test one safety-sensitive issue and confirm safe warning behavior

[ ] Request a professional

[ ] Confirm request appears in job list
```

---

## ADMIN DISPATCH TEST

```text
[ ] Login Admin

[ ] Find new homeowner request

[ ] Open full dispatch detail

[ ] Assign contractor

[ ] Assign technician

[ ] Confirm technician belongs to selected company

[ ] Mark contractor dispatched

[ ] Check job timeline

[ ] Confirm homeowner tracking updates
```

---

## HOMEOWNER WHO TO EXPECT TEST

```text
[ ] Open homeowner job

[ ] Technician photo shows

[ ] Technician name shows

[ ] Company shows

[ ] Role shows

[ ] Customer-visible contact information shows correctly

[ ] Recent timeline updates show
```

---

## CONTRACTOR TEST

```text
[ ] Login contractor

[ ] Open assigned job

[ ] Assign technician if allowed

[ ] Start Travel

[ ] Mark Arrived

[ ] Start Job

[ ] Confirm Admin timeline updates
```

---

## QUOTE TEST

```text
[ ] Admin creates Option A

[ ] Admin creates Option B

[ ] Set different scope/pricing

[ ] Preview homeowner view

[ ] Send grouped options

[ ] Homeowner notification appears

[ ] Click notification and confirm exact quote opens

[ ] Homeowner sees Option A and B

[ ] Homeowner selects ONE option

[ ] Confirm other option becomes not selected
```

---

## INVOICE TEST

```text
[ ] Accepted quote automatically creates invoice

[ ] Invoice total matches selected quote

[ ] Only one invoice exists

[ ] Double-click/refresh does not create duplicate invoice
```

---

## STRIPE TEST

```text
[ ] Start payment on deployed website

[ ] Use Stripe TEST MODE card

[ ] Payment succeeds

[ ] Return to FixBridge

[ ] Invoice becomes paid

[ ] Payment appears in Admin

[ ] Payment notification appears

[ ] No duplicate payment/invoice
```

Do NOT use real money.

---

## MESSAGING TEST

```text
[ ] Homeowner sends Admin message

[ ] Attach photo

[ ] Admin gets red message badge

[ ] Admin opens exact conversation

[ ] Admin replies

[ ] Homeowner receives unread badge

[ ] Homeowner opens reply

[ ] Badge clears correctly


[ ] Contractor sends Admin message

[ ] Admin receives it

[ ] Admin replies

[ ] Contractor receives unread badge
```

---

## NOTIFICATION TEST

```text
[ ] Quote notification deep link works

[ ] Invoice notification deep link works

[ ] Contractor dispatched notification opens tracking

[ ] Admin message notification opens exact thread

[ ] Payout notification works for contractor

[ ] Dispute notification opens exact dispute

[ ] Clicking notification marks only that notification read
```

---

## ATTACHMENT TEST

```text
[ ] JPG uploads

[ ] PNG uploads

[ ] WEBP uploads

[ ] PDF uploads

[ ] Large file is rejected

[ ] More than allowed file count is rejected

[ ] Unauthorized account cannot access attachment
```

---

## COMPLETION TEST

```text
[ ] Contractor completes job

[ ] Homeowner sees completed status

[ ] Homeowner sees Confirm Completion

[ ] Homeowner sees Report a Problem
```

---

## DISPUTE TEST

```text
[ ] Homeowner reports a problem

[ ] Adds description/photo

[ ] Admin sees dispute in attention queue

[ ] Admin opens dispute

[ ] Payout displays HELD if unreleased

[ ] Direct payout attempt is blocked while dispute is open
```

---

## NON-DISPUTED PAYOUT TEST

```text
[ ] Use separate completed paid job

[ ] Admin opens payout

[ ] Homeowner paid amount correct

[ ] Contractor amount correct

[ ] FixBridge margin correct

[ ] Payable now correct

[ ] Connect status correct

[ ] Standard test payout/release works if Stripe test account eligible

[ ] Duplicate release blocked
```

---

## UNIVERSAL SEARCH TEST

```text
[ ] Search homeowner

[ ] Search contractor

[ ] Search technician

[ ] Search job

[ ] Search quote

[ ] Search invoice

[ ] Search payment

[ ] Search support ticket

[ ] Every result opens correct record
```

---

## MOBILE TEST

Test on your phone.

```text
[ ] Login

[ ] Get AI Assessment

[ ] AI acknowledgment

[ ] Notification bell/red badge

[ ] Messages

[ ] Attachment upload

[ ] Who to Expect

[ ] Quote Option A/B

[ ] Invoice

[ ] Payment flow

[ ] Completed job

[ ] Report a Problem

[ ] No horizontal overflow

[ ] Buttons are easy to tap
```

---

## FINAL USER DECISION

```text
BETA RELEASE DECISION

[ ] Google exposed secret has been rotated

[ ] Latest RC is deployed on Netlify

[ ] No Google secret appears in public config

[ ] Password authentication works

[ ] Stripe test checkout works on Netlify

[ ] Stripe webhook updates invoice/payment

[ ] AI safety works

[ ] Quote → invoice works

[ ] Messaging isolation works

[ ] Dispute blocks unreleased payout

[ ] RBAC/IDOR suites remain green

If all critical boxes above are checked:

BETA GO

If Google OAuth is disabled but the leaked secret has been rotated and password login works:

BETA GO — GOOGLE OAUTH DISABLED

If the exposed Google secret is still valid/public OR deployed Stripe checkout fails:

DO NOT LAUNCH
```
