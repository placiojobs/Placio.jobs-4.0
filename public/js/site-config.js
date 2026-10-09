/**
 * PLACIO — CENTRAL CONFIGURATION  (the one file to edit for content changes)
 *
 *  Add / rename / reorder a DEPARTMENT ....... edit MAJOR_DEPARTMENTS
 *  Add a CITY or a spelling variant .......... edit MAJOR_LOCATIONS / LOCATION_ALIASES
 *  Job types, experience chips ............... JOB_TYPES / EXPERIENCE_TOKENS
 *  Homepage shortcuts & matrices ............. QUICK_ACCESS / FRESHER_MATRIX_* / DEPT_CITY_MATRIX
 *  Navigation, footer links, labels .......... NAV_LINKS / FOOTER_LINKS / SORT_OPTIONS / REPORT_REASONS
 *  Contact details, site URL ................. SITE
 *  Firebase web config (public by design) .... FIREBASE_CONFIG
 *  Analytics (off unless an ID is set) ....... ANALYTICS
 *  Colours & fonts ........................... css/style.css  (the :root block at the top)
 *
 * Everything else in the app reads from here; nothing else hard-codes these lists.
 */

export const SITE = {
  name: "Placio",
  url: "https://placio.co.in",
  email: "placio.jobs@gmail.com",
  instagramUrl: "https://instagram.com/placio.co.in",
  instagramHandle: "@placio.co.in",
  defaultTitle: "Placio — Career Platform for Students & Freshers",
  defaultDescription: "Find jobs, internships and fresher opportunities across India on Placio.",
};

/** Web config of the Firebase project. These values are public by design (they identify the project;
 *  security comes from firestore.rules / storage.rules, never from hiding this). */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBPMruzfoeVNAlnPA-F4L-lEwKLoEnLnks",
  authDomain: "placio4.firebaseapp.com",
  projectId: "placio4",
  storageBucket: "placio4.firebasestorage.app",
  messagingSenderId: "240427293193",
  appId: "1:240427293193:web:997eb7d9024b355edbb6d8",
};

/** Optional analytics. Leave gaId empty = NO analytics script is ever loaded and no consent banner is needed. */
export const ANALYTICS = { gaId: "" };

/** Browse Jobs: results shown per "Load more" step. */
export const PAGE_SIZE = 50;

export const FEATURES = {
  /** Publish the job index as ONE gzipped file in Firebase Storage (CDN-cacheable, no per-document Firestore reads).
   *  Needs the Blaze (pay-as-you-go) plan, because Firebase only creates a Storage bucket on Blaze.
   *  FALSE = Spark/free plan: the index is stored as a few Firestore documents instead (~4 reads per new visitor,
   *  cached afterwards). Switch to true only after upgrading and enabling Storage, then publish again. */
  indexInStorage: false,
};

export const ADMIN = { idleTimeoutMs: 30 * 60 * 1000, idleWarningMs: 2 * 60 * 1000, maxExcelBytes: 25 * 1024 * 1024, maxExcelRows: 60000 };

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/jobs", label: "Browse Jobs" },
  { href: "/saved-jobs", label: "Saved Jobs" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export const FOOTER_LINKS = {
  platform: [
    { href: "/jobs", label: "Browse Jobs" },
    { href: "/saved-jobs", label: "Saved Jobs" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ],
  legal: [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Use" },
    { href: "/cookies", label: "Cookie Policy" },
  ],
};

export const SORT_OPTIONS = [
  { value: "latest", label: "Latest" },
  { value: "companyAsc", label: "Company A–Z" },
  { value: "companyDesc", label: "Company Z–A" },
  { value: "locationAsc", label: "Location A–Z" },
];

export const REPORT_REASONS = ["Incorrect information", "Broken application link", "Job no longer available", "Duplicate job", "Other"];

/** Department × City matrix on the homepage: derived from real job counts, never hard-coded combinations. */
export const DEPT_CITY_MATRIX = { maxDepartments: 10, maxCities: 8, excludeDepartments: ["Other"], excludeCities: ["Other", "Remote"] };
export const MAJOR_DEPARTMENTS = [
  "Accounting", "Administration", "Analyst", "Analyst-Data", "Apprentice",
  "Architect", "Audit", "Biotech", "Business Analyst", "Call Center-Analyst",
  "Call Center-Associate", "Call Center-Senior Associate", "Chartered Accountant",
  "Company Secretary", "Construction/Infra PM", "Consulting",
  "Control-M Consultant / Architect", "Corporate Communications & PR",
  "Corporate Strategy", "Customer Care", "Customer Support", "Cyber Security",
  "Data Analyst", "Data Scientist", "Director", "Embedded",
  "Engineer-Automation", "Engineer-Design/Product", "Engineer-Electrical",
  "Engineer-Industrial", "Engineer-Instrumentation", "Engineer-Mechanical",
  "Engineer-Power Electronics", "Engineer-Telecom", "Engineer-Validation",
  "Engineering", "Finance", "Finance-Accounts",
  "Finance-Financial Planning & Analysis", "Finance-Taxation",
  "Finance-Treasury", "Financial Analyst", "Forging & Machining", "Fresher",
  "Fresher-Chemical", "Fresher-Civil", "Fresher-Electrical",
  "Fresher-Electronics", "Fresher-Finance", "Fresher-Graduate", "Fresher-IT",
  "Fresher-MBA", "Fresher-Mechanical", "Fresher-Software", "Healthcare",
  "HSEF", "Human Resources", "Internal Audit", "IT", "IT Project Management",
  "IT Service Desk/Support", "Legal", "Maintenance",
  "Manager-Software Engineering", "Manufacturing", "Market Research Analyst",
  "Marketing", "Marketing-Digital Platforms", "Networking", "Operations",
  "Operations Manager", "Pharmaceuticals", "Plant Manager", "PMO", "Power BI",
  "Process Engineering", "Procurement", "Product", "Product Planning",
  "Production", "Program Manager-Software", "Project Manager",
  "Project Manager-Agile/Scrum Master", "Quality Assurance", "Quality Control",
  "Quality/QA-QC", "Research and Development", "Sales",
  "Sales-Area Sales Manager", "Sales-Business Developement", "Sales-Channel",
  "Sales-Corporate Accounts", "Sales-Key Account Management", "Sales-Retail",
  "Sales-Territory Business Manager", "SAP", "SAP-ABAP", "SAP-API",
  "SAP-B4HANA", "SAP-ERP/CRM", "SAP-FICO", "SAP-Finance", "SAP-PI/PO",
  "SAP-S/4HANA", "SAP-Security", "SCM", "SCM-Demand Planning",
  "SCM-Logistics/Transportation", "SCM-Vendor Management",
  "SCM-Warehouse/Inventory", "Security", "Social Listening & Insights",
  "Software", "Software-.NET", "Software-AI/ML", "Software-Android",
  "Software-Angular", "Software-Application", "Software-Architect",
  "Software-Backend", "Software-Cloud", "Software-CRM", "Software-D365",
  "Software-Data", "Software-DevOps", "Software-Dot Net", "Software-Embedded",
  "Software-Frontend", "Software-Full Stack", "Software-Golang",
  "Software-Java", "Software-Kubernetes", "Software-Linux", "Software-Oracle",
  "Software-Python", "Software-QA/Testing", "Software-React", "Software-Rust",
  "Software-Salesforce", "Software-Site Reliability Engineering",
  "Software-Snowflake", "Software-SQL", "Software-Testing",
  "Software-UI/UX Design", "Support Engineer", "Training Development",
  "Treasury", "Workday Analyst", "Other",
];

export const MAJOR_LOCATIONS = [
  "Ahmedabad", "Bengaluru", "Chennai", "Delhi", "Noida", "Gurgaon",
  "Hyderabad", "Kolkata", "Mumbai", "Pune",
  "Agra", "Amritsar", "Chandigarh", "Jaipur", "Kanpur", "Lucknow",
  "Srinagar", "Varanasi",
  "Bhopal", "Indore", "Nagpur", "Nashik", "Raipur", "Surat", "Vadodara",
  "Sambhajinagar",
  "Coimbatore", "Kochi", "Madurai", "Mysuru", "Thiruvananthapuram",
  "Vijayawada", "Visakhapatnam",
  "Bhubaneswar", "Guwahati", "Jamshedpur", "Patna", "Ranchi",
  "Remote", "Other",
];

/**
 * Location spelling variants that must resolve to the SAME canonical
 * location (PROMPT 2, §14) without merging genuinely different cities.
 * Key = variant (lowercased), value = canonical entry in MAJOR_LOCATIONS.
 */
export const LOCATION_ALIASES = {
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  gurugram: "Gurgaon",
  gurgaon: "Gurgaon",
  "new delhi": "Delhi",
  delhi: "Delhi",
  "delhi ncr": "Delhi",
  bombay: "Mumbai",
  mumbai: "Mumbai",
  poona: "Pune",
  pune: "Pune",
  calcutta: "Kolkata",
  kolkata: "Kolkata",
  madras: "Chennai",
  chennai: "Chennai",
  trivandrum: "Thiruvananthapuram",
  thiruvananthapuram: "Thiruvananthapuram",
  mysore: "Mysuru",
  mysuru: "Mysuru",
  vizag: "Visakhapatnam",
  visakhapatnam: "Visakhapatnam",
  aurangabad: "Sambhajinagar",
  sambhajinagar: "Sambhajinagar",
  wfh: "Remote",
  "work from home": "Remote",
  remote: "Remote",
};

/**
 * Experience filter tokens exposed in the UI — ported verbatim from the old
 * EXPERIENCE_FILTERS (Fresher, then 1..30). Actual range matching against a
 * job's stored exp string happens in lib/experience.ts, not here.
 */
export const EXPERIENCE_TOKENS = [
  "Fresher",
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
];

export const JOB_TYPES = ["WFO", "Hybrid", "Remote"];

/** Homepage Quick Access shortcuts (PROMPT 1 §27 / PROMPT 2 §38). Each maps
 * to a real dept-filter value, not a hardcoded static page. */
export const QUICK_ACCESS = [
  { label: "Fresher", icon: "◻", dept: ["Fresher"] },
  { label: "Software", icon: "⌨", dept: ["Software", "Fresher-Software"] },
  { label: "Engineering", icon: "◉", dept: ["Engineering"] },
  { label: "Data & AI", icon: "◎", dept: ["Data Analyst", "Data Scientist", "Software-AI/ML"] },
  { label: "Finance", icon: "◈", dept: ["Finance", "Fresher-Finance"] },
  { label: "Marketing", icon: "▣", dept: ["Marketing"] },
  { label: "Internships", icon: "◫", dept: ["Apprentice"] },
  { label: "Work From Home", icon: "🌐", location: ["Remote"] },
];

/** Fresher Matrix rows (PROMPT 1 §28 / PROMPT 2 §39) — dept values that exist
 * in MAJOR_DEPARTMENTS above. Columns are the major-city subset of
 * MAJOR_LOCATIONS defined in FRESHER_MATRIX_CITIES. */
export const FRESHER_MATRIX_DEPARTMENTS = [
  "Fresher-Software",
  "Fresher-IT",
  "Fresher-Mechanical",
  "Fresher-Electrical",
  "Fresher-Electronics",
  "Fresher-Civil",
  "Fresher-Finance",
  "Fresher-MBA",
  "Fresher-Graduate",
  "Fresher-Chemical",
];

export const FRESHER_MATRIX_CITIES = [
  "Bengaluru", "Mumbai", "Pune", "Delhi", "Noida", "Gurgaon", "Hyderabad", "Chennai",
];

/** Popular search terms shown on the homepage (PROMPT 2 §32) — curated, not
 * expensive analytics. Revisit periodically with real search-volume data
 * once the analytics counters described in PROMPT 2 §71 are wired up. */
export const POPULAR_SEARCHES = [
  "Software", "Engineering", "Data Science", "Fresher", "Bengaluru", "Pune", "Internship", "Remote",
];

