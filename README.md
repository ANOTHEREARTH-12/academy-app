# Court Manager — badminton court bookings on GitHub only

A small web app for the front desk. It runs on **GitHub Pages**, and it saves all data as JSON files in a
**private GitHub repository**, using one access token. You don't need a server, a database or any hosting outside GitHub.

**Phase 1:** court booking calendar, customers, payments (cash, UPI, card), daily and monthly
collections, CSV export, and settings for courts, hours and rates.

**Phase 2:** membership plans, memberships with renewals and expiry alerts, membership payments, expenses
by category, other income (coaching fees, shuttle sales and so on), and a monthly profit & loss report with a 6-month trend.

---

## How it fits together

```
academy-app   (PUBLIC repo)   ← this code, served by GitHub Pages. No data, no secrets.
academy-data  (PRIVATE repo)  ← all bookings, customers and payments as JSON files.
                                Every save is a commit, so you get a full history and undo.
```

The app repo is public because GitHub Pages is free only for public repos. That's safe because it contains
only code. The app **refuses to connect to a data repo that is public**.

---

## One-time setup (about 15 minutes)

### 1. GitHub account for the academy
Create a GitHub account for the academy, for example `smash-academy`. You can also use your own account. Turn on
two-factor authentication.

### 2. Private data repository
- **New repository** → name it `academy-data` → choose **Private**.
- Tick **Add a README file**. The repo must not be empty.
- Leave everything else as it is. The app creates the `data/` folder itself.

### 3. App repository + GitHub Pages
- **New repository** → name it `academy-app` → **Public**.
- Upload everything in this folder (`index.html`, `css/`, `js/`, `.nojekyll`, `README.md`).
- In **Settings → Pages**, set **Source: Deploy from a branch**, **Branch: `main` / `(root)`**, then **Save**.
- After about a minute the app is live at `https://<account>.github.io/academy-app/`.

### 4. Create the single access token
Signed in as the academy account:
**Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**

| Field | Value |
|---|---|
| Token name | `court-manager-front-desk` |
| Expiration | 1 year (set a calendar reminder to renew it) |
| Repository access | **Only select repositories** → `academy-data` |
| Permissions → Repository → **Contents** | **Read and write** |
| Everything else | No access (Metadata: read-only is added automatically) |

Copy the token (it starts with `github_pat_`). **Don't put it in any file or repository, and don't send it in chat or email.**

### 5. Connect each device yourself
On every front-desk device, open the Pages URL and enter:
- GitHub account: `smash-academy`
- Data repository name: `academy-data`
- Branch: `main`
- Access token: paste it **yourself**

Press **Connect**, then **Create starting files** (only on the first device). The token is kept only in that browser's
local storage. The app never displays it again, and **Settings → Disconnect this device** removes it.

> To try the app without GitHub, press **Try demo mode** on the setup screen. Demo data stays in that browser only.

---

## Using it

- **Bookings:** pick a day and tap an empty slot. Type a phone number or name to find an existing customer, or
  enter a new one, which is added to Customers automatically. Enter the amount paid now if they paid at the desk.
  Tap a booking to change it, add or remove payments, mark a no-show, or cancel it.
- **Members:** sell a membership (the end date and price fill in from the plan), take full or part payment,
  and **Renew** with one tap (the new membership starts the day after the old one ends). Filters show
  *Expiring soon*, *Expired – not renewed* and *Payment due*. Overlapping memberships for the same person are blocked.
- **Expenses:** record rent, electricity, salaries, shuttlecocks and so on. See a breakdown by category, and export to CSV.
- **Reports:** money received, expenses, profit or loss, margin, money still to collect, and a 6-month trend. Can be printed.
- **Customers:** search, add, edit, and mark someone as a member.
- **Collections:** money received per day or month, split by Cash, UPI, Card and Other, plus unpaid bookings.
  **+ Other income** records coaching fees, shuttle sales and so on. **Export CSV** opens in Excel.
- **Settings:**
  - Academy name and currency.
  - Opening and closing time, and slot length (1 hour or 30 minutes).
  - Courts: add, rename, or switch off.
  - Standard rate per hour.
  - Special rates for chosen days and times (for example *Peak, Mon–Fri, 5 PM–10 PM, ₹500*).
  - Membership plans (name, length in months or days, price, on sale or not).
  - When to flag memberships as "expiring soon".
  - Expense categories.

**Double bookings are blocked.** Each save is an atomic commit. If another device saved first, the app reloads the
latest data and checks the slot again before saving.

Press **↻** in the top bar to load changes made on other devices.

---

## Data files (in `academy-data`)

```
data/settings.json            courts, hours, rates
data/customers.json           customer list
data/bookings/2026-11.json    one file per month
data/payments/2026-11.json    all money received (bookings, memberships, other income), by payment date
data/memberships.json         all memberships
data/expenses/2026-11.json    expenses, one file per month
```

To undo a mistake, open the file's **History** on GitHub and restore an older version.

---

## Security notes

- Anyone who has the token can read and change the academy data. Enter it only on the academy's own devices,
  and click **Disconnect this device** before a device is given away.
- If the token leaks or a staff member leaves with a connected device: **revoke the token on GitHub**, create a
  new one, and reconnect the devices.
- The token can reach only `academy-data`, and only its file contents.

---

## Limits of a GitHub-only setup

- Only staff can book (customers can't book online), because every save needs the token.
- Screens don't update by themselves. Press ↻ to see changes from other devices.
- GitHub allows 5,000 requests per hour per token. One academy front desk uses a small fraction of that.

## Next phase
- **Phase 3:** coaching batches and attendance, recurring bookings (same slot every day or week), and a
  scheduled GitHub Actions monthly report.
