# Comprehensive Financial Plan & Penny-by-Penny Costing Model

> **Platform**: AI Sandbox Cloud Code Editor & AI Orchestration Platform  
> **Go-Live Target**: August 1 (Limited Early Access Launch)  
> **Primary AI Engine**: Gemini Flash (unified across Coding Agent, Copilot, Title Gen & Customer Care Bot)  
> **Currency Baseline**: 1 USD = ₹84.00 INR  

---

## 1. Primary AI Model Unit Economics (Gemini Flash)

### Model Rate Card (Google AI Studio / Vertex AI)
```
Input Tokens:  $0.075 per 1,000,000 tokens  ➜  $0.000000075 / token  ➜  ₹0.00000630 / token
Output Tokens: $0.300 per 1,000,000 tokens  ➜  $0.000000300 / token  ➜  ₹0.00002520 / token
```

---

### Exact Token Cost Accounting Per Operation

#### A. Coding Agent Task (LangGraph ReAct Loop — Avg 4 Iterations)
* **Input Context**: System prompt + 9 tool schemas + project file tree + active files context = **45,000 input tokens**
* **Output Generation**: Multi-step plan + code diffs + tool arguments + reasoning = **12,000 output tokens**

$$\text{Input Cost} = 45,000 \times ₹0.00000630 = ₹0.28350$$
$$\text{Output Cost} = 12,000 \times ₹0.00002520 = ₹0.30240$$
$$\mathbf{Total\ Cost\ Per\ Coding\ Task} = ₹0.28350 + ₹0.30240 = \mathbf{₹0.58590}\ \text{(\approx 58.6\ paise)}$$ 

---

#### B. Copilot Turn (Inline Code Completion & Explanations)
* **Input Context**: Truncated active file (max 3,000 chars) + last 5 chat messages + prompt = **2,000 input tokens**
* **Output Generation**: Code completion snippet / explanation = **350 output tokens**

$$\text{Input Cost} = 2,000 \times ₹0.00000630 = ₹0.01260$$
$$\text{Output Cost} = 350 \times ₹0.00002520 = ₹0.00882$$
$$\mathbf{Total\ Cost\ Per\ Copilot\ Turn} = ₹0.01260 + ₹0.00882 = \mathbf{₹0.02142}\ \text{(\approx 2.14\ paise)}$$
$$\mathbf{1-Hour\ Active\ Copilot\ Session\ (20\ turns)} = 20 \times ₹0.02142 = \mathbf{₹0.42840}\ \text{(\approx 42.8\ paise)}$$

---

#### C. Title Generation (New Session Naming)
* **Input Context**: System rules + user initial prompt = **400 input tokens**
* **Output Generation**: Structured JSON title = **20 output tokens**

$$\text{Input Cost} = 400 \times ₹0.00000630 = ₹0.00252$$
$$\text{Output Cost} = 20 \times ₹0.00002520 = ₹0.000504$$
$$\mathbf{Total\ Cost\ Per\ Title} = ₹0.00252 + ₹0.000504 = \mathbf{₹0.003024}\ \text{(\approx 0.30\ paise)}$$

---

#### D. Customer Care AI Chatbot (Support Ticket Auto-Responder)
* **Input Context**: System prompt (platform docs + FAQ + troubleshooting guides) + ticket history = **4,500 input tokens**
* **Output Generation**: Solution response / resolution step = **400 output tokens**

$$\text{Input Cost} = 4,500 \times ₹0.00000630 = ₹0.02835$$
$$\text{Output Cost} = 400 \times ₹0.00002520 = ₹0.01008$$
$$\mathbf{Total\ Cost\ Per\ Bot\ Message} = ₹0.02835 + ₹0.01008 = \mathbf{₹0.03843}\ \text{(\approx 3.84\ paise)}$$
$$\mathbf{Full\ Support\ Ticket\ Resolution\ (4\ exchanges)} = 4 \times ₹0.03843 = \mathbf{₹0.15372}\ \text{(\approx 15.37\ paise)}$$

---

## 2. Fixed Infrastructure Costs (24/7 Base Load)

These expenses run continuously regardless of active user traffic to support the **7 microservices**:
1. `auth-service` (Identity, Admin & Customer Support APIs)
2. `ai-service` (LangGraph Agent, Copilot, Title Gen, AI Customer Care Bot)
3. `sandbox-service` (Kubernetes Control Plane Client)
4. `router-service` (Wildcard Preview & Agent Proxy)
5. `notification-service` (RabbitMQ Email Worker)
6. `payments-service` (Razorpay Webhooks & Order Engine)
7. `in-cluster rabbitmq` & `redis` daemons

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ITEM                              SPECIFICATION               USD/MO    INR/MO  │
├──────────────────────────────────────────────────────────────────────────────────┤
│  AWS EKS Control Plane             Managed Cluster Fee        $73.00   ₹6,132.00 │
│  EKS System Node 1 (t3.medium)     2 vCPU, 4GB RAM            $30.37   ₹2,551.08 │
│  EKS System Node 2 (t3.medium)     2 vCPU, 4GB RAM            $30.37   ₹2,551.08 │
│  System EBS Storage (gp3)          2 × 30GB Root Volumes       $6.00     ₹504.00 │
│  MongoDB Atlas Cluster (M10)       General Purpose Database   $57.00   ₹4,788.00 │
│  Redis Cache (Shared / ElastiCache) Session & Cache Layer     $15.00   ₹1,260.00 │
│  AWS S3 Base Storage & Backups     100 GB Workspace Snapshots  $2.30     ₹193.20 │
│  Data Transfer Out                 50 GB Egress                $4.50     ₹378.00 │
│  AWS Route53 & CloudFront          DNS + CDN Base Allocation   $1.50     ₹126.00 │
├──────────────────────────────────────────────────────────────────────────────────┤
│  TOTAL FIXED MONTHLY OVERHEAD                                $220.04  ₹18,483.36 │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Dynamic User Sandbox Compute Costs (AWS EKS Workload Nodes)

Each user sandbox pod runs **3 containers**:
- `sandbox-container` (Vite dev server) — 500m CPU / 512Mi RAM
- `agent-container` (File system sidecar + node-pty terminal) — 500m CPU / 512Mi RAM
- `sync-agent-container` (S3 workspace backup daemon) — 500m CPU / 512Mi RAM
- **Total Pod Limits**: **1.5 vCPU + 1.5 GB RAM**

### Workload Node Bin-Packing Math
* Node Type: `t3.large` (2 vCPU, 8 GB RAM) = **$0.0832 / hour = ₹6.9888 / hour**
* Due to CPU request density, 1 `t3.large` node packs **3 active user sandbox pods**.
* **Hourly Compute Cost Per Active Pod**: $\frac{₹6.9888}{3} = \mathbf{₹2.3296\ \text{per pod-hour}}$.

---

## 4. Itemized Penny-by-Penny Unit Economics Per User Tier

### Tier A: Free Tier (Hard-Capped)
* **Limits**: 20 AI credits/mo, max 2h runtime/day, auto-sleep after 30min idle (avg 7.5 active hours/mo).

```
1. Pod Compute (7.5 hours × ₹2.3296)                      = ₹17.4720
2. AI Token Usage:
   - 20 Coding Agent Tasks (20 × ₹0.58590)               = ₹11.7180
   - 5 Copilot Sessions (5 × ₹0.42840)                    =  ₹2.1420
   - 1 Title Generation (1 × ₹0.00302)                   =  ₹0.0030
   - 1 AI Customer Care Resolution (1 × ₹0.15372)          =  ₹0.1537
3. Storage & Network Overhead (S3 + Egress per user)       =  ₹3.5000
4. Razorpay Transaction Fee                                 =  ₹0.0000
────────────────────────────────────────────────────────────────────────
TOTAL MONTHLY COST PER ACTIVE FREE USER                    = ₹34.9887  (≈ ₹34.99)
```

---

### Tier B: Pro Tier (Early Access ₹299 / Regular ₹499)
* **Usage Baseline**: 120 coding tasks/mo, 25 copilot sessions/mo, 55 pod-hours/mo.

```
1. Pod Compute (55 hours × ₹2.3296)                       = ₹128.1280
2. AI Token Usage:
   - 120 Coding Agent Tasks (120 × ₹0.58590)              =  ₹70.3080
   - 25 Copilot Sessions (25 × ₹0.42840)                 =  ₹10.7100
   - 5 Title Generations (5 × ₹0.00302)                  =   ₹0.0151
   - 2 AI Customer Care Resolutions (2 × ₹0.15372)         =   ₹0.3074
3. Storage & Network Overhead (S3 workspace + Egress)      =  ₹12.0000
4. Razorpay Transaction Fee (2% + 18% GST = 2.36%):
   - Early Access @ ₹299 (2.36% of ₹299)                  =   ₹7.0564
   - Regular @ ₹499 (2.36% of ₹499)                       =  ₹11.7764
────────────────────────────────────────────────────────────────────────
TOTAL COST (Early Access @ ₹299)                           = ₹228.5249  (≈ ₹228.52)
TOTAL COST (Regular @ ₹499)                                = ₹233.2449  (≈ ₹233.24)

NET MARGIN (Early Access @ ₹299):  ₹299.00 - ₹228.52 = +₹70.48 / user / mo  (23.57% margin)
NET MARGIN (Regular @ ₹499):       ₹499.00 - ₹233.24 = +₹265.76 / user / mo (53.26% margin)
```

---

### Tier C: Max Tier (Early Access ₹999 / Regular ₹1,499)
* **Usage Baseline**: 450 coding tasks/mo, 80 copilot sessions/mo, 150 pod-hours/mo (multi-pod).

```
1. Pod Compute (150 hours × ₹2.3296)                      = ₹349.4400
2. AI Token Usage:
   - 450 Coding Agent Tasks (450 × ₹0.58590)              = ₹263.6550
   - 80 Copilot Sessions (80 × ₹0.42840)                 =  ₹34.2720
   - 15 Title Generations (15 × ₹0.00302)                 =   ₹0.0453
   - 5 AI Customer Care Resolutions (5 × ₹0.15372)         =   ₹0.7686
3. Storage & Network Overhead (25GB S3 workspace + Egress) =  ₹28.0000
4. Razorpay Transaction Fee (2.36%):
   - Early Access @ ₹999 (2.36% of ₹999)                  =  ₹23.5764
   - Regular @ ₹1,499 (2.36% of ₹1,499)                   =  ₹35.3764
────────────────────────────────────────────────────────────────────────
TOTAL COST (Early Access @ ₹999)                           = ₹699.7573  (≈ ₹699.76)
TOTAL COST (Regular @ ₹1,499)                              = ₹711.5573  (≈ ₹711.56)

NET MARGIN (Early Access @ ₹999):  ₹999.00 - ₹699.76 = +₹299.24 / user / mo  (29.95% margin)
NET MARGIN (Regular @ ₹1,499):     ₹1,499.00 - ₹711.56 = +₹787.44 / user / mo (52.53% margin)
```

---

## 5. Early Access Launch Cohort Financial Statement (50 Users)

Assumed Launch Cohort Breakdown on **August 1**:
- **30 Free Users** (Invitees evaluating)
- **15 Pro Early Access Users** (@ ₹299/mo)
- **5 Max Early Access Users** (@ ₹999/mo)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  REVENUE & EXPENSE ACCOUNT                                           AMOUNT (INR)│
├──────────────────────────────────────────────────────────────────────────────────┤
│  REVENUE                                                                         │
│  - 15 Pro Early Access Subscriptions (15 × ₹299.00)                    ₹4,485.00 │
│  - 5 Max Early Access Subscriptions (5 × ₹999.00)                      ₹4,995.00 │
│  TOTAL GROSS REVENUE                                                   ₹9,480.00 │
├──────────────────────────────────────────────────────────────────────────────────┤
│  DIRECT VARIABLE EXPENSES                                                        │
│  - 30 Free Users Variable Cost (30 × ₹34.99)                           ₹1,049.70 │
│  - 15 Pro Early Access Variable Cost (15 × ₹228.52)                    ₹3,427.80 │
│  - 5 Max Early Access Variable Cost (5 × ₹699.76)                      ₹3,498.80 │
│  TOTAL DIRECT VARIABLE EXPENSES                                        ₹7,976.30 │
├──────────────────────────────────────────────────────────────────────────────────┤
│  CONTRIBUTION MARGIN (GROSS REVENUE - VARIABLE EXPENSES)               +₹1,503.70 │
├──────────────────────────────────────────────────────────────────────────────────┤
│  FIXED MONTHLY OVERHEAD (EKS + Atlas + Redis + Infrastructure Base)   ₹18,483.36 │
├──────────────────────────────────────────────────────────────────────────────────┤
│  NET LAUNCH COHORT MONTHLY OPERATING RESULT                           -₹16,979.66 │
└──────────────────────────────────────────────────────────────────────────────────┘
```

> **Key Financial Insight**: At launch, direct revenue (₹9,480) **more than covers variable user costs** (₹7,976.30), generating a positive contribution margin (+₹1,503.70). The net operating deficit of ₹16,979.66 is strictly due to fixed EKS cluster overhead, which remains flat as user density scales.

---

## 6. Breakeven & Profitability Scale Targets

### Breakeven Customer Mix (Full Regular Pricing)
Fixed Overhead: ₹18,483.36 / month.

```
Option 1: 70 Pro Users @ ₹499 (70 × ₹265.76 net margin = ₹18,603.20 profit) ➜ BREAKEVEN
Option 2: 24 Max Users @ ₹1,499 (24 × ₹787.44 net margin = ₹18,898.56 profit) ➜ BREAKEVEN
Option 3 (Balanced Mix): 40 Pro Users + 10 Max Users
         - 40 Pro × ₹265.76 = ₹10,630.40
         - 10 Max × ₹787.44 = ₹7,874.40
         - Total Net Margin Contribution = ₹18,504.80 ➜ BREAKEVEN
```

---

## 7. Operational Action Items to Secure Financial Model

1. **Enforce Idle Pod Auto-Sleep**: Configure `sandbox-service` to terminate pods after **30 minutes of WebSocket inactivity**. This guarantees pod compute stays within projected usage baselines.
2. **Set Redis Token Rate-Limiting**: Enforce hard credit stops when a user depletes their monthly allowance to prevent runaway API bills.
3. **Razorpay Webhook Webhook Verification**: Ensure idempotency key matching on `payment.captured` webhooks to avoid duplicate credit issuance.
