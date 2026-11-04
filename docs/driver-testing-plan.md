# Driver Usability Testing Plan, Consent Form & TAWU Case Intake Template (`T29` & `T41`)

**Owner:** Mercy (`@ImpactByMercy`) — Domain Knowledge & Testing Lead  
**Target Sessions:** 23–24 October 2026 (5–10 active ride-hailing drivers in Nairobi)  
**Session Duration:** 15 minutes per driver  

---

## 1. Recruitment Plan (5–10 Drivers)

### Target Participant Mix
To validate **Sauti ya Dere** across realistic Kenyan operating conditions, we recruit **5 to 10 active or recently deactivated ride-hailing drivers** in Nairobi covering:
- **Platforms:** Uber, Bolt, Little Cab, and Faras (at least 1–2 drivers per platform, as many multi-app).
- **Case Experience:** At least 1 participant per core dispute category (`fare_dispute`, `passenger_safety`, `rating_or_cancellation`, `fraud_flag`).
- **Language Preference:** Mix of English, Kiswahili, and Sheng / mixed Kenyan English speakers.
- **Device Constraint:** Entry-to-mid-range Android smartphones (Chrome on Android, standard mobile data / offline mode after PWA installation).

### Recruitment Channels
1. **Direct Stage & Waiting-Zone Outreach (Primary):**
   - **Westlands** (Sarit Centre / Mpaka Road driver waiting bay)
   - **Kilimani / Yaya Centre** taxi & ride-hailing hold areas
   - **Nairobi CBD / Upper Hill** daytime driver rest stops
   - **Roysambu / Thika Road Mall (TRM)** evening stage
2. **Union & Partner Referral Channel (TAWU Kenya):**
   - Coordinated outreach via **Transport and Allied Workers Union (TAWU)** digital taxi representatives (**Mr. Otieno** & **Bill Mutoro**) to connect with drivers who have recently sought union guidance on platform deactivations.

---

## 2. Informed Consent Form (English & Kiswahili)

> **Compliance Note:** Structured in accordance with the **Kenya Data Protection Act, 2019 (Sections 26, 30 & 32)**. Drivers may sign on paper or provide recorded verbal/in-app consent before testing.

### English Version — Participant Consent Form
**Project Title:** Sauti ya Dere — Ride-Hailing Driver Appeal & Evidence Tool  
**Research Team:** Violet, George & Mercy  

1. **Purpose of the Session:** You are invited to test a mobile web application (*Sauti ya Dere*) designed to help Kenyan digital taxi drivers organise their evidence and draft structured appeal letters citing NTSA Legal Notice 120 (2022) and platform policies.
2. **What You Will Do (15 Minutes):** You will install/open the app on a phone, enter a sample or anonymised past dispute story, check the suggested case type and evidence checklist, and download a 1-page PDF appeal summary.
3. **Privacy & Data Protection:**
   - **On-Device Storage:** Any case notes or screenshots you add in the app stay inside the phone's browser (`IndexedDB`) and are deleted after the test if using a researcher's phone.
   - **Personal Details Filter:** Our server automatically strips phone numbers, number plates, M-Pesa codes, and names before generating appeal wording, and **never saves your story on the server**.
   - **Observation Notes:** We will only record anonymous usability metrics (time taken per screen, where the interface was confusing, and your feedback).
4. **No Guarantee of Account Reinstatement:** *Sauti ya Dere* is an educational and self-advocacy documentation tool, not a law firm or official platform tribunal. Using this tool does not guarantee that Uber, Bolt, Little, or Faras will reactivate a suspended account.
5. **Voluntary Participation:** Participation is completely voluntary. You may skip any question or stop the session at any time without penalty.

**Participant Confirmation:**
- [ ] I understand the purpose of this test and agree to participate voluntarily.
- [ ] *(Optional — for `T17` Real Test Set)* I consent to sharing an **anonymised** summary of a past platform dispute (with all names, plates, and phone numbers removed) for scoring and improving the tool (`scope: ["test_set"]`).

**Participant Code (Do NOT write full legal name):** `DRV-____`  
**Platform(s) Used:** `[ ] Uber  [ ] Bolt  [ ] Little  [ ] Faras`  
**Consent Form Type:** `[ ] Written  [ ] Verbal Recorded  [ ] In-App`  
**Date:** `2026-10-____`  

---

### Kiswahili Version — Fomu ya Idhini ya Mshiriki
**Jina la Mradi:** Sauti ya Dere — Kifaa cha Rufaa na Ushahidi kwa Madereva wa Teksi za Mtandaoni  

1. **Lengo la Jaribio:** Tunakualika kujaribu programu ya simu (*Sauti ya Dere*) inayowasaidia madereva wa Uber, Bolt, Little na Faras kupanga ushahidi wao na kuandika barua rasmi ya rufaa kwa kuzingatia Sheria za NTSA (LN 120 ya 2022).
2. **Utakachofanya (Dakika 15):** Utafungua programu kwenye simu, utaeleza kisa cha kufungiwa akaunti au tatizo la nauli (bila kutaja majina halisi), utahakiki orodha ya ushahidi unaohitajika, na kupakua hati ya rufaa ya ukurasa mmoja (PDF).
3. **Faragha na Ulinzi wa Data:**
   - **Data Inabaki Kwenye Simu:** Maelezo ya kesi na picha za skrini (screenshots) hubaki kwenye simu pekee na hazihifadhiwi kwenye seva yetu.
   - **Kuondoa Taarifa Binafsi:** Mfumo wetu huondoa nambari za simu, nambari za gari (plate numbers), jumbe za M-Pesa na majina kabla ya kutengeneza barua ya rufaa.
4. **Hakuna Ahadi ya Kurudishiwa Akaunti Moja kwa Moja:** *Sauti ya Dere* ni kifaa cha kukusaidia kuandaa rufaa na ushahidi wako vizuri; hatutoi ahadi kwamba kampuni ya teksi itafungua akaunti yako moja kwa moja.
5. **Ushiriki wa Hiari:** Kushiriki ni kwa hiari yako. Unaweza kusitisha jaribio wakati wowote.

**Idhini ya Dereva:**
- [ ] Nimesoma na kuelewa maelezo haya na ninakubali kushiriki kwa hiari.
- [ ] *(Hiari)* Ninakubali kisa changu (baada ya kuondolewa majina na nambari za siri) kitumike kuboresha na kupima mfumo huu.

**Nambari ya Mshiriki:** `DRV-____` | **Tarehe:** `2026-10-____`

---

## 3. 15-Minute Driver Usability Test Script (`T29` & `T41`)

### Minute 0–2: Welcome, Framing & Consent
- **Moderator says:**
  > *"Habari! Thank you for giving us 15 minutes today. We are testing **Sauti ya Dere**, a free tool built to help drivers prepare stronger appeals when an app blocks your account or withholds your fare. Remember: we are testing **the app, not you**—if anything on the screen is confusing or hard to tap, please say so out loud!"*
- Walk through the consent form (English or Kiswahili) and record the participant code (`DRV-01` to `DRV-10`).

### Minute 2–12: Hands-On Scenario Walkthrough (6 Screens, ~10 Mins)
Ask the driver to hold the phone and complete **one complete case from start to PDF export** using either their own past anonymised experience or a provided prompt card:

| Step | Screen / Feature | Task Given to Driver | What Moderator Observes (Do Not Coach Unless Stuck > 60s) |
| :---: | :--- | :--- | :--- |
| **1** | **PWA Install / Home (`T09`)** | *"Open the Sauti ya Dere icon on the phone and start a new appeal case."* | Does the driver immediately spot the primary CTA button? |
| **2** | **Platform & Notice (`T26`)** | *"Select the app (Uber/Bolt/Little/Faras) and paste or skip the suspension notice."* | Can the driver easily toggle platforms and understand that the notice is optional? |
| **3** | **Intake Story (`T26`)** | *"In your own words (English, Swahili, or Sheng), type what happened, when, where, and any KSh amount involved."* | Does the driver understand the prompt? Can they go back and edit their answer? |
| **4** | **Confirm Case Type (`T33`)** | *"Look at the case category the app suggested. Does it match your story, or would you change it?"* | Does the driver understand the plain-English category label and manual override option? |
| **5** | **Evidence Checklist & Gaps (`T24`)** | *"Tick the evidence you already have on your phone, then read what the app says is still missing and why."* | Are the plain-English reasons from `checklists.json` clear and actionable to the driver? |
| **6** | **Appeal Preview & PDF Export (`T27`, `T35`, `T34`)** | *"Read the generated appeal statement, copy it or tap 'Export 1-Page PDF Case File', and check the Case Log."* | Can the driver successfully generate and open the 1-page PDF on their phone? |

### Minute 12–15: Quick Debrief Questions
1. *"Which screen was the easiest to use, and which screen made you pause or feel confused?"*
2. *"Look at the missing evidence list and the appeal letter—would you feel confident sending this to platform support or taking the PDF to TAWU / NTSA?"*
3. *"Did you feel comfortable about your privacy knowing that your screenshots stay on your phone and personal details are filtered out?"*
4. *"If you could change one thing before we launch, what would it be?"*

---

## 4. Moderator Observation Sheet (`T41` Log Template)

| Driver ID | Platform | Case Type Tested | Language Used | Total Time (mm:ss) | Completed PDF? (Y/N) | Where They Hesitated / Got Stuck | Key Driver Quote / UI Fix Needed (`T42`) |
| :---: | :---: | :--- | :---: | :---: | :---: | :--- | :--- |
| `DRV-01` | | | | | | | |
| `DRV-02` | | | | | | | |
| `DRV-03` | | | | | | | |
| `DRV-04` | | | | | | | |
| `DRV-05` | | | | | | | |

---

## 5. TAWU / Partner Sample Case Intake Form (Shared with Bill Mutoro)

> Use this short structured template when collecting anonymised sample cases from **TAWU** (`Bill Mutoro` / `Mr. Otieno`) or driver interviews for `T17`:

1. **Platform:** `[ ] Uber  [ ] Bolt  [ ] Little Cab  [ ] Faras  [ ] Other`
2. **Type of Dispute:**
   - `[ ] Fare / Earnings Dispute` *(unpaid cash/M-Pesa, price drop, bonus withheld)*
   - `[ ] Passenger Safety / Conduct Allegation` *(false complaint after driver enforced safety rules)*
   - `[ ] Low Rating or High Cancellation Lock` *(bad pickup pins, rider-requested cancellations, retaliatory 1-stars)*
   - `[ ] Algorithmic Fraud / GPS / Account Sharing Flag` *(GPS jump in tall buildings, false fake-trip flag)*
3. **Exact or Approximate Deactivation Message Seen in App (if any):**
   - `____________________________________________________________________`
4. **Driver's Story in Their Own Words (Anonymised — no real names, phone numbers, or plates):**
   - *Include approximate day/time, Nairobi area/route, and KSh amount if relevant:*
   - `____________________________________________________________________`
   - `____________________________________________________________________`
5. **What Evidence Did the Driver Already Have?**
   - `[ ] Deactivation screen  [ ] Trip receipt  [ ] M-Pesa statement  [ ] In-app chat screenshot  [ ] Google Maps history  [ ] Police abstract  [ ] Dashcam clip  [ ] Witness`
6. **What Evidence Was Missing That TAWU Needed for the Appeal?**
   - `____________________________________________________________________`
