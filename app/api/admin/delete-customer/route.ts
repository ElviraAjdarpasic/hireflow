import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Supabase server-konfiguration saknas.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");

    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!token) {
      return Response.json(
        { error: "Du är inte inloggad." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const customerId = body.customerId;

    if (!customerId) {
      return Response.json(
        { error: "customerId krävs." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getAdminClient();

    // Kontrollera vem som gör anropet
    const {
      data: authData,
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData.user) {
      return Response.json(
        { error: "Ogiltig inloggning." },
        { status: 401 }
      );
    }

    // Kontrollera att användaren är admin
    const {
      data: adminProfile,
      error: profileError,
    } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("id", authData.user.id)
      .single();

    if (
      profileError ||
      !adminProfile ||
      adminProfile.role !== "admin"
    ) {
      return Response.json(
        { error: "Du saknar behörighet." },
        { status: 403 }
      );
    }

    // Hitta kundens användare i public.users
    const {
      data: customerUser,
      error: customerUserError,
    } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("customer_id", customerId)
      .eq("role", "customer")
      .maybeSingle();

    if (customerUserError) {
      console.error(
        "Customer user lookup error:",
        customerUserError
      );

      return Response.json(
        { error: "Kunde inte hitta kundens användarkonto." },
        { status: 500 }
      );
    }

    // Ta bort kunden från public.users först
    if (customerUser?.id) {
      const { error: userDeleteError } = await supabaseAdmin
        .from("users")
        .delete()
        .eq("id", customerUser.id);

      if (userDeleteError) {
        console.error(
          "Public user delete error:",
          userDeleteError
        );

        return Response.json(
          {
            error:
              "Kunden kunde inte tas bort eftersom användarkontot inte kunde tas bort.",
          },
          { status: 500 }
        );
      }

      // Ta bort själva Auth-kontot
      const { error: authDeleteError } =
        await supabaseAdmin.auth.admin.deleteUser(
          customerUser.id
        );

      if (authDeleteError) {
        console.error(
          "Auth user delete error:",
          authDeleteError
        );

        return Response.json(
          {
            error:
              "Kundens konto i Supabase Auth kunde inte tas bort.",
          },
          { status: 500 }
        );
      }
    }

    // Ta bort själva kunden
    const { error: customerDeleteError } =
      await supabaseAdmin
        .from("customers")
        .delete()
        .eq("id", customerId);

    if (customerDeleteError) {
      console.error(
        "Customer delete error:",
        customerDeleteError
      );

      return Response.json(
        { error: customerDeleteError.message },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "Delete customer route error:",
      error
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kunde inte ta bort kunden.",
      },
      { status: 500 }
    );
  }
}