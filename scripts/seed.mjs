#!/usr/bin/env node
/**
 * Dev seed data — FIXTURES ONLY (ADR-023, F-903).
 *
 *   npm run seed
 *
 * Creates demo categories, instructors, published courses (sections + lessons) and one demo
 * learner against the Supabase project in .env.local, using the service-role key.
 * Idempotent: anything that already exists (matched by slug / email) is left alone.
 * Nothing under src/ may import this file (enforced by tests/unit/seed-isolation.test.ts).
 *
 * Demo logins (dev only):  seed-instructor@example.com / seed-learner@example.com / seed-admin@example.com / seed-superadmin@example.com
 * Password for both:       seed-password-1
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// CI has no .env.local: the local Supabase stack's URL and keys arrive as environment variables.
const envFile = join(root, ".env.local");
for (const line of existsSync(envFile) ? readFileSync(envFile, "utf8").split("\n") : []) {
  const i = line.indexOf("=");
  if (i < 1 || line.trim().startsWith("#")) continue;
  const key = line.slice(0, i).trim();
  if (!(key in process.env)) process.env[key] = line.slice(i + 1).trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey)
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const PASSWORD = "seed-password-1";

const CATEGORIES = [
  ["software-development", "Software Development"],
  ["data-science", "Data & AI"],
  ["design", "Design"],
  ["business", "Business"],
  ["marketing", "Marketing"],
  ["languages", "Languages"],
];

// [title, type, minutes, isPreview]
const COURSES = [
  {
    slug: "web-development-fundamentals",
    title: "Web Development Fundamentals",
    subtitle: "HTML, CSS and JavaScript from zero to your first site",
    category: "software-development",
    level: "beginner",
    price: 0,
    rating: [4.7, 812],
    outcomes: [
      "Build a responsive web page",
      "Understand how the web works",
      "Write basic JavaScript",
    ],
    requirements: ["A computer with a browser"],
    sections: [
      {
        title: "Getting started",
        lessons: [
          ["How the web works", "video", 12, true],
          ["Setting up your editor", "text", 8, true],
          ["Your first page", "video", 15, false],
        ],
      },
      {
        title: "Styling",
        lessons: [
          ["CSS selectors", "video", 14, false],
          ["Layout with flexbox", "video", 18, false],
          ["Quiz: CSS basics", "quiz", 10, false],
        ],
      },
    ],
  },
  {
    slug: "advanced-typescript",
    title: "Advanced TypeScript Patterns",
    subtitle: "Generics, conditional types and type-safe architecture",
    category: "software-development",
    level: "advanced",
    price: 6900,
    rating: [4.8, 431],
    outcomes: ["Model complex domains with types", "Write reusable generic utilities"],
    requirements: ["Solid JavaScript", "Basic TypeScript"],
    sections: [
      {
        title: "Generics deep dive",
        lessons: [
          ["Constraints and inference", "video", 20, true],
          ["Conditional types", "video", 24, false],
        ],
      },
      {
        title: "Architecture",
        lessons: [
          ["Type-safe APIs", "video", 22, false],
          ["Assignment: typed client", "assignment", 45, false],
        ],
      },
    ],
  },
  {
    slug: "python-for-data-analysis",
    title: "Python for Data Analysis",
    subtitle: "Pandas, charts and real datasets",
    category: "data-science",
    level: "intermediate",
    price: 4900,
    rating: [4.6, 1290],
    outcomes: ["Clean and reshape data with pandas", "Build charts that tell a story"],
    requirements: ["Basic Python"],
    sections: [
      {
        title: "Data wrangling",
        lessons: [
          ["Loading data", "video", 12, true],
          ["Cleaning missing values", "video", 16, false],
          ["Grouping and joining", "video", 19, false],
        ],
      },
      {
        title: "Visualisation",
        lessons: [
          ["Charts with matplotlib", "video", 17, false],
          ["Quiz: pandas", "quiz", 10, false],
        ],
      },
    ],
  },
  {
    slug: "intro-to-machine-learning",
    title: "Introduction to Machine Learning",
    subtitle: "Core algorithms explained without the maths overload",
    category: "data-science",
    level: "beginner",
    price: 0,
    rating: [4.5, 2044],
    outcomes: ["Explain supervised vs unsupervised learning", "Train and evaluate a simple model"],
    requirements: ["Curiosity"],
    sections: [
      {
        title: "Foundations",
        lessons: [
          ["What is machine learning?", "video", 10, true],
          ["Training and testing", "text", 9, false],
        ],
      },
      {
        title: "First models",
        lessons: [
          ["Linear regression", "video", 21, false],
          ["Classification basics", "video", 23, false],
        ],
      },
    ],
  },
  {
    slug: "ui-design-essentials",
    title: "UI Design Essentials",
    subtitle: "Layout, colour and typography that just works",
    category: "design",
    level: "beginner",
    price: 3900,
    rating: [4.4, 356],
    outcomes: ["Apply a consistent spacing system", "Choose accessible colour palettes"],
    requirements: ["None"],
    sections: [
      {
        title: "Visual foundations",
        lessons: [
          ["Spacing and grids", "video", 13, true],
          ["Colour and contrast", "video", 15, false],
          ["Typography", "text", 8, false],
        ],
      },
    ],
  },
  {
    slug: "product-management-101",
    title: "Product Management 101",
    subtitle: "From idea to roadmap",
    category: "business",
    level: "all_levels",
    price: 5900,
    rating: [4.3, 198],
    outcomes: ["Write a clear product brief", "Prioritise a backlog"],
    requirements: ["None"],
    sections: [
      {
        title: "Discovery",
        lessons: [
          ["Finding real problems", "video", 14, true],
          ["Interviews that work", "video", 18, false],
        ],
      },
      {
        title: "Delivery",
        lessons: [
          ["Roadmaps", "text", 11, false],
          ["Assignment: your roadmap", "assignment", 40, false],
        ],
      },
    ],
  },
  {
    slug: "seo-and-content-marketing",
    title: "SEO and Content Marketing",
    subtitle: "Rank, write and grow an audience",
    category: "marketing",
    level: "intermediate",
    price: 2900,
    rating: [4.2, 124],
    outcomes: ["Plan a keyword strategy", "Write content that ranks"],
    requirements: ["A website or blog"],
    sections: [
      {
        title: "Search basics",
        lessons: [
          ["How search engines work", "video", 12, true],
          ["Keyword research", "video", 16, false],
        ],
      },
    ],
  },
  {
    slug: "spanish-for-beginners",
    title: "Spanish for Beginners",
    subtitle: "Speak simple Spanish in four weeks",
    category: "languages",
    level: "beginner",
    price: 0,
    language: "es",
    rating: [4.6, 903],
    outcomes: ["Introduce yourself", "Order food and ask directions"],
    requirements: ["None"],
    sections: [
      {
        title: "Hola",
        lessons: [
          ["Greetings", "video", 9, true],
          ["Numbers and days", "video", 11, false],
          ["Quiz: basics", "quiz", 8, false],
        ],
      },
    ],
  },
];

async function ensureUser(email, role, fullName) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  let id = data?.user?.id;
  if (error) {
    // Already exists: find it.
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
    id = list?.users.find((u) => u.email === email)?.id;
    if (!id) throw error;
  }
  await db.from("profiles").update({ full_name: fullName }).eq("id", id);
  await db.from("user_roles").delete().eq("user_id", id);
  const { error: roleError } = await db.from("user_roles").insert({ user_id: id, role_id: role });
  if (roleError) throw roleError;
  return id;
}

async function main() {
  const { error: catError } = await db.from("categories").upsert(
    CATEGORIES.map(([slug, name], i) => ({ slug, name, sort_order: i })),
    { onConflict: "slug" },
  );
  if (catError) throw catError;
  const { data: cats } = await db.from("categories").select("id, slug");
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));

  const instructorId = await ensureUser(
    "seed-instructor@example.com",
    "instructor",
    "Demo Instructor",
  );
  const learnerId = await ensureUser("seed-learner@example.com", "learner", "Demo Learner");
  await ensureUser("seed-admin@example.com", "admin", "Demo Admin");
  await ensureUser("seed-superadmin@example.com", "super_admin", "Demo Super Admin");
  await db
    .from("learner_onboarding")
    .upsert({
      user_id: learnerId,
      interests: ["software-development", "design"],
      goals: ["new-skill"],
    });

  let created = 0;
  const courseIds = {};
  for (const c of COURSES) {
    const { data: existing } = await db
      .from("courses")
      .select("id")
      .eq("slug", c.slug)
      .maybeSingle();
    if (existing) {
      courseIds[c.slug] = existing.id;
      continue;
    }
    const { data: course, error: courseError } = await db
      .from("courses")
      .insert({
        slug: c.slug,
        instructor_id: instructorId,
        category_id: catId[c.category],
        rating_avg: c.rating[0],
        rating_count: c.rating[1],
      })
      .select("id")
      .single();
    if (courseError) throw courseError;

    const minutes = c.sections.flatMap((s) => s.lessons).reduce((sum, l) => sum + l[2], 0);
    const { data: version, error: versionError } = await db
      .from("course_versions")
      .insert({
        course_id: course.id,
        version_number: 1,
        title: c.title,
        subtitle: c.subtitle,
        description: `${c.subtitle}. This is fixture data created by the dev seed script.`,
        level: c.level,
        language: c.language ?? "en",
        price_cents: c.price,
        outcomes: c.outcomes,
        requirements: c.requirements,
        duration_minutes: minutes,
      })
      .select("id")
      .single();
    if (versionError) throw versionError;

    for (const [si, s] of c.sections.entries()) {
      const { data: section, error: sectionError } = await db
        .from("course_sections")
        .insert({ version_id: version.id, title: s.title, position: si })
        .select("id")
        .single();
      if (sectionError) throw sectionError;
      const { error: lessonError } = await db.from("lessons").insert(
        s.lessons.map(([title, type, dur, preview], li) => ({
          section_id: section.id,
          title,
          type,
          position: li,
          duration_minutes: dur,
          is_preview: preview,
          content: `<p>Fixture lesson content for ${title}.</p>`,
        })),
      );
      if (lessonError) throw lessonError;
    }

    await db
      .from("course_versions")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", version.id);
    await db.from("courses").update({ published_version_id: version.id }).eq("id", course.id);
    courseIds[c.slug] = course.id;
    created++;
  }

  // Demo learner: enrolled in the first free course with its first lesson done.
  const firstSlug = COURSES[0].slug;
  const { data: course } = await db
    .from("courses")
    .select("id, published_version_id")
    .eq("id", courseIds[firstSlug])
    .single();
  const { data: enrollment } = await db
    .from("enrollments")
    .upsert(
      { user_id: learnerId, course_id: course.id, version_id: course.published_version_id },
      { onConflict: "user_id,course_id" },
    )
    .select("id")
    .single();
  const { data: firstLesson } = await db
    .from("lessons")
    .select("id, course_sections!inner(version_id)")
    .eq("course_sections.version_id", course.published_version_id)
    .order("position")
    .limit(1)
    .single();
  await db
    .from("lesson_progress")
    .upsert(
      {
        enrollment_id: enrollment.id,
        lesson_id: firstLesson.id,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "enrollment_id,lesson_id" },
    );

  // Demo learning path over three seeded courses (idempotent by slug).
  const PATH_SLUG = "web-developer-path";
  const { data: existingPath } = await db.from("learning_paths").select("id").eq("slug", PATH_SLUG).maybeSingle();
  if (!existingPath) {
    const { data: path, error: pathError } = await db
      .from("learning_paths")
      .insert({
        slug: PATH_SLUG,
        title: "Become a Web Developer",
        description: "From the fundamentals to advanced TypeScript, in the order that works best.",
        status: "published",
      })
      .select("id")
      .single();
    if (pathError) throw pathError;
    const order = ["web-development-fundamentals", "advanced-typescript", "ui-design-essentials"];
    await db
      .from("learning_path_courses")
      .insert(order.map((slug, position) => ({ path_id: path.id, course_id: courseIds[slug], position })));
  }

  console.log(
    `Seed complete: ${created} new course(s), ${COURSES.length} total; ${CATEGORIES.length} categories.`,
  );
  console.log(
    "Logins: seed-instructor@example.com, seed-learner@example.com, seed-admin@example.com, seed-superadmin@example.com  (password: " + PASSWORD + ")",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
