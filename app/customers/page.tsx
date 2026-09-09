"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  name: string;
  created_at: string;
  email?: string | null;
  role?: string;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showAdminForm, setShowAdminForm] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    checkLogin();
  }, []);

  async function checkLogin() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/";
      return;
    }

    const { data: profile } = await supabase.rpc("get_my_profile");
    setRole(profile?.role ?? null);

    if (!profile || profile.role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }

    loadCustomers();
  }

  async function loadCustomers() {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    setCurrentUserId(currentUser?.id || null);
    setLoadingCustomers(true);

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setLoadingCustomers(false);
      return;
    }

    const { data: users } = await supabase
      .from("users")
      .select("id, customer_id, full_name, role, created_at")
      .order("created_at", { ascending: false });

    const emailByCustomerId = new Map<string, string | null>();

    for (const user of users || []) {
      if (!user.customer_id) continue;

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser?.id === user.id) {
        emailByCustomerId.set(user.customer_id, authUser?.email || null);
      }
    }

    const customerRows = (data || []).map((customer) => ({
      ...customer,
      email: emailByCustomerId.get(customer.id) || null,
      role: "customer",
    }));

    const adminRows = (users || [])
      .filter((user) => user.role === "admin")
      .map((user) => ({
        id: user.id,
        name: user.full_name || "Admin",
        created_at: user.created_at,
        email: null,
        role: "admin",
      }));

    setCustomers([...customerRows, ...adminRows]);
    setLoadingCustomers(false);
  }

  function resetAdminForm() {
    setCompanyName("");
    setEmail("");
    setPassword("");
    setShowAdminForm(false);
    setError("");
    setSuccess("");
  }

  async function createAdminAccount(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (!companyName.trim()) throw new Error("Ange ett namn.");
      if (!email.trim()) throw new Error("Ange en e-postadress.");
      if (password.length < 6) throw new Error("Lösenordet måste vara minst 6 tecken.");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Du är inte inloggad.");

      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: companyName.trim(),
          role: "admin",
          customer_id: null,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Kunde inte skapa adminkontot.");

      setSuccess(`Admin ${companyName.trim()} skapades och kan nu logga in.`);

      setCustomers((current) => [
        {
          id: result.user?.id || `admin-${Date.now()}`,
          name: companyName.trim(),
          created_at: new Date().toISOString(),
          email: email.trim(),
          role: "admin",
        },
        ...current,
      ]);

      resetAdminForm();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Något gick fel.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setCompanyName("");
    setEmail("");
    setPassword("");
    setShowForm(false);
    setError("");
    setSuccess("");
  }

  async function createCustomerAccount(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (!companyName.trim()) {
        throw new Error("Ange ett företagsnamn.");
      }

      if (!email.trim()) {
        throw new Error("Ange en e-postadress.");
      }

      if (password.length < 6) {
        throw new Error("Lösenordet måste vara minst 6 tecken.");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Du är inte inloggad.");
      }

      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .insert({
          name: companyName.trim(),
        })
        .select("id")
        .single();

      if (customerError || !customer) {
        throw new Error(
          customerError?.message || "Kunde inte skapa kunden."
        );
      }

      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: companyName.trim(),
          role: "customer",
          customer_id: customer.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Kunde inte skapa kundkontot."
        );
      }

      setSuccess(
        `Kunden ${companyName.trim()} skapades och kan nu logga in.`
      );

      setCompanyName("");
      setEmail("");
      setPassword("");
      setShowForm(false);

      await loadCustomers();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Något gick fel."
      );
    } finally {
      setLoading(false);
    }
  }

  async function deleteCustomer(id: string, role?: string) {
    const confirmed = window.confirm(
      `Är du säker på att du vill ta bort ${role === "admin" ? "admin" : "kunden"}?`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      setError("Du är inte inloggad.");
      return;
    }

    const response = await fetch("/api/admin/delete-user", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id, role: role || "customer" }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || "Kunde inte ta bort användaren.");
      return;
    }
    setSuccess(role === "admin" ? "Admin togs bort." : "Kunden togs bort.");
    await loadCustomers();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const filteredCustomers = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    if (!searchText) {
      return customers;
    }

    return customers.filter((customer) =>
      customer.name.toLowerCase().includes(searchText)
    );
  }, [customers, search]);

  return (
    <main className="min-h-screen bg-[#f8f9fb] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 shrink-0 bg-[#0f151d] text-white md:flex md:flex-col">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2688ef] text-xl font-bold">
                ✦
              </div>

              <div>
                <p className="text-base font-bold">HireFlow</p>

                <p className="text-xs text-slate-400">
                  Talent workspace
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4">
            <a
              href="/dashboard"
              className="mb-1.5 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <span>⊞</span>
              Översikt
            </a>

            <a
              href="/recruitments"
              className="mb-1.5 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <span className="flex h-5 w-5 items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    d="M4 8.5h16v10.25A1.25 1.25 0 0 1 18.75 20h-13.5A1.25 1.25 0 0 1 4 18.75V8.5Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 8.5V6.75A1.75 1.75 0 0 1 9.75 5h4.5A1.75 1.75 0 0 1 16 6.75V8.5M4 11.5h16M10 11.5v1.25h4V11.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              Rekryteringar
            </a>

            <a
              href="/candidates"
              className="mb-1.5 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <span>♙</span>
              Kandidater
            </a>

            <a
              href="/kanban"
              className="mb-1.5 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <span>|||</span>
              Kandidatflöde
            </a>

            <a
              href="/customers"
              className="mb-1.5 flex items-center justify-between rounded-lg border border-white bg-[#202832] px-3 py-3 text-sm font-bold text-white"
            >
              <span className="flex items-center gap-3">
                <span>▤</span>
                Kunder
              </span>

              <span className="h-2 w-2 rounded-full bg-[#2688ef]" />
            </a>
          </nav>

          <div className="border-t border-white/10 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e9ddff] text-[10px] font-bold text-[#6842a5]">
                HF
              </div>

              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">
                  {role === "admin" ? "HireFlow Admin" : "HireFlow Kund"}
                </p>

                <p className="text-[10px] text-slate-400">
                  {role === "admin" ? "Administratör" : "Kund"}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            >
              Logga ut
            </button>
          </div>
        </aside>

        <section className="min-w-0 flex-1 md:ml-64">
          <div className="border-b border-slate-200 bg-white md:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-lg font-bold">HireFlow</div>

              <button
                onClick={handleLogout}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium"
              >
                Logga ut
              </button>
            </div>

            <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
              <a
                href="/dashboard"
                className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs text-slate-600"
              >
                Översikt
              </a>

              <a
                href="/recruitments"
                className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs text-slate-600"
              >
                Rekryteringar
              </a>

              <a
                href="/candidates"
                className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs text-slate-600"
              >
                Kandidater
              </a>

              <a
                href="/kanban"
                className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs text-slate-600"
              >
                Kandidatflöde
              </a>

              <a
                href="/customers"
                className="whitespace-nowrap rounded-lg bg-[#202832] px-2.5 py-1.5 text-xs font-semibold text-white"
              >
                Kunder
              </a>
            </nav>
          </div>

          <header className="border-b border-slate-200 bg-[#f8f9fb] px-6 py-7 md:px-12 md:py-8">
            <div className="mx-auto max-w-[1380px]">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-[32px] font-semibold tracking-tight text-[#101820] md:text-[36px]">
                    Kunder
                  </h1>

                  <p className="mt-2 text-sm text-slate-500 md:text-[15px]">
                    Hantera företag och användarkonton.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowForm(!showForm);
                      setShowAdminForm(false);
                      setError("");
                      setSuccess("");
                    }}
                    className="inline-flex items-center justify-center gap-3 rounded-xl bg-[#18283a] px-6 py-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#101c2a]"
                  >
                    <span className="text-xl leading-none">+</span>

                    {showForm ? "Stäng" : "Ny kund"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminForm(!showAdminForm);
                      setShowForm(false);
                      setError("");
                      setSuccess("");
                    }}
                    className="inline-flex items-center justify-center gap-3 rounded-xl bg-[#18283a] px-6 py-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#101c2a]"
                  >
                    <span className="text-xl leading-none">+</span>

                    {showAdminForm ? "Stäng" : "Ny admin"}
                  </button>
                </div>
              </div>
            </div>
          </header>

          <main className="px-6 py-7 md:px-12 md:py-8">
            <div className="mx-auto max-w-[1380px]">
              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
                  {success}
                </div>
              )}

              {showAdminForm && (
                <form
                  onSubmit={createAdminAccount}
                  className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
                >
                  <div className="mb-6">
                    <p className="text-base font-bold text-slate-900">Ny admin</p>
                    <p className="mt-1 text-xs text-slate-500">Skapa ett adminkonto.</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">Namn</label>
                      <input type="text" value={companyName} onChange={(event) => setCompanyName(event.target.value.split(" ").map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : "").join(" "))} required placeholder="Förnamn Efternamn" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">E-post</label>
                      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="namn@foretag.se" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">Lösenord</label>
                      <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} placeholder="Minst 6 tecken" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100" />
                    </div>
                  </div>

                  <div className="mt-5 flex gap-3">
                    <button type="submit" disabled={loading} className="rounded-lg bg-[#18283a] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#101c2a] disabled:opacity-50">
                      {loading ? "Sparar..." : "Skapa admin"}
                    </button>
                    <button type="button" onClick={resetAdminForm} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Avbryt</button>
                  </div>
                </form>
              )}

              {showForm && (
                <form
                  onSubmit={createCustomerAccount}
                  className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
                >
                  <div className="mb-6">
                    <p className="text-base font-bold text-slate-900">
                      Ny kund
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Skapa företag och kundkonto.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">
                        Företagsnamn
                      </label>

                      <input
                        type="text"
                        value={companyName}
                        onChange={(event) =>
                          setCompanyName(
                            event.target.value.charAt(0).toUpperCase() +
                              event.target.value.slice(1)
                          )
                        }
                        required
                        placeholder="Exempel AB"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">
                        E-post
                      </label>

                      <input
                        type="email"
                        value={email}
                        onChange={(event) =>
                          setEmail(event.target.value)
                        }
                        required
                        placeholder="kontakt@foretag.se"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">
                        Lösenord
                      </label>

                      <input
                        type="password"
                        value={password}
                        onChange={(event) =>
                          setPassword(event.target.value)
                        }
                        required
                        minLength={6}
                        placeholder="Minst 6 tecken"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex gap-3">
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-lg bg-[#18283a] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#101c2a] disabled:opacity-50"
                    >
                      {loading ? "Sparar..." : "Skapa kund"}
                    </button>

                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Avbryt
                    </button>
                  </div>
                </form>
              )}

              <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Sök kund..."
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="mb-4">
                <p className="text-xs font-medium text-slate-500">
                  Visar{" "}
                  <span className="font-bold text-slate-800">
                    {filteredCustomers.length}
                  </span>{" "}
                  av {customers.length} kunder
                </p>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="hidden grid-cols-[1.7fr_110px_110px_100px] gap-5 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 md:grid">
                  <div>Företag</div>
                  <div className="text-center">Roll</div>
                  <div className="text-center">Skapad</div>
                  <div className="text-right">Åtgärd</div>
                </div>

                {loadingCustomers ? (
                  <div className="px-5 py-14 text-center">
                    <p className="text-xs text-slate-500">
                      Laddar kunder...
                    </p>
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="px-5 py-14 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-xl">
                      ▤
                    </div>

                    <h3 className="mt-4 text-sm font-bold">
                      {search ? "Inga kunder hittades" : "Inga kunder ännu"}
                    </h3>

                    <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-500">
                      {search
                        ? "Prova att ändra din sökning."
                        : "Skapa din första kund för att komma igång."}
                    </p>
                  </div>
                ) : (
                  <div>
                    {filteredCustomers.map((customer) => (
                      <div
                        key={customer.id}
                        className="border-b border-slate-100 px-5 py-5 transition last:border-b-0 hover:bg-slate-50"
                      >
                        <div className="grid gap-4 md:grid-cols-[1.7fr_110px_110px_100px] md:items-center">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e9ddff] text-xs font-bold text-[#6842a5]">
                              {customer.name.slice(0, 2).toUpperCase()}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-base font-bold text-slate-900">
                                {customer.name}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 md:hidden">
                                Skapad{" "}
                                {new Date(
                                  customer.created_at
                                ).toLocaleDateString("sv-SE")}
                              </p>
                            </div>
                          </div>

                          <div className="hidden text-center text-xs font-semibold text-slate-600 md:block">
                            {customer.role === "admin" ? "Admin" : "Kund"}
                          </div>

                          <div className="hidden text-center text-xs text-slate-500 md:block">
                            {new Date(
                              customer.created_at
                            ).toLocaleDateString("sv-SE")}
                          </div>

                          <div className="flex flex-nowrap items-center justify-start gap-2 md:justify-end">
                            {!(customer.role === "admin" && customer.id === currentUserId) && (
                    <button
                              onClick={() => deleteCustomer(customer.id, customer.role)}
                              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-semibold text-red-600 transition hover:bg-red-50"
                            >
                              Ta bort
                            </button>
                  )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
        </section>
      </div>
    </main>
  );
}
