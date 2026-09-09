"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Job = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  employment_type: string | null;
  status: string;
  archived: boolean;
  created_at: string;
};

type Candidate = {
  id: string;
  name: string;
};

type Application = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
};

export default function RecruitmentsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [activeTab, setActiveTab] = useState<
    "all" | "open" | "closed" | "draft" | "archived"
  >("all");
  const [showArchived, setShowArchived] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [editingJob, setEditingJob] = useState<Job | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [role, setRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: profile } = await supabase.rpc("get_my_profile");

    setRole(profile?.role ?? null);
    setRoleLoaded(true);

    const [jobsResult, candidatesResult, applicationsResult] =
      await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("candidates").select("id, name"),
        supabase.from("applications").select("*"),
      ]);

    if (jobsResult.error) {
      setError(jobsResult.error.message);
      return;
    }

    if (candidatesResult.error) {
      setError(candidatesResult.error.message);
      return;
    }

    if (applicationsResult.error) {
      setError(applicationsResult.error.message);
      return;
    }

    setJobs(jobsResult.data || []);
    setCandidates(candidatesResult.data || []);
    setApplications(applicationsResult.data || []);
  }

  async function getCustomerId() {
    const { data, error } = await supabase.rpc("get_my_profile");

    if (error || !data) {
      throw new Error(
        error?.message || "Kunde inte hitta användarprofilen."
      );
    }

    return data.customer_id ?? null;
  }

  function openCreateForm() {
    setEditingJob(null);
    setTitle("");
    setDescription("");
    setLocation("");
    setEmploymentType("");
    setError("");
    setShowForm(true);

    requestAnimationFrame(() => {
      document.getElementById("recruitment-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function openEditForm(job: Job) {
    setEditingJob(job);
    setTitle(job.title);
    setDescription(job.description || "");
    setLocation(job.location || "");
    setEmploymentType(job.employment_type || "");
    setError("");
    setShowForm(true);

    requestAnimationFrame(() => {
      document.getElementById("recruitment-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function createJob(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const customerId = await getCustomerId();
      console.log("CUSTOMER ID:", customerId);

      const formattedTitle =
        title.trim().charAt(0).toUpperCase() +
        title.trim().slice(1);

      const formattedLocation =
        location.trim().charAt(0).toUpperCase() +
        location.trim().slice(1);

      const { error } = await supabase
        .from("jobs")
        .insert({
          customer_id: customerId,
          title: formattedTitle,
          description: description || null,
          location: formattedLocation || null,
          employment_type: employmentType.trim() || null,
          status: "active",
        });

      if (error) {
        throw new Error(error.message);
      }

      setTitle("");
      setDescription("");
      setLocation("");
      setEmploymentType("");
      setShowForm(false);

      await loadData();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Något gick fel."
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateJob(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!editingJob) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formattedTitle =
        title.trim().charAt(0).toUpperCase() +
        title.trim().slice(1);

      const formattedLocation =
        location.trim().charAt(0).toUpperCase() +
        location.trim().slice(1);

      const { error } = await supabase
        .from("jobs")
        .update({
          title: formattedTitle,
          description: description || null,
          location: formattedLocation || null,
          employment_type: employmentType.trim() || null,
        })
        .eq("id", editingJob.id);

      if (error) {
        throw new Error(error.message);
      }

      setEditingJob(null);
      setTitle("");
      setDescription("");
      setLocation("");
      setEmploymentType("");
      setShowForm(false);

      await loadData();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Något gick fel."
      );
    } finally {
      setLoading(false);
    }
  }

  async function archiveJob(job: Job) {
    const confirmed = window.confirm(
      `Vill du arkivera rekryteringen "${job.title}"?`
    );

    if (!confirmed) {
      return;
    }

    setError("");

    const { error } = await supabase
      .from("jobs")
      .update({ archived: true })
      .eq("id", job.id);

    if (error) {
      setError(error.message);
      return;
    }

    setJobs((current) =>
      current.map((item) =>
        item.id === job.id
          ? { ...item, archived: true }
          : item
      )
    );
  }

  async function restoreJob(job: Job) {
    setError("");

    const { error } = await supabase
      .from("jobs")
      .update({ archived: false })
      .eq("id", job.id);

    if (error) {
      setError(error.message);
      return;
    }

    setJobs((current) =>
      current.map((item) =>
        item.id === job.id
          ? { ...item, archived: false }
          : item
      )
    );
  }

  async function deleteJob(job: Job) {
    const confirmed = window.confirm(
      `Vill du verkligen radera rekryteringen "${job.title}"?`
    );

    if (!confirmed) {
      return;
    }

    setError("");

    const { error } = await supabase
      .from("jobs")
      .delete()
      .eq("id", job.id);

    if (error) {
      setError(error.message);
      return;
    }

    await loadData();
  }

  async function updateJobStatus(
    job: Job,
    newStatus: "active" | "closed"
  ) {
    if (job.status === newStatus) {
      return;
    }

    setError("");

    const { error } = await supabase
      .from("jobs")
      .update({ status: newStatus })
      .eq("id", job.id);

    if (error) {
      setError(error.message);
      return;
    }

    await loadData();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const locations = useMemo(() => {
    return Array.from(
      new Set(
        jobs
          .map((job) => job.location?.trim())
          .filter(
            (location): location is string =>
              Boolean(location)
          )
      )
    ).sort((a, b) => a.localeCompare(b, "sv"));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (activeTab === "all") {
        return true;
      }

      if (activeTab === "open") {
        return job.status === "active" && !job.archived;
      }

      if (activeTab === "closed") {
        return job.status === "closed";
      }

      if (activeTab === "draft") {
        return job.status === "draft" && !job.archived;
      }

      if (activeTab === "archived") {
        return job.archived || job.status === "archived";
      }

      return false;
    });
  }, [jobs, activeTab]);

  const allCount = jobs.length;

  const openCount = jobs.filter(
    (job) => job.status === "active" && !job.archived
  ).length;

  const closedCount = jobs.filter(
    (job) => job.status === "closed"
  ).length;

  const draftCount = jobs.filter(
    (job) => job.status === "draft" && !job.archived
  ).length;

  const archivedCount = jobs.filter(
    (job) => job.archived || job.status === "archived"
  ).length;

  function candidateCount(jobId: string) {
    return applications.filter(
      (application) => application.job_id === jobId
    ).length;
  }

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
              className="mb-1.5 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <span>⊞</span>
              Översikt
            </a>

            <a
              href="/recruitments"
              className="mb-1.5 flex items-center justify-between rounded-lg border border-white bg-[#202832] px-3 py-3 text-sm font-bold text-white"
            >
              <span className="flex items-center gap-3">
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
              </span>

              <span className="h-2 w-2 rounded-full bg-[#2688ef]" />
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
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
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

            <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
              <a
                href="/dashboard"
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-600"
              >
                Översikt
              </a>

              <a
                href="/recruitments"
                className="whitespace-nowrap rounded-lg bg-[#202832] px-3 py-2 text-sm font-semibold text-white"
              >
                Rekryteringar
              </a>

              <a
                href="/candidates"
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-600"
              >
                Kandidater
              </a>

              <a
                href="/kanban"
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-600"
              >
                Kandidatflöde
              </a>

              {roleLoaded && role === "admin" && (
                <a
                  href="/customers"
                  className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-600"
                >
                  Kunder
                </a>
              )}
            </nav>
          </div>

          <header className="border-b border-slate-200 bg-[#f8f9fb] px-6 py-7 md:px-12 md:py-8">
            <div className="mx-auto max-w-[1380px]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-[32px] font-semibold tracking-tight text-[#101820] md:text-[36px]">
                    Rekryteringar
                  </h1>

                  <p className="mt-2 text-sm text-slate-500 md:text-[15px]">
                    Hantera jobb, praktik och LIA-platser.
                  </p>
                </div>

                <button
                  onClick={() => {
                    if (showForm) {
                      setShowForm(false);
                      setEditingJob(null);
                    } else {
                      openCreateForm();
                    }
                  }}
                  className="inline-flex items-center justify-center gap-3 rounded-xl bg-[#18283a] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#101c2a]"
                >
                  {showForm
                    ? "Stäng"
                    : "+ Skapa ny rekrytering"}
                </button>
              </div>
            </div>
          </header>

          <main className="px-6 py-7 md:px-12 md:py-8">
            <div className="mx-auto max-w-[1380px]">
              {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {showForm && (
                <form
                  id="recruitment-form"
                  onSubmit={
                    editingJob ? updateJob : createJob
                  }
                  className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
                >
                  <div className="mb-5">
                    <p className="text-lg font-bold text-slate-900">
                      {editingJob
                        ? "Redigera rekrytering"
                        : "Ny rekrytering"}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {editingJob
                        ? "Uppdatera informationen om tjänsten."
                        : "Lägg till information om tjänsten."}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        Titel
                      </label>

                      <input
                        type="text"
                        value={title}
                        onChange={(event) =>
                          setTitle(event.target.value)
                        }
                        required
                        placeholder="Frontend Developer"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        Plats
                      </label>

                      <input
                        type="text"
                        value={location}
                        onChange={(event) =>
                          setLocation(event.target.value)
                        }
                        placeholder="Stockholm"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        Anställningsform
                      </label>

                      <input
                        type="text"
                        value={employmentType}
                        onChange={(event) => {
                          setEmploymentType(
                            event.target.value.replace(
                              /(^|\s)(\S)/g,
                              (_, space, letter) =>
                                space + letter.toUpperCase()
                            )
                          );
                        }}
                        placeholder="T.ex. Praktik"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-semibold">
                        Beskrivning
                      </label>

                      <textarea
                        value={description}
                        onChange={(event) =>
                          setDescription(
                            event.target.value
                          )
                        }
                        rows={3}
                        placeholder="Beskriv rollen..."
                        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex gap-3">
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-xl bg-[#18283a] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#101c2a] disabled:opacity-50"
                    >
                      {loading
                        ? "Sparar..."
                        : editingJob
                          ? "Spara ändringar"
                          : "Skapa rekrytering"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setEditingJob(null);
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Avbryt
                    </button>
                  </div>
                </form>
              )}

              <div className="mb-5 border-b border-slate-200">
                <div className="flex items-center gap-8">
                  <button
                    type="button"
                    onClick={() => setActiveTab("all")}
                    className={`relative pb-3 text-sm font-semibold transition ${
                      activeTab === "all"
                        ? "text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Alla {allCount}

                    {activeTab === "all" && (
                      <span className="absolute bottom-0 left-0 h-0.5 w-full bg-[#2688ef]" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("open")}
                    className={`relative pb-3 text-sm font-semibold transition ${
                      activeTab === "open"
                        ? "text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Öppna {openCount}

                    {activeTab === "open" && (
                      <span className="absolute bottom-0 left-0 h-0.5 w-full bg-[#2688ef]" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("closed")}
                    className={`relative pb-3 text-sm font-semibold transition ${
                      activeTab === "closed"
                        ? "text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Stängda {closedCount}

                    {activeTab === "closed" && (
                      <span className="absolute bottom-0 left-0 h-0.5 w-full bg-[#2688ef]" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("draft")}
                    className={`relative pb-3 text-sm font-semibold transition ${
                      activeTab === "draft"
                        ? "text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Utkast {draftCount}

                    {activeTab === "draft" && (
                      <span className="absolute bottom-0 left-0 h-0.5 w-full bg-[#2688ef]" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("archived")}
                    className={`relative pb-3 text-sm font-semibold transition ${
                      activeTab === "archived"
                        ? "text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Arkiverade {archivedCount}

                    {activeTab === "archived" && (
                      <span className="absolute bottom-0 left-0 h-0.5 w-full bg-[#2688ef]" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {filteredJobs.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-xl text-[#2688ef]">
                      ✦
                    </div>

                    <h3 className="mt-4 text-base font-bold">
                      Inga rekryteringar hittades
                    </h3>

                    <p className="mx-auto mt-2 max-w-md text-xs text-slate-500">
                      "Skapa en rekrytering för att komma igång."
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredJobs.map((job) => {
                      return (
                        <div
                          key={job.id}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:border-slate-300 hover:shadow-md md:px-5"
                        >
                          <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_110px] md:items-center">
                            <div className="flex min-w-0 items-center gap-3.5">
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2688ef]">
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-6 w-6"
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
                              </div>

                              <div className="min-w-0">
                                <p className="block truncate text-base font-bold text-slate-900">
                                  {job.title}
                                </p>

                                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                                  <span>
                                    {job.location ||
                                      "Ingen plats angiven"}

                                    {job.employment_type
                                      ? ` · ${job.employment_type}`
                                      : ""}
                                  </span>

                                  <span>
                                    Publicerad{" "}
                                    {new Date(
                                      job.created_at
                                    ).toLocaleDateString(
                                      "sv-SE"
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="hidden text-center md:block">
                              <p className="text-xs font-medium text-slate-400">
                                Kandidater
                              </p>

                              <p className="mt-1 text-sm font-bold text-slate-900">
                                {candidateCount(job.id)}
                              </p>
                            </div>

                            <div className="hidden text-center md:flex md:flex-col md:items-center md:justify-center">
                              <p className="text-xs font-medium text-slate-400">
                                Status
                              </p>

                              <button
                                type="button"
                                onClick={() =>
                                  updateJobStatus(
                                    job,
                                    job.status === "active"
                                      ? "closed"
                                      : "active"
                                  )
                                }
                                className={
                                  job.archived ||
                                  job.status === "archived"
                                    ? "mt-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 transition hover:bg-amber-100"
                                    : job.status === "active"
                                      ? "mt-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                                      : job.status === "closed"
                                        ? "mt-1 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 transition hover:bg-red-100"
                                        : "mt-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-200"
                                }
                              >
                                {job.archived ||
                                job.status === "archived"
                                  ? "Arkiverad"
                                  : job.status === "draft"
                                    ? "Utkast"
                                    : job.status === "closed"
                                      ? "Stängd"
                                      : "Aktiv"}
                              </button>
                            </div>

                            <div className="flex justify-end">
                              <a
                                href={`/recruitments/${job.id}`}
                                onClick={() => {
                                  console.log(
                                    "ÖPPNA KLICKAD:",
                                    job.id
                                  );
                                }}
                                className="relative z-50 flex h-10 w-[92px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#18283a] px-3 text-center text-xs font-bold text-white transition hover:bg-[#101c2a]"
                              >
                                Öppna

                                <span aria-hidden="true">
                                  →
                                </span>
                              </a>
                            </div>

                            <div className="flex items-center justify-between md:hidden">
                              <div className="text-center">
                                <p className="text-xs font-medium text-slate-400">
                                  Status
                                </p>

                                <button
                                  type="button"
                                  onClick={() =>
                                    updateJobStatus(
                                      job,
                                      job.status === "active"
                                        ? "closed"
                                        : "active"
                                    )
                                  }
                                  className={
                                    job.status === "active"
                                      ? "mt-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"
                                      : "mt-1 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
                                  }
                                >
                                  {job.status === "active"
                                    ? "Aktiv"
                                    : "Stängd"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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