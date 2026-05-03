# DBJ VC Platform — Formula & Metric Documentation

**Scope:** Calculations found under `lib/portfolio/`, `lib/scoring/`, and metric-related usage in `app/api/portfolio/`.  
**Purpose:** Single reference for formulas, inputs, edge cases, and consistency risks.  
**Generated from codebase review** (no application logic changes in this pass).

---

## Cross-cutting risks (read first)

| Topic | Finding |
|--------|---------|
| **Compliance “done” definition** | `complianceRateByType` / `deriveComplianceScore` count **`accepted` OR `waived`** only. `deriveComplianceGovernance` reasoning rows count **`submitted`, `under_review`, OR `accepted`** as “good” — **not the same denominator as the score**. |
| **Compliance dashboard RPC vs JS** | `get_compliance_summary` (SQL) matches comment “deriveComplianceStatus + mapNestedFundsToComplianceRows”; **`complianceRateByType` %** on fund detail is **pure JS** on all obligations (not only `due_date <= today` unless caller filters). |
| **JMD → USD rate** | `toUsdEquivalent` in `lib/portfolio/capital-calls.ts` uses **`exchange_rate_jmd_usd ?? 157`**. `app/api/portfolio/distributions/summary/route.ts` uses **`fund.exchange_rate_jmd_usd ?? 157` per row**. `lib/portfolio/divestments.ts` uses **hardcoded `USD_EQ_RATE = 157`** in `toUsd()` — **does not read fund `exchange_rate_jmd_usd`**. |
| **Deployment % denominator** | **Quarterly financial dimension** and **portfolio health** use **`called / fund.dbj_commitment`**. PCTU **`remaining_commitment`** uses **`total_fund_commitment`** for fund-level remaining vs **DBJ** drawdown for DBJ block — **different bases by design**. |
| **PVC vs metrics** | `computeFundPerformanceMetrics(..., isPvc: true)` returns **DPI only** (if `called > 0`); **TVPI / MOIC / calculated IRR are null**. Obligation **due date** generation does **not** branch on PVC; only fund flags `requires_*` drive rows. |

---

### IRR (Internal Rate of Return) — calculated (XIRR)

**File:** `lib/portfolio/fund-performance-metrics.ts`  
**Functions:** `calculateXIRR`, `buildCashFlowsForXirr`, `computeFundPerformanceMetrics` (calls XIRR), `metricsForSnapshot`

**Formula (XIRR):**  
Solve rate `r` such that  
\(\sum_i \frac{amount_i}{(1+r)^{t_i}} = 0\)  
where `t_i` = **actual/365** year fraction from **first cash-flow calendar date** to cash-flow `i`’s date (`(date_i - date_0) / (86400000 * 365)`).

**Cash-flow construction (`buildCashFlowsForXirr`):**  
1. **Calls:** Each `vc_capital_calls` row with `status !== 'cancelled'` and `date_of_notice <= asOf` (terminal date), sorted by notice date → amount **`-num(call_amount)`** (outflow).  
2. **Distributions:** Each `vc_distributions` with `distribution_date <= asOf`, sorted → amount **`+num(amount)`** (inflow).  
3. **Terminal NAV:** If `applyDbjNavShareForMetrics(terminalNavFullFund, dbjProRataPct) > 0`, append one flow on **`terminalDateYmd`** with amount **`+terminalDbj`** where  
   `terminalDbj = fullFundNav * dbjNavShareMultiplier(dbj_pro_rata_pct)` and  
   `dbjNavShareMultiplier` = **`1`** if `dbj_pro_rata_pct` is null, 0, non-finite, or ≤0; else **`p/100`**.

**Date parsing:** `parseYmd` uses `new Date(\`${ymd}T12:00:00Z\`)` (UTC noon).

**Newton–Raphson (`calculateXIRR`):**  
- Initial `r = 0.1`, max **80** iterations.  
- Stop if `|NPV(r)| < 1e-8`.  
- If derivative magnitude `< 1e-12`, break.  
- If next `r` not finite or `r <= -0.9999` or `r > 100`, halve `r` and continue.  
- Else `r ← r - NPV(r)/NPV'(r)`.

**Edge cases:**  
- Mismatched `dates`/`amounts` length → **`null`**.  
- After merging same-date flows, **&lt; 2** distinct dates → **`null`**.  
- No **both** positive and negative amounts → **`null`** (no sign change).  
- Non-convergence after 80 iterations → **`null`**.  
- **`isPvc === true`:** `computeFundPerformanceMetrics` **does not call** XIRR; **`calculated_irr` is always `null`**.  
- **`called <= 0`** (non-PVC): returns **all metrics null** except path not taken for DPI branch (returns full null set).

**Displayed IRR % (quarterly dimension):** `lib/portfolio/assessment-derivation.ts` → `deriveFinancialPerformance` uses **`m.calculated_irr * 100`** rounded to 2 decimals for comparison to `fund.target_irr_pct` (hurdle in **percent points**, e.g. 15 = 15%).

**Verified against tables:** `vc_capital_calls`, `vc_distributions`, `vc_fund_snapshots` (NAV), `vc_portfolio_funds` (`dbj_pro_rata_pct`, `is_pvc`, `target_irr_pct`).

**API orchestration:** `app/api/portfolio/funds/[id]/performance/route.ts` builds `asOf`, `total_called`, `total_distributed`, then metrics (PVC short-circuit vs full XIRR).

**Potential issues:** XIRR uses **Z** noon parsing; obligation due strings elsewhere use local `toDateStr` — minor date-boundary inconsistency across features. Terminal flow omitted if scaled NAV ≤ 0 even when full-fund NAV &gt; 0.

---

### DPI (Distributions to Paid-In)

**File:** `lib/portfolio/fund-performance-metrics.ts`  
**Function:** `computeFundPerformanceMetrics` (primary); also inline in `lib/portfolio/assessment-derivation.ts` `derivePortfolioHealth`

**Formula (canonical):**  
`dpi = distributed / called`  
- **`called`** = sum of `call_amount` for calls **not cancelled**, **as of snapshot date** (`calledThroughDate`).  
- **`distributed`** = sum of `amount` for distributions with `distribution_date <= asOf` (`distributedThroughDate`).

**PVC:** If `isPvc`, still `dpi = distributed / called` when `called > 0`; else `dpi = null`.

**Edge cases:**  
- **`called <= 0`** (non-PVC): DPI is **`null`** (with all other multiples null).  
- **Cancelled calls** excluded from cumulative called in `calledThroughDate` / `buildCashFlowsForXirr`.  
- **Currency:** No FX conversion in `fund-performance-metrics.ts` — **amounts assumed comparable** (same fund currency in DB).

**Secondary DPI (portfolio health heuristic):**  
`lib/portfolio/assessment-derivation.ts` `derivePortfolioHealth`:  
`dpi = called > 0 ? distributed / called : 0` (uses **all** calls’ `call_amount` sum, not `calledThroughDate` vs snapshot — **can differ from snapshot DPI** if calls exist after snapshot).

**Verified against:** `vc_capital_calls`, `vc_distributions`.

---

### TVPI / MOIC (Total Value to Paid-In; MOIC alias)

**File:** `lib/portfolio/fund-performance-metrics.ts`  
**Function:** `computeFundPerformanceMetrics`

**Formulas (non-PVC, `called > 0`):**  
- `navDbj = applyDbjNavShareForMetrics(navFullFund, dbjProRataPct)`  
- **`rvpi = navDbj / called`**  
- **`tvpi = (distributed + navDbj) / called`**  
- **`moic = tvpi`** (explicit assignment in code — **MOIC is TVPI here**, not independent MOIC).

**Edge cases:**  
- PVC or `called <= 0`: **`tvpi` and `moic` are `null`**.  
- **`navDbj`** can be 0 → TVPI = `distributed / called` (DPI-only component if NAV share 0).  
- Full-fund NAV scaled by pro-rata; null/invalid pro-rata → **multiplier 1** (full NAV).

**Verified against:** `vc_fund_snapshots.nav`, `vc_portfolio_funds.dbj_pro_rata_pct`, calls, distributions.

**Potential issues:** “MOIC” in UI may be read as “gross multiple” elsewhere; here it **equals TVPI**.

---

### Deployment % (called vs commitment)

**Locations (different numerators/denominators possible):**

1. **`lib/portfolio/assessment-derivation.ts` — `deriveFinancialPerformance`**  
   - `called = sum(capitalCalls.map(call_amount))` (**all notices, not filtered by snapshot date**).  
   - **`deployedPct = fund.dbj_commitment > 0 ? (called / Number(fund.dbj_commitment)) * 100 : 0`**.

2. **`lib/portfolio/assessment-derivation.ts` — `derivePortfolioHealth`**  
   - Same `called` sum.  
   - **`deployedPct = fund.dbj_commitment > 0 ? (called / Number(fund.dbj_commitment)) * 100 : 0`**.

**Edge cases:**  
- **`dbj_commitment <= 0` or missing:** deployedPct = **0** (no divide-by-zero).  
- **Mismatch risk:** Financial performance **DPI/TVPI** use `computeFundPerformanceMetrics` built from **`calledThroughDate`** / snapshot as-of, while **deployment %** uses **lifetime sum of `call_amount`** on all calls — **not necessarily equal to “called as of snapshot”**.

**Verified against:** `vc_capital_calls`, `vc_portfolio_funds.dbj_commitment`.

---

### Remaining commitment

**A) Capital call notice (running totals)**  
**File:** `lib/portfolio/capital-calls.ts`  
**Function:** `computeRunningForNotice(rows, noticeNumber, callAmount, dbjCommitment)`

**Formula:**  
- Merge existing rows + new notice, sort by `notice_number`.  
- `total_called_to_date` = cumulative sum **through the target notice** (inclusive).  
- **`remaining_commitment = dbjCommitment - total_called_to_date`** (can go **negative** if data bad — **no `Math.max`** here).

**Inputs:** `dbjCommitment` from caller; row `call_amount` values coerced via `num()`.

**B) PCTU report payload (fund vs DBJ)**  
**File:** `lib/portfolio/pctu-report-data.ts` (within narrative/PCTU assembly)

**Fund-level remaining:**  
- `total_drawdown_inception` = portfolio draw + fee drawdowns from **line items** (or **sum of all call amounts** if no items).  
- **`remainingFund = max(0, total_fund_commitment - total_drawdown_inception)`**.

**DBJ-level remaining:**  
- **`dbjRemaining = max(0, dbj_commitment - calledThroughDate(calls, asOfDate))`**.

**Edge cases:** Fund remaining uses **`total_fund_commitment`**; DBJ uses **`dbj_commitment`** and **`calledThroughDate`** — **different semantics**.

**Verified against:** `vc_capital_calls`, `vc_capital_call_items`, `vc_portfolio_funds`.

---

### Compliance score (quarterly assessment dimension)

**File:** `lib/portfolio/assessment-scoring.ts`  
**Function:** `deriveComplianceScore`  
**Helper:** `lib/portfolio/compliance.ts` — `complianceRateByType`

**Formula:**  
For each report type `rt` in  
`['quarterly_financial','quarterly_investment_mgmt','audited_annual','inhouse_quarterly']`:  
- `rate_rt = round(100 * done_rt / count_rt)` where `count_rt` = obligations with that `report_type`, `done_rt` = subset whose status (lowercased) is **`accepted` OR `waived`**. If `count_rt === 0`, **`rate_rt = 0`**.  
- **`deriveComplianceScore = round(100 * (sum of four rates) / 4) / 100`** (average of four percentages; if `rates.length === 0` returns **0** — with four fixed types, length is always 4).

**Governance dimension score:** `deriveComplianceGovernance` sets **dimension score = that same `deriveComplianceScore` result**, but its **per-type “good” count in factors** uses **`submitted`, `under_review`, OR `accepted`** — **stricter “done” in score than in factor labels**.

**Verified against:** `vc_reporting_obligations` (`report_type`, `status`, `due_date`).

**Related (not same formula):** `summarizeCompliance` in `compliance.ts` drives **status taxonomy** (overdue, audit issue, etc.) for badges — different logic.

---

### Quarterly weighted total score

**File:** `lib/portfolio/assessment-scoring.ts`  
**Functions:** `computeEffectiveWeights`, `computeWeightedScore`, `deriveCategory`, `deriveRecommendation`  
**Orchestration:** `lib/portfolio/assessment-derivation.ts` — `deriveAssessment`  
**API:** `app/api/portfolio/funds/[id]/assessments/[assessmentId]/recompute/route.ts`, `.../assessments/route.ts`, PUT `.../assessments/[assessmentId]/route.ts` (manual dimension overrides path)

**Lifecycle stage:**  
`deriveFundLifecycleStage(commitmentDate, assessmentDate, isPvc)`  
- If **`isPvc`:** always **`mid`**.  
- Else years between dates = `(assessment - commitment) / 365.25d`; **&lt;3 → early**, **&lt;6 → mid**, else **late**. Invalid dates → **0 years** → early.

**Effective weights:**  
Start from `vc_assessment_config` numeric columns (`weight_financial_performance`, …).  
- **Early:** `+ lifecycle_early_financial_adj` on financial; `+ lifecycle_early_management_adj` on fund_management.  
- **Late:** `+ lifecycle_late_financial_adj` on financial; `+ lifecycle_late_impact_adj` on development_impact.  
- Renormalize to sum **100** (scale factor `100/sum`; round per dimension; drift fixed on **financial_performance**).

**Weighted total:**  
`computeWeightedScore(scores, weights)`:  
\(\sum_{k \in K} score_k \times (weight_k / 100)\) for `K` = five dimension keys; **any null/NaN dimension → entire result `null`**. Result rounded **`round(total*100)/100`**.

**Category:** Compare `weightedTotal` to `threshold_strong`, `threshold_adequate`, `threshold_watchlist` from config.

**Recommendation:** Maps category to hold/monitor/watchlist/divest; **if category is `divest` and `contractual_obligation` → `freeze`**.

**Edge cases:** If sum of raw weights ≤ 0 after adjustments → **equal weights 20% each**. Override PATCH path recomputes weighted total from possibly hand-edited dimension scores (`app/api/.../assessments/[assessmentId]/route.ts`).

**Verified against:** `vc_assessment_config`, `vc_quarterly_assessments`, dimension columns.

---

### Obligation due dates

**File:** `lib/portfolio/reporting-engine.ts`  
**Functions:** `generateReportingObligations`, `getMonthEnd`, `calculateDueDate`, optional `getQuarterMonths`

**Period end:** `getMonthEnd(year, month)` = last calendar day of that month at **local noon** (`new Date(year, month, 0, 12, 0, 0, 0)`).

**Due date:** `calculateDueDate(periodEnd, dueDays)` → `periodEnd` + **`max(0, floor(dueDays))`** calendar days (local mutation).

**Which obligations:** Iterate `year` from commitment year through horizon end (**end of next calendar year** from “now” in generator). For each `month` in `fund.report_months` (if length 4) else `getQuarterMonths(fund.year_end_month)`:

- Skip if `periodEnd < commitment_date` or `periodEnd > horizonEnd`.  
- **`isYearEnd`** = `(month === fund.year_end_month)`.  
- **Quarterly financial / inv mgmt:** if required and **not** year-end → due uses **`quarterly_report_due_days`**.  
- **In-house quarterly:** if required → same quarterly due days (still uses quarter-end months; **not** skipped on year-end in code).  
- **Audited annual:** if required and **`isYearEnd`** → due uses **`audit_report_due_days`**.

**PVC:** No separate branch — only fund boolean flags matter.

**Output:** `due_date` stored as **`YYYY-MM-DD`** local from `Date` (`toDateStr`).

**Verified against:** `vc_portfolio_funds`, `vc_reporting_obligations`.

**Status aging (related):** `refreshObligationStatuses` in same file — transitions `pending`→`due`, `pending|due`→`outstanding`, `outstanding`→`overdue` after 30 days past due; computes `days_overdue`.

---

### Pipeline assessment score (7 criteria, DD / IC)

**Config:** `lib/scoring/config.ts` — `ASSESSMENT_CRITERIA` weights (sum 100%), `PASS_THRESHOLD = 70`.

**Manual / structured math:**  
**File:** `lib/scoring/calculate.ts`  
- Per section: **`weightedContribution = (sectionTotal / sectionMax) * weightPercent`** if `sectionMax > 0`, else **0**.  
- **`calculateWeightedScore`** = sum of contributions, rounded.  
- **`previewOverallWeighted`:** incomplete subcriteria → section skipped (adds 0).  
- **`determineOutcome`:** bands at **85 / 70 / 55** for approve vs review vs reject messaging (separate from **`PASS_THRESHOLD` 70** for `passed`).

**Persisted recompute:**  
**File:** `lib/scoring/recompute.ts` — `recomputeCriteriaAndAssessment`  
- Sums subcriteria `score` into `raw`; **`weighted_score = criteriaWeightedContribution(raw, sectionMax, criteria_weight)`** unless any sub score null → weighted null.  
- **`overall_score` / `overall_weighted_score`** = sum of criteria **`weighted_score`** when all non-null.

**AI batch path:**  
**File:** `lib/evaluation/run-ai-scoring.ts`  
- Per criterion: Claude returns 1–5; **`weighted = (score / 5) * weightPercent`**.  
- **`overall = round(sum(weighted) * 100) / 100`**.  
- **`passed = overall >= 70`**.  
- Inserts `vc_assessments` with `pass_threshold: 70`.

**Edge cases:** AI parse failure → default score **3** for that criterion. Section max from config; DB constraints allow broader raw ranges per migrations (see DB).

**Verified against:** `vc_assessments`, `vc_assessment_criteria`, `vc_assessment_subcriteria`, questionnaire plaintext.

**Potential issues:** **Two overall concepts:** `determineOutcome` band thresholds vs **`PASS_THRESHOLD`** vs AI path **70** — aligned for “pass” at 70 but **85/55 bands** only in `determineOutcome`.

---

### Watchlist threshold logic

**File:** `lib/portfolio/watchlist-service.ts`  
**Function:** `updateWatchlistAfterApproval`

**Inputs:** `recommendation` string from approved quarterly assessment; `config.watchlist_escalation_quarters`.

**Clear watchlist:** If recommendation ∈ **`{hold, monitor}`** → **delete** `vc_watchlist` row for `(tenant_id, fund_id)`.

**No-op:** If recommendation not in **`{watchlist, freeze, divest}`** and not clear set → return success without DB change.

**Increment:** If watch recommendation:  
- **`nextQuarters = existing.consecutive_quarters + 1`** else **1**.  
- **`escalated = (nextQuarters >= threshold)`** where `threshold = config.watchlist_escalation_quarters`.  
- **`placed_on_watchlist`:** keep first placement date if row exists; else **today** (`YYYY-MM-DD`).  
- **`escalated_at`:** set to now ISO when newly escalated; if already escalated, **keep prior `escalated_at`**.

**Verified against:** `vc_watchlist`, `vc_assessment_config.watchlist_escalation_quarters`, `vc_quarterly_assessments`.

---

## Additional metrics (same directories)

### Performance score (0–100, legacy SME-style)

**File:** `lib/portfolio/scoring.ts`  
**Function:** `computePerformanceScore`  
**Formula:** `repaymentScore(repayment_status) + trendScore(revenue_trend) + trendScore(valuation_trend)`  
- Repayment: current **40**, delinquent **20**, default **0**.  
- Trend: improving **30**, stable **20**, declining **10**; null trend → **0**.  
- Result **`round(total * 100) / 100`**.

**Used by:** `lib/portfolio/flags.ts` (`derivePerformanceBand`, `computeSnapshotAlertFlags`), `lib/portfolio/queries.ts` (enrichment).

**Edge cases:** Null performance score → band logic still uses reporting overdue path.

---

### Distribution summary KPIs (API)

**File:** `app/api/portfolio/distributions/summary/route.ts`

**Per-fund `yield_pct`:**  
`commitment > 0 ? round(1000 * total_amount / commitment) / 10 : 0`  
- **`commitment` = `num(fund.dbj_commitment)`**  
- **`total_amount`** = sum of **all** distribution `amount` for fund (no status filter on distributions in this route).

**Portfolio `avg_yield_pct`:** Among funds with `total_distributions > 0`,  
**`weightedReturnedUsd / weightedCommitmentUsd`** (each converted with **`toUsdEquivalent(..., fund.exchange_rate_jmd_usd ?? 157)`**).

**Edge cases:** Zero commitment → **0** yield, not null.

---

### Divestment summary MOIC (deal-level)

**File:** `lib/portfolio/divestments.ts`  
**Function:** `summarizeDivestments`

**`avg_moic`:**  
- For each row with **`multiple_on_invested_capital != null`** and **`original_investment_amount > 0`**:  
  accumulate **`sum(MOIC_i * invested_i)`** and **`sum(invested_i)`**.  
- **`avg_moic = numerator / denominator`** if denominator &gt; 0 else **0**.

**`total_proceeds_usd`:** Sum `toUsd(proceeds_received, currency)` where **`toUsd` uses hardcoded `157`** for JMD.

**Verified against:** `vc_divestments` (or seed shape), `vc_portfolio_funds` for names.

---

### Obligation overview counts

**File:** `lib/portfolio/fund-obligation-overview.ts`  
**Function:** `computeFundObligationOverview`

**Counts:**  
- `dueSoon` = count `status === 'due'`  
- `overdueC` = `status === 'overdue'`  
- `outC` = `status === 'outstanding'`  
- `acceptedYtd` = `status === 'accepted' && period_year === current calendar year`  
- **`compliancePctByType`:** delegates to **`complianceRateByType`** on **all** rows passed in (no date filter here).

**Verified against:** `vc_reporting_obligations` as loaded by caller.

---

### Deployment by month (legacy table)

**File:** `lib/portfolio/load-portfolio-data.ts`  
**Function:** `loadDeploymentByMonth`

**Formula:** Groups **`vc_disbursements`** with **`status === 'disbursed'`** by `YYYY-MM` from `disbursement_date` (or `updated_at` fallback), sums **`amount_usd`**.

**Note:** Different entity than **capital calls** deployment in quarterly engine.

---

## SQL parity: `get_compliance_summary`

**File:** `supabase/migrations/20260427120000_get_compliance_summary_rpc.sql`  
**Function:** `public.get_compliance_summary(p_tenant_id uuid)`

Aggregates per **active** fund; counts obligations with **`due_date <= CURRENT_DATE`**. **`compliance_status`** CASE tree aligns with JS **`deriveComplianceStatus`** per migration comment (distinct from **`complianceRateByType`** percentages).

---

## Suggested hardening (no code in this doc)

1. **Unify “good obligation”** definition across `complianceRateByType`, `deriveComplianceGovernance` factors, and RPC counts where intended.  
2. **Centralize FX:** Use `exchange_rate_jmd_usd` (fund or tenant) everywhere including **`divestments.toUsd`**.  
3. **Align deployment %** with `calledThroughDate(..., snapshot_date)` when used beside snapshot-based DPI/TVPI.  
4. **Persist computed multiples** on snapshots via trigger/materialized view if reporting must match point-in-time audits.  
5. **Document** that **`moic === tvpi`** in `fund-performance-metrics.ts` vs **deal-level MOIC** in divestments.

---

*End of report.*
