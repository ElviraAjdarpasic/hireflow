import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY;

    if (!url || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase server-konfiguration saknas." },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const authorization = request.headers.get("authorization");

    if (!authorization) {
      return NextResponse.json(
        { error: "Du måste vara inloggad." },
        { status: 401 }
      );
    }

    const token = authorization.replace(/^Bearer\s+/i, "");

    const {
      data: { user: adminUser },
      error: adminAuthError,
    } = await supabaseAdmin.auth.getUser(token);

    if (adminAuthError || !adminUser) {
      return NextResponse.json(
        { error: "Din inloggning kunde inte verifieras." },
        { status: 401 }
      );
    }

    const { data: adminProfile, error: adminProfileError } =
      await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", adminUser.id)
        .single();

    if (
      adminProfileError ||
      !adminProfile ||
      adminProfile.role !== "admin"
    ) {
      return NextResponse.json(
        { error: "Endast admin kan ändra kundkonton." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const userId = String(body.user_id || "").trim();
    const fullName = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password =
      typeof body.password === "string" ? body.password : "";

    if (!userId || !fullName || !email) {
      return NextResponse.json(
        { error: "Fyll i företagsnamn och e-post." },
        { status: 400 }
      );
    }

    if (password && password.length < 6) {
      return NextResponse.json(
        { error: "Lösenordet måste vara minst 6 tecken." },
        { status: 400 }
      );
    }

    const { data: customerUser, error: customerUserError } =
      await supabaseAdmin
        .from("users")
        .select("id, customer_id, role")
        .eq("id", userId)
        .single();

    if (
      customerUserError ||
      !customerUser ||
      customerUser.role !== "customer" ||
      !customerUser.customer_id
    ) {
      return NextResponse.json(
        { error: "Kundkontot kunde inte hittas." },
        { status: 404 }
      );
    }

    const { error: customerError } = await supabaseAdmin
      .from("customers")
      .update({ name: fullName })
      .eq("id", customerUser.customer_id);

    if (customerError) {
      return NextResponse.json(
        { error: customerError.message },
        { status: 500 }
      );
    }

    const authUpdate: {
      email: string;
      user_metadata: { full_name: string };
      password?: string;
    } = {
      email,
      user_metadata: {
        full_name: fullName,
      },
    };

    if (password) {
      authUpdate.password = password;
    }

    const { error: authUpdateError } =
      await supabaseAdmin.auth.admin.updateUserById(
        userId,
        authUpdate
      );

    if (authUpdateError) {
      return NextResponse.json(
        { error: authUpdateError.message },
        { status: 500 }
      );
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from("users")
      .update({
        email,
        full_name: fullName,
      })
      .eq("id", userId);

    if (profileUpdateError) {
      return NextResponse.json(
        { error: profileUpdateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Kundkontot uppdaterades.",
    });
  } catch (error) {
    console.error("UPDATE USER ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Något gick fel.",
      },
      { status: 500 }
    );
  }
}
