import type { LucideIcon } from "lucide-react";
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileText,
  FolderOpen,
  GraduationCap,
  Home,
  KeyRound,
  LayoutDashboard,
  Library,
  LineChart,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  Plug,
  PlusCircle,
  Route,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import type { Portal } from "@/types/portal";

export interface NavItem {
  label: string;
  /** Compact label for the learner mobile bottom bar. */
  shortLabel?: string;
  href: string;
  icon: LucideIcon;
  /** One-line purpose, shown on placeholder pages until the screen is built. */
  description: string;
  /** TASKS.md ID that builds this screen. Checked by `npm run features`. */
  task: string;
  accent?: "ai" | "primary";
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export interface PortalNav {
  portal: Portal;
  label: string;
  home: string;
  groups: NavGroup[];
  /** Learner only: items for the mobile bottom bar (max 5; last slot is the "More" drawer). */
  mobileBar?: string[];
}

/* ----------------------------- Learner (LearnSphere IA, ADR-007) ----------------------------- */

const learner: PortalNav = {
  portal: "learner",
  label: "Learner",
  home: "/learner",
  groups: [
    {
      label: "Learn",
      items: [
        {
          label: "Dashboard",
          shortLabel: "Home",
          href: "/learner",
          icon: LayoutDashboard,
          description: "Continue learning, today's plan and upcoming work.",
          task: "T-042",
        },
        {
          label: "My Learning",
          shortLabel: "Learn",
          href: "/learner/my-learning",
          icon: BookOpen,
          description: "Your enrolled and completed courses.",
          task: "T-035",
        },
        {
          label: "Learning Paths",
          href: "/learner/paths",
          icon: Route,
          description: "Structured sequences of courses toward a goal.",
          task: "T-080",
        },
        {
          label: "Assessments",
          href: "/learner/assessments",
          icon: ClipboardCheck,
          description: "Quizzes and exams across your courses.",
          task: "T-043",
        },
        {
          label: "Assignments",
          href: "/learner/assignments",
          icon: FileText,
          description: "Submissions, due dates and feedback.",
          task: "T-081",
        },
        {
          label: "Calendar",
          href: "/learner/calendar",
          icon: CalendarDays,
          description: "Deadlines and scheduled sessions.",
          task: "T-082",
        },
        {
          label: "Discussions",
          href: "/learner/discussions",
          icon: MessagesSquare,
          description: "Course discussions and Q&A.",
          task: "T-083",
        },
        {
          label: "Certificates",
          href: "/learner/certificates",
          icon: Award,
          description: "Certificates you have earned, with verification links.",
          task: "T-041",
        },
      ],
    },
    {
      label: "More",
      items: [
        {
          label: "AI Tutor",
          href: "/learner/ai-tutor",
          icon: Sparkles,
          description: "Ask questions grounded in your current course.",
          task: "T-201",
          accent: "ai",
        },
        {
          label: "My Progress",
          shortLabel: "Progress",
          href: "/learner/progress",
          icon: LineChart,
          description: "Progress and skills over time.",
          task: "T-084",
        },
        {
          label: "Notifications",
          href: "/learner/notifications",
          icon: Bell,
          description: "Updates about your courses and deadlines.",
          task: "T-085",
        },
        {
          label: "Settings",
          href: "/learner/settings",
          icon: Settings,
          description: "Your profile, password and notification preferences.",
          task: "T-086",
        },
      ],
    },
  ],
  mobileBar: ["/learner", "/learner/my-learning", "/learner/progress", "/learner/ai-tutor"],
};

/* ----------------------------- Instructor (dark sidebar, ADR-008) ----------------------------- */

const instructor: PortalNav = {
  portal: "instructor",
  label: "Instructor",
  home: "/instructor",
  groups: [
    {
      label: "Teaching",
      items: [
        {
          label: "Overview",
          href: "/instructor",
          icon: LayoutDashboard,
          description: "Your courses, students and pending review items.",
          task: "T-050",
        },
        {
          label: "My Courses",
          href: "/instructor/courses",
          icon: Library,
          description: "All your courses by status.",
          task: "T-050",
        },
        {
          label: "Create Course",
          href: "/instructor/courses/new",
          icon: PlusCircle,
          description: "Guided course creation: basics → curriculum → content → readiness.",
          task: "T-051",
          accent: "primary",
        },
        {
          label: "Assignments",
          href: "/instructor/assignments",
          icon: ClipboardList,
          description: "Create and track assignments across your courses.",
          task: "T-114",
        },
      ],
    },
    {
      label: "Students",
      items: [
        {
          label: "Students",
          href: "/instructor/students",
          icon: Users,
          description: "Learners enrolled in your courses.",
          task: "T-103",
        },
        {
          label: "Grading",
          href: "/instructor/grading",
          icon: ClipboardCheck,
          description: "Grade submitted assignments and give feedback.",
          task: "T-100",
        },
        {
          label: "Discussions",
          href: "/instructor/discussions",
          icon: MessagesSquare,
          description: "Answer questions across your courses.",
          task: "T-105",
        },
        {
          label: "Messages",
          href: "/instructor/messages",
          icon: MessageSquare,
          description: "Direct messages with learners.",
          task: "T-106",
        },
      ],
    },
    {
      label: "Insights",
      items: [
        {
          label: "Analytics",
          href: "/instructor/analytics",
          icon: BarChart3,
          description: "Engagement, completion and drop-off by lesson.",
          task: "T-107",
        },
        {
          label: "Reviews",
          href: "/instructor/reviews",
          icon: Star,
          description: "Learner ratings and feedback.",
          task: "T-109",
        },
        {
          label: "Earnings",
          href: "/instructor/earnings",
          icon: Wallet,
          description: "Revenue and payouts.",
          task: "T-186",
        },
        {
          label: "Certificates",
          href: "/instructor/certificates",
          icon: Award,
          description: "Certificates issued for your courses.",
          task: "T-110",
        },
      ],
    },
    {
      label: "Tools",
      items: [
        {
          label: "Resources",
          href: "/instructor/resources",
          icon: FolderOpen,
          description: "Your reusable media and documents.",
          task: "T-111",
        },
        {
          label: "Question Bank",
          href: "/instructor/question-bank",
          icon: ListChecks,
          description: "Reusable questions you can pull into any assessment.",
          task: "T-101",
        },
        {
          label: "AI Assistant",
          href: "/instructor/ai",
          icon: Sparkles,
          description: "Draft outlines, objectives and quiz questions for review.",
          task: "T-202",
          accent: "ai",
        },
        {
          label: "Settings",
          href: "/instructor/settings",
          icon: Settings,
          description: "Profile and teaching preferences.",
          task: "T-112",
        },
      ],
    },
  ],
};

/* ----------------------------- Admin (operational console, ADR-009) ----------------------------- */

const admin: PortalNav = {
  portal: "admin",
  label: "Admin",
  home: "/admin",
  groups: [
    {
      items: [
        {
          label: "Overview",
          href: "/admin",
          icon: Home,
          description: "Platform health and pending actions.",
          task: "T-071",
        },
      ],
    },
    {
      label: "Users",
      items: [
        {
          label: "Users",
          href: "/admin/users",
          icon: Users,
          description: "Search, invite, suspend and change roles.",
          task: "T-076",
        },
        {
          label: "Roles & Permissions",
          href: "/admin/roles",
          icon: KeyRound,
          description: "Role definitions and the permission matrix.",
          task: "T-133",
        },
        {
          label: "Instructors",
          href: "/admin/instructors",
          icon: UserCog,
          description: "Instructor applications and performance.",
          task: "T-131",
        },
      ],
    },
    {
      label: "Courses",
      items: [
        {
          label: "Courses",
          href: "/admin/courses",
          icon: GraduationCap,
          description: "Catalog management and the review queue.",
          task: "T-072",
        },
      ],
    },
    {
      label: "Learning Operations",
      items: [
        {
          label: "Enrollments",
          href: "/admin/enrollments",
          icon: BookOpen,
          description: "Enrollments and cohorts.",
          task: "T-135",
        },
        {
          label: "Assessments",
          href: "/admin/assessments",
          icon: ClipboardCheck,
          description: "Assessment integrity and attempts.",
          task: "T-136",
        },
        {
          label: "Certificates",
          href: "/admin/certificates",
          icon: Award,
          description: "Issued and revoked certificates.",
          task: "T-137",
        },
      ],
    },
    {
      label: "Commerce",
      items: [
        {
          label: "Commerce",
          href: "/admin/commerce",
          icon: CreditCard,
          description: "Orders, subscriptions, refunds and coupons.",
          task: "T-187",
        },
      ],
    },
    {
      label: "Content",
      items: [
        {
          label: "Content",
          href: "/admin/content",
          icon: FolderOpen,
          description: "Media, documents and SCORM packages.",
          task: "T-138",
        },
        {
          label: "Moderation",
          href: "/admin/moderation",
          icon: ShieldAlert,
          description: "Reported discussions and reviews.",
          task: "T-139",
        },
      ],
    },
    {
      label: "Analytics",
      items: [
        {
          label: "Analytics",
          href: "/admin/analytics",
          icon: BarChart3,
          description: "Enrollments, completions and revenue.",
          task: "T-077",
        },
      ],
    },
    {
      label: "Communication",
      items: [
        {
          label: "Notifications",
          href: "/admin/notifications",
          icon: Bell,
          description: "Announcements and email templates.",
          task: "T-141",
        },
      ],
    },
    {
      label: "AI",
      items: [
        {
          label: "AI Management",
          href: "/admin/ai",
          icon: Bot,
          description: "Policies, usage and cost.",
          task: "T-204",
          accent: "ai",
        },
        {
          label: "Knowledge Base",
          href: "/admin/rag",
          icon: Library,
          description: "RAG documents and indexing status.",
          task: "T-223",
        },
      ],
    },
    {
      label: "Organizations",
      items: [
        {
          label: "Organizations",
          href: "/admin/organizations",
          icon: Building2,
          description: "Tenants, members and scoped admins.",
          task: "T-161",
        },
      ],
    },
    {
      label: "System",
      items: [
        {
          label: "Audit Logs",
          href: "/admin/audit",
          icon: ScrollText,
          description: "Append-only history of privileged actions.",
          task: "T-078",
        },
        {
          label: "Integrations",
          href: "/admin/integrations",
          icon: Plug,
          description: "API keys and third-party connections.",
          task: "T-142",
        },
        {
          label: "Settings",
          href: "/admin/settings",
          icon: Settings,
          description: "Platform and security settings.",
          task: "T-143",
        },
      ],
    },
  ],
};

/* ----------------------------- Org Admin (scoped, own organization only, T-162) ---------------- */

const org_admin: PortalNav = {
  portal: "org_admin",
  label: "Org Admin",
  home: "/org_admin",
  groups: [
    {
      items: [
        {
          label: "My Organization",
          href: "/org_admin",
          icon: Building2,
          description: "Members, teams and learning hours for your organization.",
          task: "T-162",
        },
      ],
    },
  ],
};

export const NAVIGATION: Record<Portal, PortalNav> = { learner, instructor, admin, org_admin };

export function allNavItems(portal: Portal): NavItem[] {
  return NAVIGATION[portal].groups.flatMap((g) => g.items);
}

export function findNavItem(portal: Portal, href: string): NavItem | undefined {
  return allNavItems(portal).find((i) => i.href === href);
}

/**
 * The href of the single nav item that should be marked active for a pathname:
 * the longest item href that equals or prefixes the path. The portal home only matches exactly.
 * (So /instructor/courses/new activates "Create Course", not also "My Courses".)
 */
export function activeNavHref(portal: Portal, pathname: string): string | undefined {
  const { home } = NAVIGATION[portal];
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let best: string | undefined;
  for (const { href } of allNavItems(portal)) {
    const matches = href === home ? path === home : path === href || path.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.length)) best = href;
  }
  return best;
}
