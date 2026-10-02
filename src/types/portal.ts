export const PORTALS = ["learner", "instructor", "admin", "org_admin"] as const;
export type Portal = (typeof PORTALS)[number];
