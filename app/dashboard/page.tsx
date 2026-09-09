"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Job = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  employment_type: string | null;
  status: string;
  created_at: string;
};

type Candidate = {
  id: string;
  name: string;
  email: string | null;
  created_at: string;
};

type Application = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
  created_at: string;
};

type DashboardCache = {
  jobs: Job[];
  candidates: Candidate[];
  applications: Application[];
};

const CACHE_KEY = "hireflow-dashboard-cache";

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  useEffect(() => {
    startDashboard();
  }, []);

  async function startDashboard() {
    const cached = getCachedDashboard();

    if (cached) {
      setJobs(cached.jobs);
      setCandidates(cached.candidates);
      setApplications(cached.applications);
      setLoading(false);
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/";
      return;
    }

    const { data: profile } = await supabase.rpc("get_my_profile");

    setRole(profile?.role ?? null);
    setRoleLoaded(true);

    await loadData();
    setLoading(false);
  }

  function getCachedDashboard(): DashboardCache | null {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as DashboardCache;
    } catch {
      return null;
    }
  }

  function saveDashboardCache(data: DashboardCache) {
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify(data)
      );
    } catch {
      // Ignorera cache-fel
    }
  }

  async function loadData() {
    setError("");

    const [
      { data: jobData, error: jobError },
      { data: candidateData, error: candidateError },
      { data: applicationData, error: applicationError },
    ] = await Promise.all([
      supabase
        .from("jobs")
        .select(
          "id, title, description, location, employment_type, status, created_at"
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("candidates")
        .select("id, name, email, created_at")
        .order("created_at", { ascending: false }),

      supabase
        .from("applications")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (jobError) {
      setError(jobError.message);
      return;
    }

    if (candidateError) {
      setError(candidateError.message);
      return;
    }

    if (applicationError) {
      setError(applicationError.message);
      return;
    }

    const newData: DashboardCache = {
      jobs: jobData || [],
      candidates: candidateData || [],
      applications: applicationData || [],
    };

    setJobs(newData.jobs);
    setCandidates(newData.candidates);
    setApplications(newData.applications);

    saveDashboardCache(newData);
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // Ignorera cache-fel
    }

    window.location.href = "/";
  }

  const activeJobs = jobs.filter(
    (job) => job.status === "active"
  ).length;

  const interviewCount = applications.filter(
    (application) => application.status === "interview"
  ).length;

  const hiredCount = applications.filter(
    (application) => application.status === "hired"
  ).length;

  const newCandidates = applications.filter(
    (application) => application.status === "new"
  ).length;

  const screeningCount = applications.filter(
    (application) => application.status === "screening"
  ).length;

  const offerCount = applications.filter(
    (application) => application.status === "offer"
  ).length;

  const rejectedCount = applications.filter(
    (application) => application.status === "rejected"
  ).length;

  const recentJobs = jobs.slice(0, 3);

  return (
    <main className="min-h-screen bg-[#f8f9fb] text-[#0b1220]">
      <div className="flex min-h-screen">
        <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 shrink-0 bg-[#0f151d] text-white md:flex md:flex-col">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2688ef] text-xl font-bold">
                ✦
              </div>

              <div>
                <p className="text-base font-bold">
                  HireFlow
                </p>

                <p className="text-xs text-slate-400">
                  Talent workspace
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4">
            <a
              href="/dashboard"
              className="mb-1.5 flex items-center justify-between rounded-lg border border-white bg-[#202832] px-3 py-3 text-sm font-bold text-white"
            >
              <span className="flex items-center gap-3">
                <span>⊞</span>
                Översikt
              </span>

              <span className="h-2 w-2 rounded-full bg-[#2688ef]" />
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

            {roleLoaded && role === "admin" && (
              <a
                href="/customers"
                className="mb-1.5 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                <span>▤</span>
                Kunder
              </a>
            )}
          </nav>

          <div className="border-t border-white/10 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e9ddff] text-[10px] font-bold text-[#6842a5]">
                HF
              </div>

              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">
                  HireFlow Admin
                </p>

                <p className="text-[10px] text-slate-400">
                  Administratör
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
              <div className="text-lg font-bold">
                HireFlow
              </div>

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
                className="whitespace-nowrap rounded-lg bg-[#202832] px-2.5 py-1.5 text-xs font-semibold text-white"
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

              {roleLoaded && role === "admin" && (
                <a
                  href="/customers"
                  className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs text-slate-600"
                >
                  Kunder
                </a>
              )}
            </nav>
          </div>

          <header className="border-b border-slate-200 bg-[#f8f9fb] px-6 py-7 md:px-12 md:py-8">
            <div className="mx-auto max-w-[1380px]">
              <h1 className="text-[32px] font-semibold tracking-tight text-[#101820] md:text-[36px]">
                Översikt
              </h1>

              <p className="mt-2 text-sm text-slate-500 md:text-[15px]">
                Få en snabb överblick över dina rekryteringar.
              </p>
            </div>
          </header>

          <div className="px-6 py-7 md:px-12 md:py-8">
            <div className="mx-auto max-w-[1380px]">
              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                  <p className="text-xs font-semibold text-slate-500">
                    Aktiva rekryteringar
                  </p>

                  <p className="mt-2 text-3xl font-bold tracking-tight">
                    {activeJobs}
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    Rekryteringar som är öppna
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                  <p className="text-xs font-semibold text-slate-500">
                    Kandidater
                  </p>

                  <p className="mt-2 text-3xl font-bold tracking-tight">
                    {candidates.length}
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    Kandidater i talangpoolen
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                  <p className="text-xs font-semibold text-slate-500">
                    Intervjuer
                  </p>

                  <p className="mt-2 text-3xl font-bold tracking-tight">
                    {interviewCount}
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    Kandidater i intervju
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                  <p className="text-xs font-semibold text-slate-500">
                    Anställda
                  </p>

                  <p className="mt-2 text-3xl font-bold tracking-tight">
                    {hiredCount}
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    Kandidater som blivit anställda
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                      <h2 className="text-base font-bold">
                        Rekryteringar
                      </h2>

                      <p className="mt-1 text-xs text-slate-500">
                        Dina senaste rekryteringar
                      </p>
                    </div>

                    <a
                      href="/recruitments"
                      className="text-xs font-bold text-[#2688ef] hover:underline"
                    >
                      Visa alla
                    </a>
                  </div>

                  {recentJobs.length === 0 ? (
                    <div className="px-5 py-12 text-center">
                      <h3 className="text-sm font-bold">
                        Inga rekryteringar ännu
                      </h3>

                      <p className="mt-1.5 text-xs text-slate-500">
                        Skapa din första rekrytering för att komma igång.
                      </p>

                      <a
                        href="/recruitments"
                        className="mt-4 inline-flex rounded-lg bg-[#18283a] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#101c2a]"
                      >
                        Skapa rekrytering
                      </a>
                    </div>
                  ) : (
                    <div>
                      {recentJobs.map((job) => {
                        const candidateCount =
                          applications.filter(
                            (application) =>
                              application.job_id === job.id
                          ).length;

                        return (
                          <div
                            key={job.id}
                            className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-slate-900">
                                {job.title}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {job.location || "Ingen plats angiven"}
                                {job.employment_type
                                  ? ` · ${job.employment_type}`
                                  : ""}
                              </p>
                            </div>

                            <span className="shrink-0 text-xs font-medium text-slate-500">
                              {candidateCount}{" "}
                              {candidateCount === 1
                                ? "kandidat"
                                : "kandidater"}
                            </span>

                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                job.status === "active"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : job.status === "closed"
                                    ? "bg-red-50 text-red-700"
                                    : job.status === "archived"
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {job.status === "active"
                                ? "Aktiv"
                                : job.status === "closed"
                                  ? "Stängd"
                                  : job.status === "archived"
                                    ? "Arkiverad"
                                    : "Utkast"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="text-base font-bold">
                      Kandidatstatus
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
                      Aktuell kandidatprocess
                    </p>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-slate-100">
                    <div className="divide-y divide-slate-100">
                      <div className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full bg-slate-400" />

                          <span className="text-xs font-medium">
                            Nya kandidater
                          </span>
                        </div>

                        <span className="text-xs font-bold">
                          {newCandidates}
                        </span>
                      </div>

                      <div className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full bg-blue-400" />

                          <span className="text-xs font-medium">
                            Urval
                          </span>
                        </div>

                        <span className="text-xs font-bold">
                          {screeningCount}
                        </span>
                      </div>

                      <div className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full bg-violet-500" />

                          <span className="text-xs font-medium">
                            Intervju
                          </span>
                        </div>

                        <span className="text-xs font-bold">
                          {interviewCount}
                        </span>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      <div className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full bg-amber-400" />

                          <span className="text-xs font-medium">
                            Erbjudande
                          </span>
                        </div>

                        <span className="text-xs font-bold">
                          {offerCount}
                        </span>
                      </div>

                      <div className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />

                          <span className="text-xs font-medium">
                            Anställda
                          </span>
                        </div>

                        <span className="text-xs font-bold">
                          {hiredCount}
                        </span>
                      </div>

                      <div className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full bg-red-400" />

                          <span className="text-xs font-medium">
                            Avvisade
                          </span>
                        </div>

                        <span className="text-xs font-bold">
                          {rejectedCount}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 px-5 py-4">
                    <a
                      href="/kanban"
                      className="flex items-center justify-between rounded-lg bg-[#f1f6fb] px-3.5 py-2.5 text-xs font-bold text-[#2688ef] transition hover:bg-[#e8f1f9]"
                    >
                      <span>Öppna kandidatflöde</span>
                      <span>→</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}