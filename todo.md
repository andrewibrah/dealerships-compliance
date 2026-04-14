# AAND Compliance Engine - Project TODO

## Phase 1: Scaffold (Day 1)
- [x] Initialize Vite + React with all dependencies
- [x] Set up Tailwind CSS
- [x] Initialize React Router with all page routes
- [x] Create .env.example with all required keys
- [x] Create placeholder components for all pages
- [x] Verify npm run dev shows landing page skeleton
- [x] Write STATUS.md: Phase 1 complete

## Phase 2: Auth + Database (Days 2-3)
- [x] Extend Drizzle schema with dealerships, compliance_answers, subscriptions tables
- [x] Generate database migrations
- [x] Build useAuth.js hook with Manus OAuth
- [x] Create dealership management procedures
- [x] Implement compliance answer persistence
- [x] Create subscription management procedures
- [x] Build database query helpers (server/db.ts)
- [x] Create tRPC routers for all entities

## Phase 3: Compliance Wizard (Days 4-5)
- [x] Create 9-section wizard component with navigation
- [x] Define all 45 FTC Safeguards questions with weighting
- [x] Implement real-time scoring algorithm
- [x] Add section progress tracking
- [x] Create risk level indicators
- [x] Write vitest tests for scoring (6 tests passing)
- [x] Implement gap identification and critical gap tracking

## Phase 4: PDF Generation (Days 5-6)
- [x] Create WISP PDF generator (pdf-lib)
- [x] Create board-level compliance report generator
- [x] Implement PDF storage integration with S3
- [x] Create tRPC procedures for PDF generation
- [x] Add subscription gating (Core plan required)
- [x] Create Documents page with vault UI

## Phase 5: Stripe + Paywall (Days 6-7)
- [x] Create Stripe webhook handler for subscription events
- [x] Create Stripe checkout session procedure
- [x] Implement subscription status checking
- [x] Add cancel subscription functionality
- [x] Create pricing page component
- [x] Implement $199/month Core plan pricing
- [x] Add email service integration (Resend)
- [x] Create transactional email templates

## Phase 6: Dashboard + Email (Days 7-8)
- [x] Build dashboard with compliance overview
- [x] Add compliance score visualization
- [x] Create gap report summary
- [x] Implement email reminder scheduling
- [x] Add FTC urgency banner with regulatory deadlines
- [x] Create compliance status indicators
- [x] Build section progress cards

## Phase 7: Landing Page + Deploy (Days 8-9)
- [x] Enhance landing page with feature highlights
- [x] Add social proof section
- [x] Create FAQ section
- [x] Add pricing section to landing page
- [ ] Configure domain and SSL
- [ ] Deploy to Vercel
- [ ] Set up monitoring and analytics
- [ ] Create deployment documentation

## Phase 8: Final Verification & Delivery (Day 9)
- [ ] Test all user flows end-to-end
- [ ] Verify Stripe integration in production
- [ ] Test email notifications
- [ ] Verify PDF generation and download
- [ ] Check responsive design on mobile
- [ ] Performance testing and optimization
- [ ] Security audit
- [ ] Create user documentation
- [ ] Prepare deployment guide
