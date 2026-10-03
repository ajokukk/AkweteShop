# Akwete shop: checkout, database, Google sign-in, Mailgun emails

This covers the four requirements of the task:

| Requirement | How it is done here |
|---|---|
| Check-out page | `checkout.html` (delivery form + order summary), `orders.html` (order history) |
| Persist everything in a database | Supabase Postgres: `products`, `profiles`, `carts`, `orders`, `order_items` (`supabase/schema.sql`) |
| Confirmation emails with Mailgun | Supabase Edge Function `send-order-email` calls the Mailgun API |
| Google auth with Google Cloud Console | Supabase Auth with the Google provider, using an OAuth client you create in Google Cloud Console |

Supabase was chosen because it gives you the database and Google sign-in in one place. Neon is only a database, so you would need to add a separate auth layer.

## Language: English and Igbo
Every page has an **Igbo / English** button in the header (and in the mobile menu and footer). The choice is remembered, and `?lang=ig` in a link opens a page in Igbo.
- All Igbo text lives in one file: `js/lang/ig.js`. The site is written in English, and that file maps each English line to its Igbo version, so you can improve a translation without touching any page.
- Anything not listed in `ig.js` simply stays in English. After adding new text to a page, add a matching line in `ig.js`.
- The order confirmation email is sent in the language the customer was using.
- The Igbo is a first draft. Have a fluent Igbo speaker review it before launch, especially the words for loom, motifs and weaving terms.

## Navigation
Every page shares one header, mobile menu and footer (built by `js/nav.js`, styled by `css/nav.css`). Each page has a "skip to content" link, a back link, a back-to-top button, and the home page highlights the section you are reading.

## What is in the folder

```
index.html                  the interactive shop (bag now saved to the database when signed in)
checkout.html               checkout
orders.html                 "My orders"
css/pages.css               styles for checkout and orders
history.html                the history of Akwete
js/config.js                YOUR Supabase URL + anon key go here
js/shared.js                Supabase client, Google sign-in, bag syncing
js/nav.js, css/nav.css      shared header, mobile menu, footer, back-to-top
js/i18n.js, js/lang/ig.js   language switching and the Igbo dictionary
assets/images.js            embedded product and motif images
supabase/schema.sql         tables, row level security, place_order()
supabase/functions/send-order-email/index.ts    Mailgun email
```

## How an order flows

1. Visitor adds pieces to the bag (kept in the browser, and in the `carts` table once signed in).
2. At checkout they sign in with Google, fill in delivery details and press **Place order**.
3. The browser calls the database function `place_order()`. **Prices are not sent by the browser.** The function looks them up in `products`, so nobody can change a price from the browser console.
4. The browser then calls the `send-order-email` function, which checks the caller owns the order, sends the email through Mailgun and stamps `confirmation_sent_at`.
5. If the email fails, the order is still saved and the page says so.

## Setup

### 1. Supabase project and database
1. Create a project at supabase.com.
2. Open **SQL Editor**, paste all of `supabase/schema.sql` and run it.
3. Open **Project Settings > API**. Copy the **Project URL** and the **anon public key** into `js/config.js`. (Never use the `service_role` key in the browser.)

### 2. Google sign-in (Google Cloud Console)
1. Go to console.cloud.google.com and create a project.
2. Configure the **OAuth consent screen** (External). Add your app name and your email. While it is in "Testing", add the Google accounts you will test with as test users.
3. Go to **Credentials > Create credentials > OAuth client ID**, type **Web application**.
   - **Authorized JavaScript origins**: `http://localhost:3000` and, later, your live site URL.
   - **Authorized redirect URIs**: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` (Supabase shows this exact value on its Google provider page).
4. Copy the **Client ID** and **Client secret**.
5. In Supabase: **Authentication > Providers > Google**. Enable it and paste the Client ID and secret.
6. In Supabase: **Authentication > URL Configuration**. Set **Site URL** to your site, and add `http://localhost:3000/**` (and your live URL with `/**`) to **Redirect URLs**.

Menu names in the Google and Supabase dashboards change from time to time, but these are the settings to look for.

### 3. Mailgun
1. Create a Mailgun account. For quick testing use the **sandbox domain**; Mailgun only delivers sandbox mail to addresses you add under **Authorized Recipients** (use your own email). For real customers, add and verify your own domain.
2. Create an API key in Mailgun.
3. Install the Supabase CLI, then from this folder run:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set MAILGUN_API_KEY=your-key MAILGUN_DOMAIN=your-domain
supabase secrets set MAIL_FROM="Akwete <orders@your-domain>"
supabase functions deploy send-order-email
```

If your Mailgun domain is in the EU region, also run `supabase secrets set MAILGUN_API_BASE=https://api.eu.mailgun.net`.

If the CLI complains about a missing project, run `supabase init` once first.

### 4. Run it
Google sign-in needs a real web address, so do not open the files by double-clicking. From this folder:

```bash
npx serve -l 3000
# or: python3 -m http.server 3000
```

Open http://localhost:3000, add a piece, go to checkout, sign in with Google, place the order, and check your inbox and the `orders` table in Supabase (Table Editor).

### 5. Deploy
Any static host works (Vercel, Netlify, Cloudflare Pages, GitHub Pages). Then add the live URL to Google's authorized origins and Supabase's redirect URLs.

## After you deploy: open check.html
Open `https://YOUR-SITE/check.html`. It lists every file the site needs and marks any that are missing, and it warns if `js/config.js` still has the placeholder Supabase values or if an old `index.html` is live. Fix anything marked red before testing.

Always upload the **whole folder with the same sub-folder names** (`css/`, `js/`, `js/lang/`, `assets/` and its sub-folders, `supabase/` is for Supabase only). The `js/menu.js` and `css/menu.css` files from earlier versions are no longer used; you can delete them.

A page that loses a support file now shows a red notice at the top instead of silently breaking, and the rest of the page keeps working.

## If the confirmation email "could not be sent"
The order is always saved first, so nothing is lost. The customer sees a **Resend confirmation email** button (also on My orders). To find the cause, open the browser console on the checkout page after ordering: it prints the real reason, for example:
- `403 ... authorized recipients`: Mailgun sandbox only sends to addresses you added and activated under Authorized recipients.
- `401`: wrong Mailgun key, or an EU account without the `MAILGUN_API_BASE` secret.
- `Mailgun is not configured on the server`: the `MAILGUN_API_KEY` or `MAILGUN_DOMAIN` secret is missing.
- `404` / `Failed to send a request to the Edge Function`: the function is not deployed, or not named exactly `send-order-email`.
The same message appears in Supabase under Edge Functions > send-order-email > Logs.

## Troubleshooting sign-in
- **"Unsupported provider: provider is not enabled"**: Google is not switched on in Supabase. Go to Authentication > Sign In / Providers > Google, turn it on, paste the Google Client ID and Client secret, and save.
- **"redirect_uri_mismatch" from Google**: the Authorized redirect URI in Google Cloud Console must be exactly the callback URL shown on Supabase's Google provider page.
- **Signed in but sent to the wrong page or localhost**: set the Site URL and add your live address with `/**` under Authentication > URL Configuration.

## If you already ran schema.sql earlier
Run `supabase/add-cloths.sql` once in the SQL Editor. It adds the four wrapper products so checkout accepts them.

## Before you go public (not shown on the site)
- Photo permission and credits: the cloth photos, weaver photos and the portraits on the history page need the owner's permission, with credits added under each image. Several look like museum or press photographs.
- Weaver names and workshops: add them under the "At the loom" photos once you have them.
- Real prices and sizes: the prices and sizes in `index.html` and the `products` table are samples. Change both together.
- Production times: the site does not promise a number of weeks. Add one only when you can keep it.
- Product claims: describe each item (handwoven, material, size) only as accurately as you can stand behind.

## Things to know
- **Payment** is not collected. Orders are saved as `pending` and the email says you will confirm payment. Add Paystack or Flutterwave later if needed.
- **Custom pieces** are priced on the server as base price x 1.5, rounded to the nearest 1,000. Change that in `place_order()` if your pricing differs.
- **Changing a product price**: edit the `products` table in Supabase and the matching number in `index.html`.
- **Order status** (`confirmed`, `in_production`, ...) is changed by you in the Supabase Table Editor; customers see it on `orders.html`.
- Keep `MAILGUN_API_KEY` and the service role key out of the repo. They live only in Supabase secrets.
