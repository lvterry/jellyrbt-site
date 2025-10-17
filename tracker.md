# Subscription Tracker App - Development Specification

## Project Overview
A cross-device subscription tracking web application integrated with Firebase for data persistence and authentication, deployable to an existing Netlify static site.

---

## Phase 1: Firebase Setup

### 1.1 Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name (e.g., "subscription-tracker")
4. Disable Google Analytics (optional for this project)
5. Click "Create project"

### 1.2 Enable Authentication
1. In Firebase Console, go to "Authentication" in left sidebar
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable "Google" sign-in provider
5. Add your email as authorized domain if needed
6. Save configuration

### 1.3 Create Firestore Database
1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Start in **production mode** (we'll set custom rules next)
4. Choose a location close to you (e.g., us-central)
5. Click "Enable"

### 1.4 Configure Firestore Security Rules
Replace default rules with:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/subscriptions/{subscription} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
This ensures users can only access their own subscription data.

### 1.5 Get Firebase Configuration
1. Go to Project Settings (gear icon)
2. Scroll to "Your apps" section
3. Click web icon (</>) to add a web app
4. Register app with a nickname
5. Copy the Firebase configuration object (you'll need this in your code)

---

## Phase 2: Application Structure

### 2.1 File Structure
```
your-site/
├── subscriptions.html (or index.html)
├── css/
│   └── subscriptions.css
├── js/
│   ├── firebase-config.js
│   ├── auth.js
│   └── subscriptions.js
└── (other existing site files)
```

### 2.2 Core Components to Build

**HTML Page (subscriptions.html)**
- Header with app title and sign out button
- Authentication section (shown when logged out)
- Main app section (shown when logged in)
- Form to add new subscription
- List/grid display of existing subscriptions
- Footer

**CSS Styling**
- Responsive design (mobile and desktop)
- Card-based layout for subscriptions
- Form styling
- Loading states
- Color-coded subscriptions by billing cycle (optional)

**JavaScript Modules**

1. **firebase-config.js**
   - Initialize Firebase with your config
   - Export Firebase app, auth, and Firestore instances

2. **auth.js**
   - Handle Google sign-in
   - Handle sign-out
   - Listen for authentication state changes
   - Show/hide UI based on auth state

3. **subscriptions.js**
   - CRUD operations for subscriptions
   - Real-time listener for subscription updates
   - Calculate total monthly/yearly costs
   - Sort and filter subscriptions

---

## Phase 3: Data Model

### 3.1 Firestore Structure
```
users/{userId}/subscriptions/{subscriptionId}
```

### 3.2 Subscription Document Schema
Each subscription document should contain:
- **name** (string): Service name (e.g., "Netflix")
- **cost** (number): Price amount
- **currency** (string): Currency code (e.g., "USD")
- **billingCycle** (string): "monthly", "yearly", or "weekly"
- **nextBillingDate** (timestamp): When next payment is due
- **category** (string, optional): "Entertainment", "Productivity", "Storage", etc.
- **description** (string, optional): Notes about the subscription
- **active** (boolean): Whether subscription is currently active
- **createdAt** (timestamp): When subscription was added
- **updatedAt** (timestamp): Last modification time

---

## Phase 4: Core Features to Implement

### 4.1 Authentication
- Google Sign-In button on landing page
- Display user profile picture and name when logged in
- Sign-out functionality
- Protect all subscription features behind authentication

### 4.2 Add Subscription
Form fields:
- Service name (required)
- Cost (required, number input)
- Currency (dropdown with common currencies)
- Billing cycle (dropdown: monthly/yearly/weekly)
- Next billing date (date picker)
- Category (optional dropdown)
- Description (optional textarea)
- Active toggle (default: true)

Validation:
- Ensure name and cost are provided
- Validate cost is a positive number
- Auto-calculate next billing date if not provided

### 4.3 View Subscriptions
- Display all active subscriptions as cards
- Show key info: name, cost, billing cycle, next billing date
- Calculate and display total monthly cost (convert yearly/weekly to monthly equivalent)
- Calculate and display total yearly cost
- Option to toggle showing inactive subscriptions

### 4.4 Edit Subscription
- Click on subscription card to edit
- Open modal or inline form with current values
- Update Firestore document on save
- Update timestamp

### 4.5 Delete Subscription
- Delete button on each card
- Confirmation dialog before deletion
- Remove from Firestore

### 4.6 Mark as Inactive/Active
- Toggle button to mark subscription as cancelled without deleting
- Keep for historical tracking
- Exclude from cost calculations when inactive

---

## Phase 5: Enhanced Features (Optional)

### 5.1 Dashboard Analytics
- Total monthly spend
- Total yearly spend
- Most expensive subscription
- Number of active subscriptions
- Chart/graph of spending by category
- Upcoming renewals (next 7/30 days)

### 5.2 Notifications
- Browser notifications for upcoming renewals (requires permission)
- Check daily for subscriptions renewing within 3 days

### 5.3 Search and Filter
- Search subscriptions by name
- Filter by category
- Filter by billing cycle
- Sort by cost, name, or renewal date

### 5.4 Export Data
- Export subscriptions to CSV
- Export to JSON for backup

### 5.5 Recurring Billing Reminders
- Calculate and display when subscriptions will renew
- Visual calendar view of all renewal dates

---

## Phase 6: Implementation Steps

### 6.1 Setup (Day 1)
1. Complete all Firebase setup steps
2. Create HTML file structure
3. Include Firebase SDK via CDN in HTML
4. Initialize Firebase with your config

### 6.2 Authentication (Day 1)
1. Implement Google sign-in button
2. Add authentication state listener
3. Show/hide content based on auth state
4. Test sign-in and sign-out flow

### 6.3 Basic CRUD (Day 2)
1. Create form to add subscriptions
2. Implement function to save to Firestore
3. Implement real-time listener to display subscriptions
4. Test adding and viewing subscriptions

### 6.4 Edit and Delete (Day 2-3)
1. Add edit functionality to each subscription card
2. Implement update function
3. Add delete functionality with confirmation
4. Test all CRUD operations

### 6.5 Calculations and UI Polish (Day 3)
1. Calculate total monthly/yearly costs
2. Implement active/inactive toggle
3. Add responsive CSS styling
4. Test on mobile and desktop

### 6.6 Deploy (Day 3)
1. Add subscription tracker to your Netlify site folder
2. Commit and push to your Git repository
3. Netlify auto-deploys
4. Test production version

### 6.7 Optional Enhancements (Day 4+)
1. Implement any Phase 5 features you want
2. Add error handling and loading states
3. Improve UX with animations
4. Add data validation

---

## Phase 7: Deployment Considerations

### 7.1 Add to Existing Netlify Site
- Place files in a `/subscriptions` folder or root
- Update navigation to link to subscription tracker
- Ensure Firebase config is not exposed (it's okay to be public, but use security rules)
- Test that Firebase rules prevent unauthorized access

### 7.2 Environment Configuration
- Firebase config can be in your JavaScript (it's designed to be public)
- Security comes from Firestore rules, not hiding config
- Consider adding domains to Firebase authorized domains list

### 7.3 Testing Before Deploy
- Test sign-in flow
- Test all CRUD operations
- Test on multiple devices
- Verify data syncs across devices
- Test Firestore security rules by trying to access other users' data

---

## Phase 8: Security Best Practices

1. Never store sensitive payment information
2. Rely on Firestore security rules, not client-side checks
3. Keep Firebase rules restrictive (users only access their own data)
4. Use Firebase Authentication, don't build custom auth
5. Regularly review Firebase usage in console

---

## Technologies Stack Summary

**Frontend:**
- HTML5
- CSS3 (responsive design)
- Vanilla JavaScript (ES6+)

**Backend/Services:**
- Firebase Authentication (Google Sign-In)
- Cloud Firestore (database)

**Hosting:**
- Netlify (existing site)

**No additional frameworks required** - keep it simple with vanilla JS, or optionally use React if you prefer.

---

## Estimated Development Time
- Basic version (CRUD + auth): 2-3 days
- With enhanced features: 4-5 days
- Assumes familiarity with JavaScript and basic Firebase knowledge

---

This spec should give you everything you need to build your subscription tracker. Start with the basics and add features incrementally!