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
export const ANALYTICS = { gaId: "G-SBMSLDDXC8" };

/** Browse Jobs: results shown per "Load more" step. */
export const PAGE_SIZE = 50;

export const FEATURES = {
  /** Publish the job index as ONE gzipped file in Firebase Storage (CDN-cacheable, no per-document Firestore reads).
   *  Needs the Blaze (pay-as-you-go) plan, because Firebase only creates a Storage bucket on Blaze.
   *  FALSE = Spark/free plan: the index is stored as a few Firestore documents instead (~4 reads per new visitor,
   *  cached afterwards). Switch to true only after upgrading and enabling Storage, then publish again. */
  indexInStorage: false,
  /** Read meta, the job index and each job from plain files in /data (made by the admin "Download website data" button and
   *  committed with the site): 0 Firestore reads for visitors. Missing files fall back to Firestore automatically.
   *  Set to false to go back to the previous behaviour instantly. */
  staticData: true,
};

export const ADMIN = { idleTimeoutMs: 30 * 60 * 1000, idleWarningMs: 2 * 60 * 1000, maxExcelBytes: 25 * 1024 * 1024, maxExcelRows: 60000 };

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/jobs", label: "Browse Jobs" },
  { href: "/departments/software-it", match: "/departments", label: "Departments" }, // opens the biggest department; the strip at the top switches
  { href: "/saved-jobs", label: "Saved Jobs" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export const FOOTER_LINKS = {
  platform: [
    { href: "/jobs", label: "Browse Jobs" },
    { href: "/departments/software-it", label: "Departments" },
    { href: "/saved-jobs", label: "Saved Jobs" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ],
  legal: [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Use" },
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

/** Main department pages (/departments/<slug>). Built from the "Departments" sheet (Group column) of Job_Tracker.xlsx.
 * `depts` must match job department names exactly. To add a department to a page, add its name here. The numbers
 * on each page are computed by the admin at publish time (see computeDeptPages in jobIndex.js). */
export const DEPARTMENT_PAGES = [
  {
    "slug": "software-it",
    "title": "Software & IT",
    "blurb": "Developers, DevOps, cloud, support and SAP or Oracle roles across India’s tech hubs.",
    "depts": [
      "Software-Golang",
      "Software-Android",
      "Program Manager-Software",
      "Software-Cloud",
      "Software-DevOps",
      "Software-Embedded",
      "Software-Flutter",
      "Software-Frontend",
      "Software-Full Stack",
      "Software-Python",
      "Software-React",
      "Software-Site Reliability Engineering",
      "Networking",
      "Software-Java",
      "Manager-Software Engineering",
      "Software-UI/UX Design",
      "Software-QA/Testing",
      "IT Project Management",
      "IT Service Desk/Support",
      "Support Engineer",
      "Software-Kubernetes",
      "Software-Rust",
      "Software-Linux",
      "Software-Angular",
      "Software-Boomi",
      "Technical Writer",
      "Networking-NOC",
      "Software-C++",
      "Software-Salesforce Development",
      "IT & Security-Infrastructure",
      "Software-Legacy/Platform Development",
      "Software-Integration/RPA",
      "Software-Developer Relations",
      "Cyber Security",
      "Software-Oracle",
      "Software-D365",
      "Workday Analyst",
      "Control-M Consultant / Architect",
      "SAP-Security",
      "SAP-ABAP",
      "SAP-FICO",
      "SAP-S/4HANA",
      "SAP-ERP/CRM",
      "SAP-API",
      "SAP-B4HANA",
      "SAP-PI/PO",
      "Software-Pega Developer",
      "Software-Camunda 8 Developer",
      "Software-Servicenow",
      "Oracle BRM",
      "Software-.NET",
      "Software-Backend",
      "Software-CRM",
      "Architect"
    ]
  },
  {
    "slug": "freshers",
    "title": "Freshers",
    "blurb": "Entry-level roles for graduates and final-year students, by stream and city.",
    "depts": [
      "Fresher-MBA",
      "Fresher-Mechanical",
      "Fresher-Civil",
      "Fresher-Electrical",
      "Fresher-Software",
      "Fresher-Finance",
      "Fresher-Chemical",
      "Fresher-IT",
      "Fresher-Sales",
      "Fresher-MBA-HR",
      "Fresher-MBA-Finance",
      "Fresher-MBA-Marketting",
      "Fresher-MBA-Operations",
      "Fresher-Graduate",
      "Fresher-Customer Care",
      "Fresher-Back-Office Operations",
      "Fresher-Pharma",
      "Fresher-Electronics",
      "Apprentice"
    ]
  },
  {
    "slug": "data-analytics",
    "title": "Data & Analytics",
    "blurb": "AI/ML, data engineering, data science and analytics roles.",
    "depts": [
      "Software-AI/ML",
      "Software-Data",
      "Data Scientist",
      "Power BI",
      "Analyst-Data",
      "Data Analyst",
      "Market Research Analyst",
      "Social Listening & Insights",
      "Software-Snowflake",
      "Software-SQL",
      "Data & Analysis-Governance"
    ]
  },
  {
    "slug": "engineering",
    "title": "Engineering",
    "blurb": "Mechanical, electrical, civil, automation, VLSI and plant or quality roles.",
    "depts": [
      "Design-CAD",
      "Engineer-Mechanical",
      "Engineer-Civil",
      "Engineer-Electrical",
      "Engineer-Chemical",
      "Engineer-Maintenance",
      "Research and Development",
      "Engineer-Design/Product",
      "Engineer-Automation",
      "Engineer-Power Electronics",
      "Engineer-Instrumentation",
      "Manager Facilities Engineering",
      "Project Engineer",
      "Service Engineer",
      "Manager-Service",
      "Engineering-Oil & Gas",
      "Engineering-Fire & Security Systems",
      "Telecom Operations",
      "VLSI/Semiconductor",
      "HSEF",
      "Production",
      "Process Engineering",
      "Forging & Machining",
      "Quality Assurance",
      "Quality Control",
      "Product Planning",
      "Manufacturing",
      "Engineer-Industrial",
      "Engineer-Telecom",
      "Engineer-Validation",
      "Maintenance",
      "Plant Manager",
      "Construction/Infra PM",
      "Engineering-CAD"
    ]
  },
  {
    "slug": "finance-accounting",
    "title": "Finance & Accounting",
    "blurb": "Accounts, FP&A, audit, risk and chartered accountant roles.",
    "depts": [
      "Chartered Accountant",
      "Finance-Treasury",
      "Finance-Taxation",
      "Finance-Financial Planning & Analysis",
      "Finance-Accounts",
      "Financial Analyst",
      "Finance-Governance & Risk",
      "Company Secretary"
    ]
  },
  {
    "slug": "sales-marketing",
    "title": "Sales & Marketing",
    "blurb": "Business development, account management, revenue operations and marketing roles.",
    "depts": [
      "Sales-Retail",
      "Sales-Key Account Management",
      "Sales-Business Developement",
      "Corporate Communications & PR",
      "Sales-Channel",
      "Sales-Area Sales Manager",
      "Sales-Regional Sales Manager",
      "Presales",
      "Technical Account Manager",
      "Commercial-Revenue Operations",
      "Marketing-Digital & Media",
      "Marketing-Brand Management",
      "Marketing-Content & Copywriting",
      "Marketing-SEO & Performance",
      "Marketing-Social Media",
      "Marketing-Product & Research",
      "Design-Creative",
      "Sales-Account Management",
      "Sales-Territory Business Manager"
    ]
  },
  {
    "slug": "management-strategy",
    "title": "Management & Strategy",
    "blurb": "Business analysts, project and product managers, PMO, strategy and consulting roles.",
    "depts": [
      "Business Analyst",
      "Project Manager",
      "Corporate Strategy",
      "Project Manager-Agile/Scrum Master",
      "PMO",
      "Operations Manager",
      "Product Manager",
      "Management-Consulting/Transformation"
    ]
  },
  {
    "slug": "supply-chain-procurement",
    "title": "Supply Chain & Procurement",
    "blurb": "Procurement, logistics, warehouse, vendor management and planning roles.",
    "depts": [
      "Procurement",
      "SCM-Vendor Management",
      "SCM-Logistics/Transportation",
      "SCM-Warehouse/Inventory",
      "SCM-Demand & Supply Planning",
      "SCM-Import Export & Customs"
    ]
  }
];

/** Smaller groups: shown as plain links on /departments (no page of their own yet). */
export const DEPARTMENT_MORE = [
  {
    "slug": null,
    "title": "Human Resources",
    "depts": [
      "Human Resources",
      "Human Resources-Talent Acquisition",
      "Human Resources-Payroll",
      "Human Resources-L&D",
      "HR-Compliance & Mobility",
      "Training Development"
    ]
  },
  {
    "slug": null,
    "title": "Legal, Corporate & Admin",
    "depts": [
      "Legal",
      "Administration & Facilities"
    ]
  },
  {
    "slug": null,
    "title": "Risk & Compliance",
    "depts": [
      "Internal Audit",
      "Compliance & Risk Testing",
      "Investment Compliance"
    ]
  },
  {
    "slug": null,
    "title": "Customer Service",
    "depts": [
      "Customer Care",
      "Call Center-Analyst",
      "Call Center-Senior Associate",
      "Call Center-Associate",
      "Customer Care-Leadership",
      "CSR",
      "Customer Support",
      "Customer Success"
    ]
  },
  {
    "slug": null,
    "title": "Banking & Fund Operations",
    "depts": [
      "Fund Servicing",
      "Alternative Fund Services",
      "Trade Lifecycle Management",
      "Trading Support Services",
      "Reference Data Management",
      "Client Data Management",
      "Payments Operations",
      "Loan Servicing",
      "Investment Management Operations",
      "Banking Operations (General)",
      "Investment Performance Analysis",
      "Banking-Branch Manager/Head",
      "Banking-Relationship Manager",
      "Loan Officer",
      "Insurance"
    ]
  },
  {
    "slug": null,
    "title": "Pharma & Life Sciences",
    "depts": [
      "Statistical Programming",
      "Pharmacovigilance",
      "Medical Writing",
      "Regulatory Affairs",
      "Medical Affairs",
      "Clinical Operations"
    ]
  }
];

/** Optional: group a long department's specialisations into labelled sections on its page (key = page slug).
 *  Any specialisation not listed here still shows, in an automatic "Other" section. */
export const DEPARTMENT_GROUPS = {
  "software-it": [
    { title: "Languages and frameworks", depts: ["Software-Python", "Software-Java", "Software-.NET", "Software-Golang", "Software-C++", "Software-Rust", "Software-Angular", "Software-React", "Software-Frontend", "Software-Backend", "Software-Full Stack", "Software-Flutter", "Software-Android"] },
    { title: "Cloud, DevOps and infrastructure", depts: ["Software-Cloud", "Software-DevOps", "Software-Kubernetes", "Software-Linux", "Software-Site Reliability Engineering", "Networking", "Networking-NOC", "IT & Security-Infrastructure", "Cyber Security"] },
    { title: "SAP and Oracle", depts: ["SAP-ABAP", "SAP-FICO", "SAP-S/4HANA", "SAP-ERP/CRM", "SAP-API", "SAP-B4HANA", "SAP-PI/PO", "SAP-Security", "Software-Oracle", "Oracle BRM"] },
    { title: "Enterprise platforms", depts: ["Software-Salesforce Development", "Software-Servicenow", "Workday Analyst", "Software-Pega Developer", "Software-Camunda 8 Developer", "Software-Boomi", "Control-M Consultant / Architect", "Software-D365", "Software-Integration/RPA", "Software-CRM", "Software-Legacy/Platform Development"] },
    { title: "Testing, design and writing", depts: ["Software-QA/Testing", "Software-UI/UX Design", "Technical Writer"] },
    { title: "Management and support", depts: ["IT Project Management", "IT Service Desk/Support", "Support Engineer", "Program Manager-Software", "Manager-Software Engineering", "Software-Developer Relations", "Architect", "Software-Embedded"] },
  ],
};

export const DEPT_PAGE_LIMITS = { maxSubs: 12, maxCities: 6, excludeCities: ["Other", "Remote"] };
export const MAJOR_DEPARTMENTS = [
  "Analyst-Data", "Apprentice",
  "Architect", "Business Analyst", "Call Center-Analyst",
  "Call Center-Associate", "Call Center-Senior Associate", "Chartered Accountant",
  "Company Secretary", "Construction/Infra PM", 
  "Control-M Consultant / Architect", "Corporate Communications & PR",
  "Corporate Strategy", "Customer Care", "Customer Support", "Cyber Security",
  "Data Analyst", "Data Scientist", 
  "Engineer-Automation", "Engineer-Design/Product", "Engineer-Electrical",
  "Engineer-Industrial", "Engineer-Instrumentation", "Engineer-Mechanical",
  "Engineer-Power Electronics", "Engineer-Telecom", "Engineer-Validation",
  "Finance-Accounts",
  "Finance-Financial Planning & Analysis", "Finance-Taxation",
  "Finance-Treasury", "Financial Analyst", "Forging & Machining",
  "Fresher-Chemical", "Fresher-Civil", "Fresher-Electrical",
  "Fresher-Electronics", "Fresher-Finance", "Fresher-Graduate", "Fresher-IT",
  "Fresher-MBA", "Fresher-Mechanical", "Fresher-Software", 
  "HSEF", "Human Resources", "Internal Audit", "IT Project Management",
  "IT Service Desk/Support", "Legal", "Maintenance",
  "Manager-Software Engineering", "Manufacturing", "Market Research Analyst",
  "Networking", 
  "Operations Manager", "Plant Manager", "PMO", "Power BI",
  "Process Engineering", "Procurement", "Product Planning",
  "Production", "Program Manager-Software", "Project Manager",
  "Project Manager-Agile/Scrum Master", "Quality Assurance", "Quality Control",
  "Research and Development", 
  "Sales-Area Sales Manager", "Sales-Business Developement", "Sales-Channel",
  "Sales-Key Account Management", "Sales-Retail",
  "Sales-Territory Business Manager", "SAP-ABAP", "SAP-API",
  "SAP-B4HANA", "SAP-ERP/CRM", "SAP-FICO", "SAP-PI/PO",
  "SAP-S/4HANA", "SAP-Security", "SCM-Demand & Supply Planning", "SCM-Import Export & Customs",
  "SCM-Logistics/Transportation", "SCM-Vendor Management",
  "SCM-Warehouse/Inventory", "Social Listening & Insights",
  "Software-.NET", "Software-AI/ML", "Software-Android",
  "Software-Angular", 
  "Software-Backend", "Software-Cloud", "Software-CRM", "Software-D365",
  "Software-Data", "Software-DevOps", "Software-Embedded",
  "Software-Frontend", "Software-Full Stack", "Software-Golang",
  "Software-Java", "Software-Kubernetes", "Software-Linux", "Software-Oracle",
  "Software-Python", "Software-QA/Testing", "Software-React", "Software-Rust",
  "Software-Site Reliability Engineering",
  "Software-Snowflake", "Software-SQL", 
  "Software-UI/UX Design", "Support Engineer", "Training Development",
  "Workday Analyst", "Software-Servicenow", "Engineer-Civil","Engineer-Maintenance",
  "Design-CAD","Presales","Finance-Governance & Risk","Customer Success","Other", "VLSI/Semiconductor",
  "Management-Consulting/Transformation",
  "Product Manager",
  "Software-C++",
  "Commercial-Revenue Operations",
  "Software-Integration/RPA",
  "Compliance & Risk Testing",
  "IT & Security-Infrastructure",
  "Service Engineer",
  "Human Resources-Talent Acquisition",
  "Software-Salesforce Development",
  "Data & Analysis-Governance",
  
  "Software-Developer Relations",
  "Human Resources-L&D",
  "Alternative Fund Services",
  "Marketing-Digital & Media", "Marketing-Brand Management", "Marketing-Content & Copywriting", "Marketing-SEO & Performance", "Marketing-Social Media", "Marketing-Product & Research", "Engineering-CAD",
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
  { label: "Freshers", icon: "◻", dept: ["Fresher"] },
  { label: "Remote Jobs", icon: "🌐", location: ["Remote"] },
  { label: "Software & IT", icon: "⌨", dept: ["Software", "Fresher-Software"] },
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

