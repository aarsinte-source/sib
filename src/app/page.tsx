import { redirect } from "next/navigation";
import { getSessione } from "@/lib/auth";

export default async function Home() {
  const sessione = await getSessione();
  redirect(sessione ? "/piano" : "/entra");
}
