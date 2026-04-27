# Corisio — UI Specification

> **Scope:** This document defines every screen, component, state, and interaction for all three Corisio interfaces: the **Public Discovery App**, the **Store Owner App**, and the **Admin Panel**. It is written directly from the backend API behaviour — every field, every validation rule, every status, and every permission is derived from the actual code.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Public Discovery App](#2-public-discovery-app)
3. [Store Owner App](#3-store-owner-app)
4. [Admin Panel](#4-admin-panel)
5. [Shared Design Principles](#5-shared-design-principles)

---

## 1. System Overview

Corisio is a local store directory for Abuja, Nigeria. It is not an e-commerce platform — there is no cart, checkout, payment, or delivery. The product is discovery: users find nearby verified stores and see what those stores stock.

### Three Interfaces

| Interface | Users | Auth Method |
|---|---|---|
| Public Discovery App | General public / customers | No login required |
| Store Owner App | Store owners | Phone number + OTP (JWT) |
| Admin Panel | Corisio staff | Email + password (JWT) |

### Onboarding Status Flow

A store moves through these statuses in order:

```
registered → phone_verified → profile_complete → verified
                                               ↘ rejected
```

Only `verified` stores appear in public search results. This status transition is the core gating mechanism in the entire system.

### Boost Levels

Boosts are earned by referring verified stores. They affect search ranking — not pricing or features.

| Level | Referrals Required | Duration | Ranking Score |
|---|---|---|---|
| Bronze | 1 validated | 30 days | 1 |
| Silver | 4 validated | 60 days | 2 |
| Gold | 10 validated | 90 days | 3 |
| None | — | — | 0 |

An expired boost is treated as `none`. The boost badge should not appear if `boost.expiresAt` is in the past.

### Ranking Formula

Public store results are ranked by:

```
finalScore = (0.50 × boostScore) + (0.40 × distanceScore) + (0.10 × recencyScore)
```

Featured stores (admin-flagged `isFeatured: true`) receive a 1.25× multiplier on top.

---

## 2. Public Discovery App

This interface requires zero authentication. It is a read-only experience for users discovering stores and products near them.

---

### 2.1 Home / Store Discovery Screen

**Purpose:** The primary entry point. Displays nearby verified stores ranked by boost + distance.

**Data source:** `GET /api/v1/public/stores?lat=&lng=&radius=&...`

**Requirements:**
- On load, prompt for device location permission. If granted, use GPS coordinates as `lat`/`lng`.
- If location is denied, show a manual LGA selector (Wuse, Maitama, Garki, Gwarinpa, etc.) and derive approximate coordinates from that.
- Default search radius: 5 km. Allow user to expand to 10, 20, or 50 km.
- Results are paginated (20 per page). Implement infinite scroll or a "Load more" button.

**Store card — fields to show:**
- Store name (`storeName`)
- Category name and icon (`category.name`, `category.icon`)
- LGA (`address.lga`)
- Distance from user in km (`distanceKm`) — only show if GPS was granted
- Boost badge: show a coloured badge if `boost` is non-null. Gold = yellow, Silver = grey, Bronze = orange. Never show an expired boost.
- Store photo: first item from `photos[]`. Show a placeholder image if empty.
- `isFeatured` flag: if true, show a "Featured" label on the card.

**Filter bar (above results):**
- Category dropdown — populated from a static or fetched list of categories
- Sort toggle: Nearest / Top Rated (maps to `sortBy=distance` or `sortBy=boost`)
- Boosted Only toggle (maps to `boostedOnly=true`)

**Search bar:**
- Full-text search on store name. Passes `search=` param. Debounce by 400ms.
- Keep results live as the user types.

**Empty state:**
- "No stores found in your area" with a button to expand radius or clear filters.

**Error state:**
- Location permission denied with no manual LGA selected: show a prompt to select area before searching.

**Engagement tracking (fire-and-forget, no loading state):**
- When a store card appears in the visible viewport: call `POST /public/stores/:id/listing-click` once per session per store.

---

### 2.2 Store Profile Screen

**Purpose:** Full public profile of a single verified store.

**Data source:** `GET /api/v1/public/stores/:storeId`

**Required path:** Navigate here by tapping a store card. The URL should be `/stores/:storeId`.

**Fields to display:**

**Header section:**
- Store name (large heading)
- Boost badge (same rules as card view)
- Featured label if `isFeatured: true`
- Category name + icon
- Verified date: "Verified [month year]" from `verifiedAt`

**Photos:**
- Horizontal scrollable photo strip from `photos[]`
- If empty, show a placeholder banner with store initial letter

**Location block:**
- Full address from `address.raw`
- LGA and State
- Map embed or deep link to Google Maps using `address.coordinates.lat` and `address.coordinates.lng`
- "Get Directions" button → fires `POST /public/stores/:id/direction-click` then opens maps app

**Contact block:**
- Phone number from `phoneNumber`
- "Call Now" button → fires `POST /public/stores/:id/call-click` then opens dialler
- Website link if `website` is non-null

**Opening hours:**
- Day-by-day table from `openingHours[]`
- Each entry has `day`, `open`, `close`, `isClosed`
- Highlight today's day
- If `isClosed: true` for a day, show "Closed"
- If `openingHours` is empty, show "Opening hours not listed"

**Description:**
- Free text block from `description`. If null, hide the section entirely.

**Social links:**
- Icons for each platform in `socialLinks[]`. Show only if array is non-empty.

**Products section:**
- Fetched from `GET /api/v1/public/stores/:storeId/products`
- Show a horizontal scrollable product card strip
- Each product card: image, label, price (₦), availability badge
- "See all products" button → navigates to a full product list screen for this store
- If store has no products, hide this section entirely

**On screen load:**
- Call `POST /public/stores/:id/view` once per session

---

### 2.3 Product Search Screen

**Purpose:** Search for specific products across all nearby verified stores.

**Data source:** `GET /api/v1/public/products/search`

**Access points:**
- Global search bar in the app header (searches products when user types a product name)
- "Find a product near you" CTA on the home screen

**Search bar behaviour:**
- Placeholder: "Search products near you..."
- Debounce 400ms
- Passes `query=` param along with user's current `lat`, `lng`, `radius`
- A product is only returned if its store is verified and active — this is enforced server-side

**Filter panel (expandable drawer):**

| Filter | Input Type | API Param |
|---|---|---|
| Category | Dropdown | `category` (ObjectId) |
| Subcategory | Dependent dropdown | `sub_category` (ObjectId) |
| Product Group | Dependent dropdown | `product_group` (ObjectId) |
| Condition | Chip select | `condition`: new / used / refurbished |
| Availability | Chip select | `availability`: in_stock / out_of_stock / on_order |
| Price range | Dual slider | `minPrice`, `maxPrice` |
| Tags | Tag input | `tags` (comma-separated) |
| Sort by | Radio | `sortBy`: relevance / price_asc / price_desc / newest / distance |

The subcategory dropdown should only populate after a category is selected. The product group dropdown should only populate after a subcategory is selected.

**Result header:**
- Show total count: "42 products found"
- Show price range bar: "₦150 — ₦4,500" from `priceRange.min` and `priceRange.max`
- Show active filter chips with clear buttons

**Product card — fields to show:**
- Primary image (`images[0]`)
- Product label
- Price formatted as ₦X,XXX
- Availability badge: green "In Stock" / red "Out of Stock" / amber "On Order"
- Condition badge: show only for `used` and `refurbished` (don't clutter `new` items)
- Store name and LGA
- Distance in km (if GPS available)
- Boost badge on the store name (same rules as store card)
- Tags as small chips (show max 3, "+N more" if there are more)

**Empty state:** "No products found matching your search. Try a wider area or fewer filters."

---

### 2.4 Product Detail Screen

**Purpose:** Full detail view of a single product.

**Data source:** `GET /api/v1/public/products/:id`

**Navigate here from:** product card in search results or store profile product strip.

**Fields to display:**

**Image gallery:**
- Full-width swipeable image gallery from `images[]`
- Show dot indicator for multiple images

**Product info block:**
- Label (product name) — large heading
- Price: ₦X,XXX formatted, large
- Availability badge (same rules as search card)
- Condition badge — always show on this screen (new / used / refurbished)
- Tags displayed as chips

**Description:**
- Free text from `description`. Hide section if null.

**Specifications:**
- Render `specifications` object as a two-column key-value table
- Keys should be displayed with first letter capitalised and underscores replaced with spaces
- Example: `{ "weight": "70g", "flavour": "Chicken" }` → "Weight: 70g, Flavour: Chicken"
- Hide section if `specifications` is an empty object

**Store context block:**
- Store name (tappable → navigates to store profile)
- LGA and distance
- Boost badge
- "Visit Store" button → navigates to store profile

**On screen load:**
- The API increments `viewCount` automatically — no client-side action needed

---

### 2.5 Store Products List Screen

**Purpose:** All products from one specific store.

**Data source:** `GET /api/v1/public/stores/:storeId/products`

**Navigate here from:** "See all products" on the store profile screen.

**Layout:** Grid of product cards (2 columns on mobile)

**Filter:** Category dropdown to filter by category within this store

**Fields per card:** image, label, price, availability badge

---

## 3. Store Owner App

This is a mobile-first app (React Native or Flutter) for store owners to manage their listing and products. All screens require a valid JWT (`storeToken`) except the auth screens.

---

### 3.1 Authentication Screens

#### 3.1.1 Phone Entry Screen

**Purpose:** Entry point for all store owners.

**Fields:**
- Phone number input with Nigeria flag prefix (+234)
- Phone numbers are normalised — strip leading zero, prepend +234

**Action:** "Send OTP" → `POST /api/v1/stores/auth/send-otp`

**Success:** Navigate to OTP verification screen. Store the phone number in local state for use on the next screen.

**Error states:**
- Network error: "Could not send OTP. Check your connection."
- Rate limit (429): "You've requested too many OTPs. Try again in 10 minutes."

---

#### 3.1.2 OTP Verification Screen

**Purpose:** Enter the 6-digit OTP received via SMS.

**Fields:**
- 6-box PIN input (one digit per box, auto-advance focus)
- Show the destination number as confirmation: "OTP sent to +234 801 234 5678"
- Countdown timer: "Resend in 00:60" — decrement from 60 seconds
- After countdown reaches 0: show "Resend OTP" link → `POST /api/v1/stores/auth/resend-otp`

**Action:** Auto-submit when all 6 digits are filled → `POST /api/v1/stores/auth/verify-otp`

**Success:**
- Save `token` and `refreshToken` to secure storage
- Save `store.id` for subsequent API calls
- Route based on `onboardingStatus`:
  - `phone_verified` → navigate to Profile Setup screen
  - `profile_complete` → navigate to Pending Verification screen
  - `verified` → navigate to Store Dashboard

**Error states:**
- Invalid OTP (401): Shake animation on PIN boxes, red highlight, "Incorrect code. Try again."
- Expired OTP: "This code has expired. Please request a new one."

---

### 3.2 Onboarding Screens

These screens are only shown to stores that have not yet reached `verified` status.

#### 3.2.1 Profile Setup Screen

**Purpose:** Collect the information needed to submit a verification request.

**Shown when:** `onboardingStatus === 'phone_verified'`

**Required fields (marked with *):**
- Store Name * (`storeName`) — max 100 characters
- Owner Name * (`ownerName`) — max 80 characters
- Category * (`category`) — dropdown from categories list
- Street / address * (`address.raw`) — free text
- LGA * (`address.lga`) — dropdown of Abuja LGAs (Abaji, Abuja Municipal, Bwari, Gwagwalada, Kuje, Kwali)
- Coordinates — captured automatically via GPS button. Show a map pin preview. Store as `[lng, lat]` array.

**Optional fields:**
- Description — max 500 chars, character counter
- Website URL — validated as URL format
- Referral Code — if user was referred by another store. Show a field labelled "Were you referred? Enter their code". Validated on submission.

**Progress indicator:**
- Show a completion score bar at the top. Fetched from `GET /api/v1/stores/profile/completion`
- Each completed field lights up a checklist item with its point value:

| Field | Points |
|---|---|
| Store Name | 15 |
| Owner Name | 10 |
| Phone (verified) | 10 |
| Category | 10 |
| Address | 15 |
| Store Photo | 15 |
| Opening Hours | 10 |
| Description | 10 |
| Website | 5 |

- Show "Ready to submit!" when score ≥ 50. Score < 50: "Complete more fields to submit for verification."

**Action:** "Save & Continue" → `POST /api/v1/stores/register`

**Success:** Navigate to Pending Verification screen.

---

#### 3.2.2 Add Store Photo Screen

**Purpose:** Upload at least one store photo to improve profile score and pass verification.

**This is a sub-screen of the profile setup flow, accessible from the completion checklist.**

**Fields:**
- Photo upload area (tap to open camera/gallery)
- Up to 5 photos allowed
- Show thumbnails with delete button

**Action:** `POST /api/v1/stores/upload-photo` (upload individually, store URLs in `photos[]`)

---

#### 3.2.3 Opening Hours Screen

**Purpose:** Set trading hours per day.

**Fields per day (Mon–Sun):**
- Day label
- Toggle: "Open" / "Closed" (maps to `isClosed`)
- If Open: time pickers for `open` and `close` (e.g. "08:00" / "20:00")

**Action:** Saved as part of `PUT /api/v1/stores/profile`

---

#### 3.2.4 Pending Verification Screen

**Purpose:** Inform the store owner their profile is submitted and awaiting admin review.

**Shown when:** `onboardingStatus === 'profile_complete'`

**Content to show:**
- Illustration: document under review
- Heading: "Your application is under review"
- Body: "Our team will verify your store details, usually within 24–48 hours. You'll be notified once verified."
- Profile completion score and checklist — prompt them to reach 100% while waiting
- "Edit Profile" button → returns to Profile Setup screen

---

#### 3.2.5 Rejection Screen

**Purpose:** Inform the store owner their application was rejected with a reason.

**Shown when:** `onboardingStatus === 'rejected'`

**Content to show:**
- Heading: "Application Not Approved"
- Rejection reason from `rejectionReason` field
- "Update & Resubmit" button → navigates to Profile Setup screen with existing data prefilled

---

### 3.3 Store Dashboard

**Purpose:** Overview screen for verified stores. The home screen after login if `onboardingStatus === 'verified'`.

**Sections:**

**Boost status widget:**
- Show current boost level with colour-coded badge (gold / silver / bronze / none)
- Days remaining: "Silver Boost — 24 days left"
- Progress to next tier: progress bar showing validated referrals toward next milestone
- If no boost: "No active boost. Invite stores to earn one." with CTA to Referrals screen

**Quick stats row:**
- Three metric cards in a horizontal row:
  - 👁 Profile Views
  - 🔍 Search Appearances
  - 👆 Click-throughs
- CTR percentage: "(X.X% CTR)" — click-throughs ÷ search appearances
- Data from `GET /api/v1/stores/analytics/me`
- Tapping the stats row navigates to the full Analytics screen

**My Products shortcut:**
- Count of active products: "12 active products"
- "Manage Products" button → navigates to Product Management screen

**Referral shortcut:**
- Count of validated referrals
- "Invite Stores" button → navigates to Referral screen

**Profile completeness banner:**
- Only show if `profileCompletionScore < 100`
- "Your profile is X% complete. Finish it to improve your ranking."

---

### 3.4 Profile Management Screen

**Purpose:** Edit store profile after onboarding is complete.

**Data source:** `GET /api/v1/stores/me`
**Save action:** `PUT /api/v1/stores/profile`

**All fields from the Profile Setup screen are editable here.**

**Additional read-only info (not editable, for reference):**
- Onboarding status with coloured badge
- Verified date
- Referral code (read-only — cannot be changed)
- Store ID

**Saving behaviour:**
- Validate required fields before submitting
- Show inline validation errors per field
- Success toast: "Profile updated"
- If profile completion score changes, update the progress bar in real time

---

### 3.5 Product Management Screen

**Purpose:** List all products the store has created, including inactive ones.

**Data source:** `GET /api/v1/stores/products`

**Requires:** `onboardingStatus === 'verified'` — if not verified, show a locked state: "Product listings are available once your store is verified."

**Filter bar:**
- Status toggle: All / Active / Inactive (maps to `isActive`)
- Availability filter: In Stock / Out of Stock / On Order
- Category dropdown
- Search field (searches `label`)

**Product list item fields:**
- Primary image thumbnail (first in `images[]`)
- Product label
- Price: ₦X,XXX
- Availability badge
- Condition badge
- Active / Inactive toggle switch — tapping calls `PATCH /stores/products/:id/availability` for availability OR triggers soft delete for deactivation
- "Edit" icon → navigates to Edit Product screen

**Empty state:**
- "You haven't added any products yet." with "Add Product" CTA

**FAB (Floating Action Button):**
- "+" button → navigates to Add Product screen
- Show product count in header: "12 of 50 products" (50 is the max)
- When count reaches 50: disable FAB, show tooltip "Product limit reached (50/50)"

---

### 3.6 Add / Edit Product Screen

**Purpose:** Create or update a product listing.

**Data source for edit:** `GET /api/v1/stores/products/:id`
**Save actions:** `POST /api/v1/stores/products` (create) or `PUT /api/v1/stores/products/:id` (edit)

**Field layout:**

**Section: Images**
- Image upload area — minimum 1 required, no maximum enforced by UI (server allows arrays of any size)
- Show reorderable thumbnails (first image = primary display image)
- Each image must be uploaded to a CDN and stored as a URL

**Section: Basic Info**
- Product name (`label`) * — max 200 chars, character counter
  - Note: the server auto-capitalises each word on save, so input can be lowercase
- Description — text area, max 1000 chars, character counter
- Price * — numeric input, prefix "₦", no decimals needed
- Currency — read-only "NGN" (displayed for future reference)

**Section: Inventory**
- Condition * — segmented control: New / Used / Refurbished
- Availability * — segmented control: In Stock / Out of Stock / On Order
  - When set to In Stock: `inStock` is automatically set to true server-side
- Total in Stock — numeric input, defaults to 1

**Section: Classification**
- Category * — dropdown, fetched from categories list
- Subcategory * — dependent dropdown, populates after category is selected
- Product Group — optional dependent dropdown, populates after subcategory is selected

**Section: Specifications**
- Dynamic key-value pair editor
- "Add spec" button adds a new row: [key input] [value input] [delete icon]
- Specs are saved as the `specifications` object
- Show examples based on selected category (e.g. for Food: weight, flavour, packaging)

**Section: Tags**
- Tag input: type a tag and press Enter/comma to add
- Max 10 tags. Show counter "3/10 tags"
- Tags auto-lowercased by server
- Suggestions: common tags for the selected category (e.g. "halal", "imported", "bulk" for Food)

**Section: Video (optional)**
- URL input for a video link
- Show preview thumbnail if a valid YouTube/Vimeo URL is entered

**Validation (client-side before submitting):**
- Label: required, 2–200 chars
- Price: required, ≥ 0
- Images: at least 1
- Category + Subcategory: required
- Specifications: required (at least one key-value pair)
- Category and subcategory ObjectIds must be selected from the dropdowns — never let user type an ID manually

**Error handling:**
- 429 (product cap reached): "You've reached the 50 product limit. Delete or deactivate an existing product to add a new one."

---

### 3.7 Quick Availability Update

**Purpose:** Fast toggle of availability without opening the full edit screen.

**Trigger:** Availability badge on the product list item is tappable.

**Implementation:** Bottom sheet with three options: In Stock / Out of Stock / On Order.

**Action:** `PATCH /api/v1/stores/products/:id/availability`

**Success:** Badge updates inline immediately (optimistic update). Toast: "Updated."

---

### 3.8 Referral Screen

**Purpose:** Help verified stores invite other store owners to earn a boost.

**Data sources:**
- Referral code: `GET /api/v1/stores/referral/my-code`
- Referral list: `GET /api/v1/stores/referral/my-referrals`
- Stats: `GET /api/v1/stores/referral/stats`

**Sections:**

**My Referral Code:**
- Display code prominently: "STOR-AB12XY"
- Shareable link: "https://corisio.ng/join?ref=STOR-AB12XY"
- "Copy Link" button
- "Share" button → opens system share sheet
- QR code image (fetched from `qrCodeUrl` field in response)

**Boost Progress:**
- Current boost level badge
- Progress bar: "3 of 4 referrals to Silver" 
- Three milestone blocks side by side:
  - Bronze: 1 referral / 30 days — checkmark if reached
  - Silver: 4 referrals / 60 days — checkmark if reached
  - Gold: 10 referrals / 90 days — checkmark if reached

**Send SMS:**
- Phone number input + "Send Invite" button
- Action: `POST /api/v1/stores/referral/send-sms`
- Rate limit is 5 SMS per day — show counter: "3 SMS invites remaining today"
- Error 409: "This number is already a verified Corisio store."
- Error 429: "Daily SMS limit reached. Come back tomorrow."

**My Referrals list:**
- Status-grouped sections: Pending / Profile Complete / Validated / Rejected
- Each referral row: store name, LGA, status badge, date referred
- Validated referrals are highlighted with a green tick — these count toward boost

---

### 3.9 Boost Status Screen

**Purpose:** Detailed view of the current boost and its history.

**Data source:** `GET /api/v1/stores/boost/status`

**Shown when navigating from dashboard boost widget or a notification.**

**Fields:**
- Current level badge
- `isActive` status
- Days remaining (from `daysRemaining`)
- Expiry date: "Expires 15 March 2025"
- Boost source: Referral / Admin Grant
- Progress to next tier (same as Referral screen)

---

### 3.10 Store Analytics Screen

**Purpose:** Performance metrics for the authenticated store.

**Data source:** `GET /api/v1/stores/analytics/me`

**Metrics to display:**

| Metric | Display |
|---|---|
| Profile Views | Count with trend arrow |
| Search Appearances | Count with trend arrow |
| Click-throughs | Count |
| CTR | Percentage |
| Validated Referrals | Count |

**Boost card** — current level + expiry date

Note: Detailed time-series data (daily breakdown) is not available on the store-side endpoint. If you need charts, use the engagement data from the admin side or store daily data in a separate client cache.

---

### 3.11 Settings Screen

**Fields:**
- Notifications toggle (for FCM push notifications)
- Change phone number (triggers new OTP flow)
- Log Out → `POST /api/v1/stores/auth/logout` → clears token, navigates to Phone Entry screen

---

## 4. Admin Panel

The admin panel is a web application (desktop-first). Access is restricted to Corisio staff. Admin accounts are created by a super admin — there is no self-registration.

### Admin Roles and What They Can See

| Role | Store Verification | Referral Management | Boost Management | Analytics | Admin Accounts | Config |
|---|---|---|---|---|---|---|
| `super_admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `admin` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `verification_agent` | ✅ (verify/reject only) | View only | View only | ❌ | ❌ | ❌ |
| `analyst` | View only | View only | View only | ✅ | ❌ | ❌ |

Gates in the UI should be based on the `permissions[]` array returned at login — not the role name. Each sidebar item, button, and action should be conditionally rendered based on whether the logged-in admin has the required permission.

---

### 4.1 Admin Login Screen

**Route:** `/admin/login`

**Fields:**
- Email address
- Password (with show/hide toggle)
- "Forgot password?" link → navigates to Password Reset screen

**Action:** `POST /api/v1/corisio/admin/auth/login`

**Success:** Store `token` and `refreshToken` in memory/secure storage. Navigate to Dashboard.

**Error states:**
- Invalid credentials (401): "Invalid email or password."
- Account suspended (403): "Your account has been suspended. Reason: [suspensionReason]. Contact a super admin."
- Account disabled (403): "This account has been disabled. Contact a super admin."

---

### 4.2 Admin Password Reset

**Step 1 — Forgot Password Screen:**
- Email input
- Action: `POST /api/v1/corisio/admin/auth/forgot-password`
- Success: "If that email exists, a reset link has been sent."

**Step 2 — Reset Password Screen:**
- Route: `/admin/reset-password/:token`
- New password + confirm password inputs
- Action: `PUT /api/v1/corisio/admin/auth/reset-password/:token`
- Success: Navigate to login screen with success toast

---

### 4.3 Admin Sidebar Navigation

The sidebar items are conditionally shown based on the logged-in admin's `permissions[]`:

```
📊 Dashboard              (always visible)
🏪 Stores
   ├── Pending Queue       (requires: view_stores)
   └── All Stores          (requires: view_stores)
🔗 Referrals              (requires: view_referrals)
⚡ Boosts
   ├── Expiring Boosts     (requires: view_boosts)
   └── Boost Ledger        (requires: view_boosts)
📊 Analytics
   ├── Referral Analytics  (requires: access_reports)
   ├── Onboarding Funnel   (requires: access_reports)
   ├── Cluster Density     (requires: access_reports)
   └── Engagement          (requires: access_reports)
📦 Products               (requires: manage_config)
👥 Admin Accounts         (requires: view_admins — super_admin only in practice)
⚙️  Platform Config        (requires: manage_config)
```

---

### 4.4 Admin Dashboard

**Purpose:** Platform overview at a glance.

**Data sources:** Multiple analytics endpoints combined.

**Widgets to show:**

**KPI row (4 stat cards):**
- Total verified stores
- Stores pending verification (from pending queue count)
- Total referrals (total from referral analytics)
- Referral conversion rate

**Onboarding funnel mini-chart:**
- Horizontal bar chart showing: Registered → Phone Verified → Profile Complete → Verified
- Drop-off % between each stage

**Boost distribution donut chart:**
- None / Bronze / Silver / Gold proportions from `boostDistribution`

**Expiring boosts alert:**
- If any boosts expire in the next 7 days, show a warning card with count and "View" link

**Top referrers list:**
- Table: Store name, LGA, Boost level, Validated referrals (top 10)

---

### 4.5 Pending Verification Queue

**Route:** `/admin/stores/pending`

**Data source:** `GET /api/v1/admin/stores/pending`

**Purpose:** The primary daily task for verification agents — process new store applications.

**Filter bar:**
- LGA dropdown
- Category dropdown
- Sort: Oldest first (default, matches API) / Newest first

**Store row fields:**
- Store name
- Owner name
- Phone number (masked: +234 *** *** 5678 — only show last 4 digits in list, reveal on detail)
- LGA
- Category
- Profile completion score (progress bar)
- Submitted date
- Referred by: if `referredBy` is set, show the referrer's store name as a badge
- "Review" button → opens Store Detail screen

**Empty state:** "No stores pending verification. 🎉"

---

### 4.6 Store Detail Screen (Admin)

**Route:** `/admin/stores/:id`

**Data source:** `GET /api/v1/admin/stores/:id`

**Purpose:** Full admin view of a store record including verification history, referrals, and boost ledger.

**Sections:**

**Header:**
- Store name + status badge (registered / phone_verified / profile_complete / verified / rejected)
- Phone number (full, unmasked)
- Category, LGA, State
- Verified by: admin name + verification method if status is `verified`
- Rejection reason if status is `rejected`

**Profile details panel:**
- All address fields
- GPS coordinates — show on an embedded map
- Description
- Website
- Opening hours table
- Photos strip

**Profile completion checklist:**
- Same 9-field checklist from the store owner app, but read-only

**Verification actions panel:**
> Only show if `onboardingStatus === 'profile_complete'` and admin has `create_stores` permission

**Verify form:**
- Verification method dropdown: GPS / Photo / ID Check / Agent Visit
- Notes textarea (optional)
- Verified GPS Coordinates: two number inputs (lat, lng) — used if the agent has confirmed the actual store location differs from what was submitted
- "Verify Store" button → `POST /api/v1/admin/stores/:id/verify`

**Reject form:**
- Rejection reason textarea — **required**
- "Reject" button (destructive, red) → `POST /api/v1/admin/stores/:id/reject`
- Confirmation modal: "Are you sure you want to reject this store? This will notify the owner."

**Boost Grant panel:**
> Only show if admin has `manage_boosts` permission

- Boost level dropdown: Bronze / Silver / Gold
- Duration input: number of days (default 30)
- Note textarea (optional)
- "Grant Boost" button → `POST /api/v1/admin/stores/:id/boost-grant`

**Referral information panel:**
- Referred by: store name, referral code, status
- Stores this store has referred: list with status per referral
- "View Referral Tree" button → `GET /api/v1/admin/stores/:id/referral-tree` → opens a modal or side panel with a 2-level tree visualisation

**Boost ledger panel:**
- Chronological table of boost events: event type, from level, to level, expires at, note
- Events: activated / upgraded / expired / revoked / admin_grant

**Engagement panel:**
- Date range picker (default: last 30 days)
- Metric cards: Profile Views, Listing Clicks, Call Clicks, Direction Clicks
- Daily bar chart
- Lifetime totals from the store record

---

### 4.7 All Stores Screen

**Route:** `/admin/stores`

**Data source:** `GET /api/v1/admin/stores` (if this endpoint exists) or filtered from pending queue

**Purpose:** Search any store by name, phone, or status.

**Filters:**
- Status: all / registered / phone_verified / profile_complete / verified / rejected
- LGA, Category, Boost level

**Table columns:**
- Store name (link to detail screen)
- Owner name
- Phone
- Category
- LGA
- Status badge
- Boost level badge
- Profile score
- Registered date
- Action: "View" button

---

### 4.8 Referrals Screen

**Route:** `/admin/referrals`

**Data source:** `GET /api/v1/admin/referrals`

**Purpose:** Monitor the referral network for fraud and manage referral status.

**Filter bar:**
- Status: all / pending / profile_complete / validated / rejected
- Flagged: all / flagged only / unflagged only
- Date range

**Table columns:**
- Referrer store name (link)
- Referred store name (link)
- Channel (SMS / Link / Phone Input / QR Code)
- Status badge
- Flagged badge (red warning icon if `flagged: true`)
- Flag reason (shown in tooltip on hover)
- Referred date

**Row actions:**
- Flag button (only show if `manage_referrals` permission AND not already flagged)
  - Opens a modal: "Reason for flagging" textarea → `POST /admin/referrals/:id/flag`
  - If referral was `validated` and `boostApplied: true`, show a warning: "Flagging this referral will revoke the associated boost and recalculate the referrer's boost level."
- Unflag button (only show if flagged AND `manage_referrals` permission) → `POST /admin/referrals/:id/unflag`

**Flagged count badge** on sidebar icon if there are any unflagged fraudulent referrals pending review.

---

### 4.9 Boosts — Expiring Screen

**Route:** `/admin/boosts/expiring`

**Data source:** `GET /api/v1/admin/boosts/expiring`

**Purpose:** Shows all stores whose boost expires within the next 7 days.

**Fields per row:**
- Store name (link)
- LGA
- Phone
- Boost level badge
- Expiry date
- Days remaining
- "Grant Renewal" button (if `manage_boosts` permission) → opens Grant Boost modal inline

---

### 4.10 Boost Ledger Screen

**Route:** `/admin/boosts/ledger/:storeId`

**Data source:** `GET /api/v1/admin/boosts/ledger/:storeId`

**Accessed from:** Store Detail screen's "View Ledger" button.

**Purpose:** Full chronological audit trail of a single store's boost history.

**Table columns:**
- Event type badge: activated / upgraded / expired / revoked / admin_grant
- From level → To level (e.g. None → Bronze, Bronze → Silver)
- Trigger referral ID (if present) with link to referral record
- Expiry date set at time of event
- Note (if any)
- Created at

---

### 4.11 Analytics — Referral Analytics Screen

**Route:** `/admin/analytics/referrals`

**Data source:** `GET /api/v1/admin/analytics/referrals`

**Charts and widgets:**

- **KPI row:** Total referrals, Validated, Pending, Rejected, Conversion rate %
- **Abuse panel:** Flagged count, Auto-rejected count, Pending admin review count
- **Boost distribution donut chart:** None / Bronze / Silver / Gold counts
- **Channel breakdown bar chart:** SMS / Link / Phone Input / QR Code counts
- **Top referrers table:** Rank, Store name, LGA, Boost level, Validated referrals count

---

### 4.12 Analytics — Onboarding Funnel Screen

**Route:** `/admin/analytics/onboarding`

**Data source:** `GET /api/v1/admin/analytics/onboarding?period=30`

**Controls:**
- Period selector: 7 / 14 / 30 / 60 / 90 days (maps to `period` query param)

**Charts and widgets:**

- **Funnel chart:** Registered → Phone Verified → Profile Complete → Verified (with absolute counts and drop-off % between stages)
- **Rejected count:** Shown separately below the funnel
- **Average onboarding time:** "Avg. X minutes from registration to profile complete" from `avgOnboardingMinutes`
- **Drop-off rate cards:**
  - Registration → Phone Verified: X%
  - Phone Verified → Profile Complete: X%
  - Profile Complete → Verified: X%

---

### 4.13 Analytics — Cluster Density Screen

**Route:** `/admin/analytics/cluster-density`

**Data source:** `GET /api/v1/admin/analytics/cluster-density`

**Purpose:** Geographic view of where verified stores are concentrated across Abuja.

**Visualisation:**
- Map (Leaflet or Google Maps) centred on Abuja
- Cluster bubbles sized by store count per LGA
- Colour by dominant category in each LGA
- Click a bubble → show LGA breakdown in sidebar: store count, top categories

**LGA summary table (below map):**
- LGA name, store count, % of total, link to filter All Stores by that LGA

**Stats strip:**
- Total verified stores
- Densest LGA (from `densestLGA`)
- Number of LGAs with coverage

---

### 4.14 Analytics — Engagement Screen

**Route:** `/admin/analytics/engagement`

**Data sources:**
- Platform: `GET /api/v1/admin/analytics/engagement`
- Per-store: `GET /api/v1/admin/analytics/engagement/:storeId`

**Controls:**
- Date range picker (default: last 30 days)
- Store selector (search and select a specific store, or leave blank for platform view)

**Platform view widgets:**
- KPI row: Profile Views, Listing Clicks, Call Clicks, Direction Clicks (period totals)
- Conversion rates: Call Conversion % (`callConversionPct`), Direction Conversion % (`directionConversionPct`)
- Daily stacked bar chart: all four event types overlaid
- Definition tooltips: hover over each metric name to show what it means

**Store view (when a store is selected):**
- Same metrics but for that store only
- Lifetime totals panel alongside period totals (from the store's `profileViews`, `searchAppearances`, `clickThroughs` counters)
- Store header: name, LGA, boost level

---

### 4.15 Admin — Product Management Screen

**Route:** `/admin/products`

**Data source:** `GET /api/v1/admin/products`

**Purpose:** Platform-wide view of all product listings for moderation.

**Filter bar:**
- Store search (name or ID)
- Category / Subcategory
- Product Group
- Status: Active / Inactive
- Availability: In Stock / Out of Stock / On Order
- Condition: New / Used / Refurbished
- Free text search (label)

**Table columns:**
- Product label (link to detail modal)
- Price (₦)
- Condition badge
- Availability badge
- Active status (toggle switch → `PATCH /admin/products/:id/toggle-active`)
- Store name (link to store detail)
- Store onboarding status
- Category
- Created date

**Product stats panel** (sidebar or top-of-page widget, from `GET /admin/products/stats`):
- Total products, Active, Inactive
- Availability breakdown: In Stock / Out of Stock / On Order
- Condition breakdown: New / Used / Refurbished
- Top categories by product count

**Product detail modal (click a product):**
- Full product data: all fields including `viewCount`, `searchAppearances`, `boostLevel`
- Store context
- Specification key-value table
- Tags chips
- Images
- ProductGroup + linked Spec template

---

### 4.16 Admin Account Management Screens

> Only accessible to `super_admin` role (requires `view_admins` + `manage_admins` permissions).

#### 4.16.1 Admin Accounts List

**Route:** `/admin/accounts`

**Data source:** `GET /api/v1/corisio/admin/admins`

**Table columns:**
- Name (first + last)
- Email
- Role badge (super_admin / admin / verification_agent / analyst)
- Status badge (active / suspended / disabled)
- Last login date
- Login count
- Actions: Edit / Suspend / Disable / Reset Password

**"Create Admin" button** → opens Create Admin modal

---

#### 4.16.2 Create / Edit Admin Modal

**Fields:**
- First Name, Last Name — required
- Email — required, unique
- Phone number — optional
- Role — dropdown: super_admin / admin / verification_agent / analyst
- Custom permissions — multi-select checklist (permissions to add on top of role defaults)
- Revoked permissions — multi-select checklist (permissions to strip from role defaults)
- Password (create only) — auto-generate or manual entry

**Action:**
- Create: `POST /api/v1/corisio/admin/admins`
- Edit: `PUT /api/v1/corisio/admin/admins/:id`

---

#### 4.16.3 Admin Status Actions

Each action requires confirmation modal:

| Action | Endpoint | Confirmation |
|---|---|---|
| Suspend | `POST /admins/:id/suspend` | Enter suspension reason + optional end date |
| Unsuspend | `POST /admins/:id/unsuspend` | "Confirm you want to restore access" |
| Disable | `POST /admins/:id/disable` | "This is permanent. The account cannot be reactivated." |
| Reset Password | `POST /admins/:id/reset-password` | "A reset link will be sent to their email" |

---

### 4.17 Admin Profile & Settings Screen

**Route:** `/admin/settings`

**Sections:**

**My Profile:**
- Display: name, email, role, permissions list, last login, login count
- "Change Password" form → `PUT /api/v1/corisio/admin/auth/change-password`
  - Fields: current password, new password, confirm new password

**Session:**
- "Log Out" button → `POST /api/v1/corisio/admin/auth/logout` → clear token, navigate to login

---

## 5. Shared Design Principles

These rules apply to all three interfaces.

### 5.1 Status Badges

Use consistent colours everywhere:

| Status / Level | Colour |
|---|---|
| verified / active / in_stock | Green |
| profile_complete / pending | Amber / Yellow |
| rejected / inactive / out_of_stock | Red |
| phone_verified / on_order | Blue |
| registered | Grey |
| Gold boost | #F5A623 (orange-gold) |
| Silver boost | #9B9B9B (silver-grey) |
| Bronze boost | #D4622A (bronze-orange) |
| No boost | Not shown |

### 5.2 Currency Formatting

All prices are in Nigerian Naira (NGN). Format as: `₦1,500` (no decimal places). The currency field in the API defaults to `NGN` and is reserved for future multi-currency support — the UI should read it but always display the ₦ symbol for now.

### 5.3 Token Handling

- Access token expires in 7 days. Refresh token expires in 30 days.
- When any API call returns 401, attempt a silent token refresh using `POST /stores/auth/refresh-token` (or `/corisio/admin/auth/refresh-token` for admin).
- If refresh also returns 401, clear all stored tokens and navigate to the login screen.
- Never log or expose JWT tokens in error messages or crash reports.

### 5.4 Fire-and-Forget Engagement Calls

The following API calls should be made without awaiting a response and without showing any loading indicator or error state:
- `POST /public/stores/:id/view`
- `POST /public/stores/:id/listing-click`
- `POST /public/stores/:id/call-click`
- `POST /public/stores/:id/direction-click`

These are analytics events. If they fail, the user experience should be unaffected.

### 5.5 Coordinates

The API stores coordinates in GeoJSON format: `[longitude, latitude]`. When displaying to users, convert to `{lat, lng}` format. When sending coordinates to the API, send as `[lng, lat]`. This conversion must be handled explicitly — swapping these is a common source of bugs.

### 5.6 Search Appearances Increment

The server increments `searchAppearances` on products and stores automatically when they appear in search results. The client does not need to call any endpoint for this — it happens server-side as a fire-and-forget write during the search query.

### 5.7 Soft Deletes

Products are never hard-deleted. When a store owner "deletes" a product, it sets `isActive: false`. The product remains in the database for analytics. In the admin product list, allow filtering by `isActive` to see both active and inactive products.

### 5.8 Pagination

All list endpoints return pagination metadata:
```json
{
  "total": 47,
  "page": 1,
  "limit": 20,
  "totalPages": 3,
  "hasNextPage": true,
  "hasPrevPage": false
}
```

Use `hasNextPage` to determine whether to show a "Load more" button or enable infinite scroll. Never calculate `totalPages` on the client — use the value from the API.

### 5.9 Empty vs. No-Access States

Distinguish clearly between:
- **Empty state:** The resource exists but has no items yet → friendly illustration + CTA
- **No-access state:** The user's role/status does not permit this action → locked state with explanation
- **Not found:** The resource doesn't exist → 404 screen

### 5.10 Accessibility and Localisation

- All prices, times, and dates should use the Nigerian locale (English, West Africa Time UTC+1)
- Phone numbers are Nigerian (+234 format)
- LGA names in dropdowns should be spelled exactly as stored in the database
- Right-to-left (RTL) is not required at this stage
- Minimum touch target size: 44×44pt for all interactive elements
