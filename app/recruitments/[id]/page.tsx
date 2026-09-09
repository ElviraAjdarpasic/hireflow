"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  phone: string | null;
  linkedin_url: string | null;
  cv_url: string | null;
};

function formatCandidateName(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) =>
      part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part
    )
    .join(" ");
}

type Application = {
  id: string;
  status: string;
  candidate_id: string;
};

const stages = [
  { value: "new", label: "Ny" },
  { value: "screening", label: "Urval" },
  { value: "interview", label: "Intervju" },
  { value: "offer", label: "Erbjudande" },
  { value: "hired", label: "Anställd" },
  { value: "rejected", label: "Avvisad" },
];

const statusStyles: Record<string, string> = {
  new: "bg-slate-400 text-white",
  screening: "bg-blue-500 text-white",
  interview: "bg-purple-500 text-white",
  offer: "bg-yellow-500 text-white",
  hired: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

export default function RecruitmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [job, setJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [addingCandidate, setAddingCandidate] = useState(false);
  const [showCandidatePicker, setShowCandidatePicker] = useState(false);
  const [error, setError] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateFilter, setCandidateFilter] = useState("all");
  const [editingJob, setEditingJob] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editEmploymentType, setEditEmploymentType] = useState("");
  const [editDescription, setEditDescription] = useState("");

  useEffect(() => {
    if (!id) {
      setError("Ingen rekryterings-ID hittades i URL:en.");
      return;
    }

    loadData();
  }, [id]);

  async function loadData() {
    setError("");

    const [
      { data: jobData, error: jobError },
      { data: applicationData, error: applicationError },
      { data: allCandidateData, error: allCandidateError },
    ] = await Promise.all([
      supabase
        .from("jobs")
        .select(
          "id, title, description, location, employment_type, status, created_at"
        )
        .eq("id", id)
        .single(),

      supabase
        .from("applications")
        .select("id, status, candidate_id")
        .eq("job_id", id),

      supabase
        .from("candidates")
        .select("id, name, email, phone, linkedin_url, cv_url")
        .order("name"),
    ]);

    if (jobError || !jobData) {
      setError(jobError?.message || "Rekryteringen kunde inte hittas.");
      return;
    }

    if (applicationError) {
      setError(applicationError.message);
      return;
    }

    if (allCandidateError) {
      setError(allCandidateError.message);
      return;
    }

    const candidateIds = new Set(
      (applicationData || []).map(
        (application) => application.candidate_id
      )
    );

    const candidateData = (allCandidateData || []).filter((candidate) =>
      candidateIds.has(candidate.id)
    );

    setJob(jobData);
    setApplications(applicationData || []);
    setCandidates(candidateData);
    setAllCandidates(allCandidateData || []);
  }

  function startEditingJob() {
    if (!job) {
      return;
    }

    setEditTitle(
      job.title
        .split(" ")
        .map((word) =>
          word.length > 0
            ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            : word
        )
        .join(" ")
    );
    setEditLocation(job.location || "");
    setEditEmploymentType(job.employment_type || "");
    setEditDescription(job.description || "");
    setEditingJob(true);
  }

  async function saveJobChanges() {
    if (!job) {
      return;
    }

    if (!editTitle.trim()) {
      setError("Rekryteringens namn måste fyllas i.");
      return;
    }

    setSavingJob(true);
    setError("");

    const { error } = await supabase
      .from("jobs")
      .update({
        title: editTitle.trim(),
        location: editLocation.trim() || null,
        employment_type: editEmploymentType.trim() || null,
        description: editDescription.trim() || null,
      })
      .eq("id", job.id);

    if (error) {
      setError(error.message);
      setSavingJob(false);
      return;
    }

    setJob((current) =>
      current
        ? {
            ...current,
            title: editTitle.trim(),
            location: editLocation.trim() || null,
            employment_type: editEmploymentType.trim() || null,
            description: editDescription.trim() || null,
          }
        : current
    );

    setEditingJob(false);
    setSavingJob(false);
  }

  async function deleteRecruitment() {
    if (!job) {
      return;
    }

    const confirmed = window.confirm(
      "Vill du ta bort hela rekryteringen? Alla kandidater kopplade till rekryteringen tas också bort från den."
    );

    if (!confirmed) {
      return;
    }

    setError("");

    const { error: applicationsError } = await supabase
      .from("applications")
      .delete()
      .eq("job_id", job.id);

    if (applicationsError) {
      setError(applicationsError.message);
      return;
    }

    const { error: jobError } = await supabase
      .from("jobs")
      .delete()
      .eq("id", job.id);

    if (jobError) {
      setError(jobError.message);
      return;
    }

    window.location.href = "/recruitments";
  }

  async function addCandidateToRecruitment() {
    if (!selectedCandidateId) {
      return;
    }

    setAddingCandidate(true);
    setError("");

    const { error } = await supabase.from("applications").insert({
      job_id: id,
      candidate_id: selectedCandidateId,
      status: "new",
    });

    if (error) {
      setError(error.message);
      setAddingCandidate(false);
      return;
    }

    const addedCandidate = allCandidates.find(
      (candidate) => candidate.id === selectedCandidateId
    );

    if (addedCandidate) {
      setCandidates((current) => [...current, addedCandidate]);
    }

    setApplications((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        status: "new",
        candidate_id: selectedCandidateId,
      },
    ]);

    setSelectedCandidateId("");
    setAddingCandidate(false);
  }

  async function updateApplicationStatus(
    applicationId: string,
    status: string
  ) {
    const previousApplications = applications;

    setApplications((current) =>
      current.map((application) =>
        application.id === applicationId
          ? { ...application, status }
          : application
      )
    );

    const { error } = await supabase
      .from("applications")
      .update({ status })
      .eq("id", applicationId);

    if (error) {
      setApplications(previousApplications);
      setError(error.message);
    }
  }

  async function removeCandidateFromRecruitment(
    applicationId: string,
    candidateId: string
  ) {
    const confirmed = window.confirm(
      "Vill du ta bort kandidaten från den här rekryteringen?"
    );

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("id", applicationId);

    if (error) {
      setError(error.message);
      return;
    }

    setApplications((current) =>
      current.filter(
        (application) => application.id !== applicationId
      )
    );

    setCandidates((current) =>
      current.filter((candidate) => candidate.id !== candidateId)
    );
  }

  const availableCandidates = allCandidates.filter(
    (candidate) =>
      !candidates.some(
        (connectedCandidate) =>
          connectedCandidate.id === candidate.id
      )
  );

  const filteredCandidates = candidates.filter((candidate) => {
    const application = applications.find(
      (item) => item.candidate_id === candidate.id
    );

    const matchesSearch = candidate.name
      .toLowerCase()
      .includes(candidateSearch.toLowerCase());

    const matchesFilter =
      candidateFilter === "all" ||
      application?.status === candidateFilter;

    return matchesSearch && matchesFilter;
  });

  if (!job) {
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
                href="/kanban"
                className="mb-1.5 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                <span>|||</span>
                Kandidatflöde
              </a>

              <a
                href="/customers"
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                <span>▤</span>
                Kunder
              </a>
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
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/";
                }}
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

                <a
                  href="/recruitments"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium"
                >
                  Tillbaka
                </a>
              </div>
            </div>

            <header className="border-b border-slate-200 bg-[#f8f9fb] px-6 py-7 md:px-12 md:py-8">
              <div className="mx-auto max-w-[1380px]">
                <a
                  href="/recruitments"
                  className="text-base font-semibold text-[#2688ef] hover:underline"
                >
                  <span className="text-xl font-bold">←</span> Rekryteringar
                </a>
              </div>
            </header>

            <main className="px-6 py-7 md:px-12 md:py-8">
              <div className="mx-auto max-w-[1380px]">
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error || "Laddar rekrytering..."}
                </div>
              </div>
            </main>
          </section>
        </div>
      </main>
    );
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

            <a
              href="/customers"
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <span>▤</span>
              Kunder
            </a>
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
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
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

              <a
                href="/recruitments"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium"
              >
                Tillbaka
              </a>
            </div>
          </div>

          <header className="border-b border-slate-200 bg-[#f8f9fb] px-6 py-7 md:px-12 md:py-8">
            <div className="mx-auto max-w-[1380px]">
              <a
                href="/recruitments"
                className="text-xs font-semibold text-[#2688ef] hover:underline"
              >
                ← Rekryteringar
              </a>

              <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h1 className="mt-2 truncate text-[32px] font-semibold tracking-tight text-[#101820] md:text-[36px]">
                    {job.title}
                  </h1>

                  <p className="mt-2 text-sm text-slate-500 md:text-[15px]">
                    {job.location || "Ingen plats angiven"}
                    {job.employment_type
                      ? ` · ${job.employment_type}`
                      : ""}
                    {` · Publicerad ${new Date(job.created_at).toLocaleDateString(
                      "sv-SE",
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }
                    )}`}
                  </p>
                </div>

                <div className="relative shrink-0">
                  <select
                    value={job.status}
                    onChange={async (event) => {
                      const status = event.target.value;

                      const { error } = await supabase
                        .from("jobs")
                        .update({ status })
                        .eq("id", job.id);

                      if (error) {
                        setError(error.message);
                        return;
                      }

                      setJob((current) =>
                        current ? { ...current, status } : current
                      );
                    }}
                    className={`appearance-none rounded-full border-0 py-2 pl-4 pr-9 text-sm font-bold outline-none ${
                      job.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : job.status === "closed"
                          ? "bg-red-50 text-red-700"
                          : job.status === "archived"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <option value="active">Aktiv</option>
                    <option value="closed">Stängd</option>
                    <option value="draft">Utkast</option>
                    <option value="archived">Arkiverad</option>
                  </select>

                  <span
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                    aria-hidden="true"
                  >
                    ▼
                  </span>
                </div>
              </div>
            </div>
          </header>

          <main className="px-6 py-7 md:px-12 md:py-8">
            <div className="mx-auto max-w-[1380px]">
              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
                  {error}
                </div>
              )}

              <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
                <div className="h-fit rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h2 className="text-base font-bold text-slate-900">
                      Om tjänsten
                    </h2>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={startEditingJob}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Redigera
                      </button>

                      <button
                        type="button"
                        onClick={deleteRecruitment}
                        className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>

                  <div className="space-y-5 p-5">
                    {editingJob ? (
                      <>
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            Namn på rekrytering
                          </label>
                          <input
                            value={editTitle}
                            onChange={(event) => {
                              setEditTitle(
                                event.target.value.replace(
                                  /(^|\s)(\S)/g,
                                  (_, space, letter) =>
                                    space + letter.toUpperCase()
                                )
                              );
                            }}
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            Plats
                          </label>
                          <input
                            value={editLocation}
                            onChange={(event) => {
                              setEditLocation(
                                event.target.value.replace(
                                  /(^|\s)(\S)/g,
                                  (_, space, letter) =>
                                    space + letter.toUpperCase()
                                )
                              );
                            }}
                            placeholder="T.ex. Stockholm"
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            Anställningsform
                          </label>
                          <input
                            value={editEmploymentType}
                            onChange={(event) =>
                              setEditEmploymentType(event.target.value)
                            }
                            placeholder="T.ex. Heltid"
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            Bakgrund
                          </label>
                          <textarea
                            value={editDescription}
                            onChange={(event) =>
                              setEditDescription(event.target.value)
                            }
                            rows={6}
                            placeholder="Beskriv tjänsten och bakgrunden..."
                            className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                          />
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={saveJobChanges}
                            disabled={savingJob}
                            className="rounded-lg bg-[#18283a] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#101c2a] disabled:opacity-50"
                          >
                            {savingJob ? "Sparar..." : "Spara"}
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingJob(false)}
                            disabled={savingJob}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                          >
                            Avbryt
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            Beskrivning
                          </p>

                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {job.description ||
                              "Ingen beskrivning angiven."}
                          </p>
                        </div>

                        <div className="border-t border-slate-100 pt-4">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            Plats
                          </p>

                          <p className="mt-1.5 text-sm font-medium text-slate-800">
                            {job.location || "Ingen plats angiven"}
                          </p>
                        </div>

                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            Anställningsform
                          </p>

                          <p className="mt-1.5 text-sm font-medium text-slate-800">
                            {job.employment_type || "Inte angiven"}
                          </p>
                        </div>

                        <div className="border-t border-slate-100 pt-4">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            Skapad
                          </p>

                          <p className="mt-1.5 text-sm font-medium text-slate-800">
                            {new Date(job.created_at).toLocaleDateString(
                              "sv-SE",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              }
                            )}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-5 py-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          Kandidater
                        </h2>

                        <p className="mt-1 text-xs text-slate-500">
                          {candidates.length}{" "}
                          {candidates.length === 1
                            ? "kandidat"
                            : "kandidater"}{" "}
                          kopplade till rekryteringen
                        </p>
                      </div>

                      {availableCandidates.length > 0 && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setShowCandidatePicker(
                                (current) => !current
                              )
                            }
                            className="rounded-lg bg-[#18283a] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#101c2a]"
                          >
                            Lägg till kandidat
                          </button>

                          {showCandidatePicker && (
                            <div className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                              <div className="max-h-64 overflow-y-auto p-1.5">
                                {availableCandidates.map(
                                  (candidate) => {
                                    const formattedName =
                                      candidate.name
                                        .split(" ")
                                        .filter(Boolean)
                                        .map(
                                          (part) =>
                                            part.charAt(0).toUpperCase() +
                                            part.slice(1).toLowerCase()
                                        )
                                        .join(" ");

                                    return (
                                      <button
                                        key={candidate.id}
                                        type="button"
                                        onClick={async () => {
                                          setSelectedCandidateId(
                                            candidate.id
                                          );
                                          setShowCandidatePicker(
                                            false
                                          );

                                          setAddingCandidate(true);
                                          setError("");

                                          const {
                                            error,
                                          } = await supabase
                                            .from("applications")
                                            .insert({
                                              job_id: id,
                                              candidate_id:
                                                candidate.id,
                                              status: "new",
                                            });

                                          if (error) {
                                            setError(
                                              error.message
                                            );
                                            setAddingCandidate(
                                              false
                                            );
                                            return;
                                          }

                                          setCandidates(
                                            (current) => [
                                              ...current,
                                              candidate,
                                            ]
                                          );

                                          setApplications(
                                            (current) => [
                                              ...current,
                                              {
                                                id: crypto.randomUUID(),
                                                status: "new",
                                                candidate_id:
                                                  candidate.id,
                                              },
                                            ]
                                          );

                                          setAddingCandidate(
                                            false
                                          );
                                        }}
                                        disabled={addingCandidate}
                                        className="block w-full rounded-lg px-3 py-2.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                                      >
                                        {formattedName}
                                      </button>
                                    );
                                  }
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 flex flex-col gap-3 md:flex-row">
                      <input
                        value={candidateSearch}
                        onChange={(event) =>
                          setCandidateSearch(event.target.value)
                        }
                        placeholder="Sök kandidat..."
                        className="w-full flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                      />

                      <select
                        value={candidateFilter}
                        onChange={(event) =>
                          setCandidateFilter(event.target.value)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100 md:w-40"
                      >
                        <option value="all">
                          Alla statusar
                        </option>

                        {stages.map((stage) => (
                          <option
                            key={stage.value}
                            value={stage.value}
                          >
                            {stage.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {filteredCandidates.length === 0 ? (
                    <div className="px-5 py-12 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-lg">
                        ♙
                      </div>

                      <p className="mt-4 text-sm font-bold text-slate-900">
                        {candidates.length === 0
                          ? "Inga kandidater ännu"
                          : "Inga kandidater hittades"}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {candidates.length === 0
                          ? "Det finns inga kandidater kopplade till denna rekrytering."
                          : "Prova att ändra din sökning eller ditt filter."}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_130px_82px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 md:grid">
                        <span>Namn</span>
                        <span>Kontakt</span>
                        <span className="text-center">
                          Status
                        </span>
                        <span className="text-right">
                          Åtgärd
                        </span>
                      </div>

                      {filteredCandidates.map((candidate) => {
                        const application = applications.find(
                          (item) =>
                            item.candidate_id === candidate.id
                        );

                        const initials = formatCandidateName(candidate.name)
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) =>
                            part[0]?.toUpperCase()
                          )
                          .join("");

                        return (
                          <div
                            key={candidate.id}
                            className="border-b border-slate-100 px-5 py-4 last:border-b-0 transition hover:bg-slate-50/60"
                          >
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_130px_82px] md:items-center">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-[#2688ef]">
                                  {initials || "?"}
                                </div>

                                <div className="min-w-0">
                                  <p className="break-words text-xs font-bold leading-5 text-slate-900">
                                    {formatCandidateName(candidate.name)}
                                  </p>
                                </div>
                              </div>

                              <div className="min-w-0">
                                <p className="truncate text-xs text-slate-500">
                                  {candidate.email || "Ingen e-post"}
                                </p>

                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                  {candidate.linkedin_url && (
                                    <a
                                      href={candidate.linkedin_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] font-semibold text-[#2688ef] hover:underline"
                                    >
                                      LinkedIn
                                    </a>
                                  )}

                                  {candidate.cv_url && (
                                    <a
                                      href={candidate.cv_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] font-semibold text-[#2688ef] hover:underline"
                                    >
                                      CV
                                    </a>
                                  )}
                                </div>
                              </div>

                              {application && (
                                <div className="flex flex-col items-center">
                                  <span className="mb-1 text-[10px] font-semibold text-slate-400 md:hidden">
                                    Status
                                  </span>

                                  <select
                                    value={application.status}
                                    onChange={(event) =>
                                      updateApplicationStatus(
                                        application.id,
                                        event.target.value
                                      )
                                    }
                                    className={`w-[130px] rounded-full border-0 px-3 py-1.5 text-center text-[10px] font-bold outline-none ${
                                      statusStyles[
                                        application.status
                                      ] || statusStyles.new
                                    }`}
                                  >
                                    {stages.map((item) => (
                                      <option
                                        key={item.value}
                                        value={item.value}
                                      >
                                        {item.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {application && (
                                <div className="flex justify-start md:justify-end">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeCandidateFromRecruitment(
                                        application.id,
                                        candidate.id
                                      )
                                    }
                                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[10px] font-semibold text-red-600 transition hover:bg-red-50"
                                  >
                                    Ta bort
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </section>
      </div>
    </main>
  );
}