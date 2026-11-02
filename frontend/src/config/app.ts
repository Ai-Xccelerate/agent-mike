/**
 * Who this app is -- the first file to edit when a new AIX product starts from
 * the template.
 *
 * The sidebar's head reads `workspace` over `name` (as Artifacts and Persuade
 * read "AI Xccelerate" over their product's name), the phone's top bar and the
 * palette's foot say `name`, and every page's tab title ends in `titleSuffix`.
 *
 * `user` is the person the account menu shows until auth is wired. In a real
 * product it comes from Clerk (`useUser()` / `useOrganization()`), as the
 * Artifacts and Persuade account menus read it; the shape here is the subset
 * they use, so swapping the source changes one hook, not the menu.
 */
export const APP = {
  /** The product, under the workspace in the sidebar. */
  name: "AI Worker",
  /** The workspace or company, the sidebar's first line. */
  workspace: "AI Xccelerate",
  /** Every page title is "<Page> | <titleSuffix>". */
  titleSuffix: "Manager console",
  description: "Configure and operate your AI worker.",
} as const;

export interface AppUser {
  name: string;
  email: string;
  /** A word, not a key: "Admin", not "org:admin". */
  role: string | null;
  /** A picture, or null for initials on the brand fill. */
  imageUrl: string | null;
}

export const DEMO_USER: AppUser = {
  name: "Rahul",
  email: "rahul@aixccelerate.com",
  role: "Admin",
  imageUrl: null,
};

/** Two letters for an avatar: "Rahul Shah" → "RS", "Rahul" → "RA". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
