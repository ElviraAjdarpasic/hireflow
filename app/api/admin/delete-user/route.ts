import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function DELETE(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!token) {
      return Response.json({ error: "Du är inte inloggad." }, { status: 401 });
    }

    const body = await request.json();
    const id = body?.id;
    const role = body?.role;

    if (!id) {
      return Response.json({ error: "Användar-ID saknas." }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !authData.user) {
      return Response.json({ error: "Ogiltig inloggning." }, { status: 401 });
    }

    const { data: adminProfile, error: adminProfileError } =
      await supabaseAdmin
        .from("users")
        .select("id, role")
        .eq("id", authData.user.id)
        .single();

    if (adminProfileError || adminProfile?.role !== "admin") {
      return Response.json({ error: "Du saknar behörighet." }, { status: 403 });
    }

    if (role === "admin") {
      if (id === authData.user.id) {
        return Response.json(
          { error: "Du kan inte ta bort ditt eget adminkonto." },
          { status: 400 }
        );
      }

      const { error: deleteAuthError } =
        await supabaseAdmin.auth.admin.deleteUser(id);

      if (deleteAuthError) {
        return Response.json(
          { error: deleteAuthError.message },
          { status: 500 }
        );
      }

      await supabaseAdmin.from("users").delete().eq("id", id);

      return Response.json({ success: true });
    }

    const { data: users, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("customer_id", id);

    if (usersError) {
      return Response.json({ error: usersError.message }, { status: 500 });
    }

    for (const user of users || []) {
      const { error: deleteAuthError } =
        await supabaseAdmin.auth.admin.deleteUser(user.id);

      if (deleteAuthError) {
        return Response.json(
          { error: deleteAuthError.message },
          { status: 500 }
        );
      }
    }

    const { error: deleteCustomerError } = await supabaseAdmin
      .from("customers")
      .delete()
      .eq("id", id);

    if (deleteCustomerError) {
      return Response.json(
        { error: deleteCustomerError.message },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Kunde inte ta bort användaren.",
      },
      { status: 500 }
    );
  }
}
