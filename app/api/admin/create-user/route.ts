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

    console.log("SERVER ENV CHECK:", {
      url: !!url,
      serviceRoleKey: !!serviceRoleKey,
      cwd: process.cwd(),
    });

    if (!url) {
      console.error(
        "CREATE USER ERROR: NEXT_PUBLIC_SUPABASE_URL saknas."
      );

      return NextResponse.json(
        {
          error:
            "Supabase server-konfiguration saknas: URL saknas.",
        },
        { status: 500 }
      );
    }

    if (!serviceRoleKey) {
      console.error(
        "CREATE USER ERROR: Ingen servernyckel hittades."
      );

      return NextResponse.json(
        {
          error:
            "Supabase server-konfiguration saknas: servernyckel saknas.",
        },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      url,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const authorization =
      request.headers.get("authorization");

    if (!authorization) {
      return NextResponse.json(
        {
          error: "Du måste vara inloggad.",
        },
        { status: 401 }
      );
    }

    const token = authorization.replace(
      /^Bearer\s+/i,
      ""
    );

    if (!token) {
      return NextResponse.json(
        {
          error: "Ogiltig inloggning.",
        },
        { status: 401 }
      );
    }

    const {
      data: { user: adminUser },
      error: adminAuthError,
    } = await supabaseAdmin.auth.getUser(token);

    if (adminAuthError || !adminUser) {
      console.error(
        "CREATE USER AUTH ERROR:",
        adminAuthError?.message
      );

      return NextResponse.json(
        {
          error:
            "Din inloggning kunde inte verifieras.",
        },
        { status: 401 }
      );
    }

    const {
      data: adminProfile,
      error: adminProfileError,
    } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", adminUser.id)
      .single();

    if (
      adminProfileError ||
      !adminProfile ||
      adminProfile.role !== "admin"
    ) {
      console.error(
        "CREATE USER PROFILE ERROR:",
        adminProfileError?.message
      );

      return NextResponse.json(
        {
          error:
            "Endast admin kan skapa användare.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const fullName = String(
      body.full_name || ""
    ).trim();

    const email = String(
      body.email || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      body.password || ""
    );

    const role = String(
      body.role || ""
    ).trim();

    const customerId =
      body.customer_id || null;

    if (
      !fullName ||
      !email ||
      !password ||
      !role
    ) {
      return NextResponse.json(
        {
          error:
            "Fyll i alla obligatoriska fält.",
        },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        {
          error:
            "Lösenordet måste vara minst 6 tecken.",
        },
        { status: 400 }
      );
    }

    if (
      role !== "admin" &&
      role !== "customer"
    ) {
      return NextResponse.json(
        {
          error: "Ogiltig roll.",
        },
        { status: 400 }
      );
    }

    if (
      role === "customer" &&
      !customerId
    ) {
      return NextResponse.json(
        {
          error: "Välj en kund.",
        },
        { status: 400 }
      );
    }

    if (role === "customer") {
      const {
        data: customer,
        error: customerError,
      } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("id", customerId)
        .single();

      if (
        customerError ||
        !customer
      ) {
        return NextResponse.json(
          {
            error:
              "Kunden kunde inte hittas.",
          },
          { status: 400 }
        );
      }
    }

    const {
      data: authData,
      error: createAuthError,
    } =
      await supabaseAdmin.auth.admin.createUser(
        {
          email,
          password,
          email_confirm: true,
        }
      );

    if (
      createAuthError ||
      !authData.user
    ) {
      console.error(
        "CREATE AUTH USER ERROR:",
        createAuthError?.message
      );

      return NextResponse.json(
        {
          error:
            createAuthError?.message ||
            "Kunde inte skapa användaren.",
        },
        { status: 400 }
      );
    }

    const newUserId =
      authData.user.id;

    const {
      error: profileError,
    } =
      await supabaseAdmin.rpc(
        "create_user_profile",
        {
          new_user_id:
            newUserId,
          new_customer_id:
            role === "customer"
              ? customerId
              : null,
          new_role: role,
          new_full_name:
            fullName,
        }
      );

    if (profileError) {
      console.error(
        "CREATE PROFILE ERROR:",
        profileError.message
      );

      await supabaseAdmin.auth.admin.deleteUser(
        newUserId
      );

      return NextResponse.json(
        {
          error:
            "Kunde inte skapa användarprofilen: " +
            profileError.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Användaren skapades.",
    });
  } catch (error) {
    console.error(
      "CREATE USER ERROR:",
      error
    );

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