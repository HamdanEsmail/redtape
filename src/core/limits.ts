// Every limit and price in the product. Nothing else hard-codes one.

// --- What a comparison asks for ------------------------------------------------------------------

/** The activity: at most this many characters. */
export const ACTIVITY_MAX_CHARS = 200;
/** Each place: at most this many characters. */
export const PLACE_MAX_CHARS = 80;
/** Exactly this many places in one comparison. */
export const PLACE_COUNT = 3;
/** Categories the research must return: fewer or more than this range fails the comparison. */
export const CATEGORIES_MIN = 4;
export const CATEGORIES_MAX = 12;

// --- How a comparison runs -----------------------------------------------------------------------

/** One comparison runs a TinyResearch at a time; a holder of the run slot older than this no
 *  longer blocks the queue (a run takes 5 to 20 minutes; 25 minutes without an end fails it). */
export const RUN_SLOT_STALE_MINUTES = 35;
/** A comparison still researching after this long is failed: "TinyResearch took too long". */
export const RESEARCH_TIMEOUT_MINUTES = 25;
/** Preferred official hosts kept per place from the finding search. */
export const SITES_PER_PLACE = 6;
/** A finding step claimed and not finished in this time can be claimed again. */
export const FIND_CLAIM_STALE_MINUTES = 5;
/** The research run is read at most this often. */
export const RESEARCH_POLL_EVERY_SECONDS = 55;
/** Official pages one `advance` call reads at most. */
export const CHECKS_PER_ADVANCE = 4;
/** Fee-lead searches kept per comparison, for items whose fee is not stated. */
export const FEE_LEADS_PER_COMPARISON = 6;
/** Fee-lead searches one `advance` call runs at most. */
export const FEE_LEADS_PER_ADVANCE = 4;
/** An item claimed for checking and not finished in this time can be claimed again. */
export const CHECK_CLAIM_STALE_MINUTES = 2;
/** An official page is waited for this long at most. */
export const READ_TIMEOUT_MS = 15_000;
/** A page read that failed for a passing reason is tried again, up to this many reads in all. */
export const READ_ATTEMPTS = 3;
export const READ_RETRY_AFTER_SECONDS = 30;
/** One `advance` call starts no new page read after this long. */
export const ADVANCE_BUDGET_MS = 12_000;

// --- Keeping and reusing -------------------------------------------------------------------------

/** The same activity and the same three places (order ignored) within this many days opens the
 *  stored comparison. */
export const REUSE_DAYS = 7;
/** A visitor's comparison is kept this many days, then deleted with its items. Saved demos stay. */
export const PUBLIC_TTL_DAYS = 7;

// --- Public limits -------------------------------------------------------------------------------

/** New public comparisons a UTC day, across every visitor. */
export const PUBLIC_COMPARISONS_PER_DAY = 2;
/** New public comparisons a UTC day, per visitor. */
export const PUBLIC_COMPARISONS_PER_VISITOR_PER_DAY = 1;

// --- Money ---------------------------------------------------------------------------------------

/** What a new comparison is budgeted at until its run ends and the wallet says what it cost. A
 *  TinyResearch run costs $2 after the account's 2 free runs of the UTC day. */
export const RESEARCH_BUDGET_USD = 2;
/** All paid work stops when the ledger, plus the budget of every unsettled run, reaches this. */
export const SPEND_STOP_USD = 8;
/** Part of a run can be billed after it ends. The wallet is read again this long after the run's
 *  cost was booked, and the booked cost corrected once. */
export const SETTLE_AFTER_MINUTES = 10;

/** US dollars per unit, by ledger kind. */
export const PRICES = {
  /** A TinyResearch API call (start, read). The run's cost is booked when it ends. */
  research: 0,
  /** A TinyResearch run at the rate card: the cost of a paid run when the wallet cannot say it. */
  research_run: 2,
  fetch: 0,
  search: 0,
  wallet: 0,
} as const;
