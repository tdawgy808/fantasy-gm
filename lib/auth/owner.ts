import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AUTH_COOKIE, isOwner } from "./session";
export async function requireOwner() {
  await connection();
  if (!isOwner((await cookies()).get(AUTH_COOKIE)?.value)) redirect("/login");
}
