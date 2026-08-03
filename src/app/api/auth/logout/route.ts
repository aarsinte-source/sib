import { NextResponse } from "next/server";
import { rimuoviCookieSessione } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await rimuoviCookieSessione();
  return NextResponse.json({ ok: true });
}
