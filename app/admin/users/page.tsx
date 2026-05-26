import { redirect } from "next/navigation";

// The Users panel merged into /admin/players. Keep this route as a redirect so
// old bookmarks and links resolve.
export default function AdminUsersRedirect() {
  redirect("/admin/players");
}
