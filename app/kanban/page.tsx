"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Job = {
  id: string;
  title: string;
};

type Candidate = {
  id: string;
  name: string;
  email: string | null;
  linkedin_url: string | null;
  cv_url: string | null;
};

type Application = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
  ai_score: number | null;
};

type KanbanCard = {
  application: Application;
  candidate: Candidate;
  job: Job;
};

const stages = [
  {
    id: "new",
    name: "Ny",
    color: "bg-slate-400",
  },
  {
    id: "screening",
    name: "Urval",
    color: "bg-blue-500",
  },
  {
    id: "interview",
    name: "Intervju",
    color: "bg-purple-500",
  },
  {
    id: "offer",
    name: "Erbjudande",
    color: "bg-yellow-500",
  },
  {
    id: "hired",
    name: "Anställd",
    color: "bg-emerald-500",
  },
  {
    id: "rejected",
    name: "Avvisad",
    color: "bg-red-500",
  },
];

export default function KanbanPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [hiddenApplicationIds, setHiddenApplicationIds] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");

  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] = useState("");
  const [error, setError] = useState("");
  const [addToStage, setAddToStage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [jobSearch, setJobSearch] = useState("");

  const [role, setRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  useEffect(() => {
    checkLogin();
    loadData();

    const savedHiddenIds = window.localStorage.getItem("hireflow-kanban-hidden");
    if (savedHiddenIds) {
      try {
        setHiddenApplicationIds(JSON.parse(savedHiddenIds));
      } catch {
        setHiddenApplicationIds([]);
      }
    }
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
    setRoleLoaded(true);
  }

  async function loadData() {
    setLoading(true);
    setError("");

    const [jobsResult, candidatesResult, applicationsResult] =
      await Promise.all([
        supabase
          .from("jobs")
          .select("id, title")
          .order("created_at", { ascending: false }),

        supabase
          .from("candidates")
          .select("id, name, email, linkedin_url, cv_url")
          .order("name", { ascending: true }),

        supabase
          .from("applications")
          .select("id, job_id, candidate_id, status, ai_score"),
      ]);

    if (jobsResult.error) {
      setError(jobsResult.error.message);
      setLoading(false);
      return;
    }

    if (candidatesResult.error) {
      setError(candidatesResult.error.message);
      setLoading(false);
      return;
    }

    if (applicationsResult.error) {
      setError(applicationsResult.error.message);
      setLoading(false);
      return;
    }

    setJobs(jobsResult.data || []);
    setCandidates(candidatesResult.data || []);
    setApplications(applicationsResult.data || []);

    setLoading(false);
  }

  async function moveCandidate(
    applicationId: string,
    newStatus: string
  ) {
    const application = applications.find(
      (item) => item.id === applicationId
    );

    if (!application || application.status === newStatus) {
      return;
    }

    setMovingId(applicationId);
    setError("");

    const oldStatus = application.status;

    setApplications((current) =>
      current.map((item) =>
        item.id === applicationId
          ? {
              ...item,
              status: newStatus,
            }
          : item
      )
    );

    const { error } = await supabase
      .from("applications")
      .update({
        status: newStatus,
      })
      .eq("id", applicationId);

    if (error) {
      setApplications((current) =>
        current.map((item) =>
          item.id === applicationId
            ? {
                ...item,
                status: oldStatus,
              }
            : item
        )
      );

      setError(error.message);
    }

    setMovingId("");
  }

  function handleDragStart(
    event: React.DragEvent<HTMLDivElement>,
    applicationId: string
  ) {
    event.dataTransfer.setData(
      "applicationId",
      applicationId
    );

    event.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(
    event: React.DragEvent<HTMLDivElement>,
    status: string
  ) {
    event.preventDefault();

    const applicationId =
      event.dataTransfer.getData("applicationId");

    if (!applicationId) {
      return;
    }

    moveCandidate(applicationId, status);
  }

  function removeCandidate(applicationId: string) {
    setError("");

    // Dölj bara kortet i Kandidatflödet.
    // Kandidaten, rekryteringen och application-data ligger kvar.
    setHiddenApplicationIds((current) => {
      const updated = current.includes(applicationId)
        ? current
        : [...current, applicationId];

      window.localStorage.setItem(
        "hireflow-kanban-hidden",
        JSON.stringify(updated)
      );

      return updated;
    });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const cards = useMemo<KanbanCard[]>(() => {
    const searchText = search.trim().toLowerCase();

    return applications
      .filter((application) => !hiddenApplicationIds.includes(application.id))
      .map((application) => {
        const candidate = candidates.find(
          (item) => item.id === application.candidate_id
        );

        const job = jobs.find(
          (item) => item.id === application.job_id
        );

        if (!candidate || !job) {
          return null;
        }

        return {
          application,
          candidate,
          job,
        };
      })
      .filter(
        (item): item is KanbanCard => item !== null
      )
      .filter((item) => {
        const matchesJob =
          !selectedJobId ||
          item.job.id === selectedJobId;

        const matchesSearch =
          !searchText ||
          item.candidate.name
            .toLowerCase()
            .includes(searchText) ||
          (item.candidate.email || "")
            .toLowerCase()
            .includes(searchText) ||
          item.job.title
            .toLowerCase()
            .includes(searchText);

        return matchesJob && matchesSearch;
      });
  }, [
    applications,
    hiddenApplicationIds,
    candidates,
    jobs,
    search,
    selectedJobId,
  ]);

  function getCardsForStage(stageId: string) {
    return cards.filter(
      (card) => card.application.status === stageId
    );
  }

  function formatName(name: string) {
    return name
      .split(" ")
      .filter(Boolean)
      .map(
        (part) =>
          part.charAt(0).toUpperCase() +
          part.slice(1).toLowerCase()
      )
      .join(" ");
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  function getAvailableCandidates(stageId: string) {
    return candidates;
  }

  async function addCandidateToStage(
    candidateId: string,
    stageId: string,
    jobId: string
  ) {
    const existingApplication = applications.find(
      (application) =>
        application.candidate_id === candidateId &&
        application.job_id === jobId
    );

    if (existingApplication) {
      // Om kandidaten redan finns i rekryteringen ska vi återvisa
      // samma application i kandidatflödet istället för att skapa en ny.
      setHiddenApplicationIds((current) => {
        const updated = current.filter(
          (id) => id !== existingApplication.id
        );

        window.localStorage.setItem(
          "hireflow-kanban-hidden",
          JSON.stringify(updated)
        );

        return updated;
      });

      if (existingApplication.status === stageId) {
        setSelectedCandidateId(null);
        setCandidateSearch("");
        setJobSearch("");
        setAddToStage(null);
        return;
      }

      const oldStatus = existingApplication.status;

      setApplications((current) =>
        current.map((application) =>
          application.id === existingApplication.id
            ? { ...application, status: stageId }
            : application
        )
      );

      const { error } = await supabase
        .from("applications")
        .update({ status: stageId })
        .eq("id", existingApplication.id);

      if (error) {
        setApplications((current) =>
          current.map((application) =>
            application.id === existingApplication.id
              ? { ...application, status: oldStatus }
              : application
          )
        );

        setError(error.message);
        return;
      }

      setSelectedCandidateId(null);
      setCandidateSearch("");
      setJobSearch("");
      setAddToStage(null);
      return;
    }

    const { data, error } = await supabase
      .from("applications")
      .insert({
        job_id: jobId,
        candidate_id: candidateId,
        status: stageId,
      })
      .select("id, job_id, candidate_id, status")
      .single();

    if (error) {
      if (error.code === "23505") {
        setError("Kandidaten finns redan i den här rekryteringen.");
      } else {
        setError(error.message);
      }

      return;
    }

    if (data) {
      setApplications((current) => [
        ...current,
        {
          ...data,
          ai_score: null,
        },
      ]);
    }

    setSelectedCandidateId(null);
    setAddToStage(null);
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
              className="mb-1.5 flex items-center justify-between rounded-lg border border-white bg-[#202832] px-3 py-3 text-sm font-bold text-white"
            >
              <span className="flex items-center gap-3">
                <span>|||</span>
                Kandidatflöde
              </span>

              <span className="h-2 w-2 rounded-full bg-[#2688ef]" />
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
                className="whitespace-nowrap rounded-lg bg-[#202832] px-2.5 py-1.5 text-xs font-semibold text-white"
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

              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">

                <div>

                  <h1 className="text-[32px] font-semibold tracking-tight text-[#101820] md:text-[36px]">
                    Kandidatflöde
                  </h1>

                  <p className="mt-2 text-sm text-slate-500">
                    Följ kandidater genom hela rekryteringsprocessen.
                  </p>

                </div>

              </div>

            </div>

          </header>

          <main className="px-5 py-5 md:px-8 md:py-6">

            <div className="mx-auto max-w-[1380px]">

              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}

              <div className="mb-5 flex flex-col gap-3 md:flex-row">

                <div className="relative flex-1">

                  <input
                    type="text"
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                    placeholder="Sök kandidater..."
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-xs shadow-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                  />

                </div>

                <select
                  value={selectedJobId}
                  onChange={(event) =>
                    setSelectedJobId(event.target.value)
                  }
                  className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-xs shadow-sm outline-none transition focus:border-[#2688ef] md:w-[300px]"
                >
                  <option value="">
                    Alla rekryteringar
                  </option>

                  {jobs.map((job) => (
                    <option
                      key={job.id}
                      value={job.id}
                    >
                      {job.title}
                    </option>
                  ))}
                </select>

              </div>

              {loading ? (

                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">

                  <p className="text-xs text-slate-500">
                    Laddar kandidatflöde...
                  </p>

                </div>

              ) : (

                <div className="overflow-x-auto pb-5">

                  <div className="grid min-w-[1240px] grid-cols-6 gap-3">

                    {stages.map((stage) => {

                      const stageCards =
                        getCardsForStage(stage.id);

                      return (

                        <div
                          key={stage.id}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect =
                              "move";
                          }}
                          onDrop={(event) =>
                            handleDrop(event, stage.id)
                          }
                          className="min-h-[520px] rounded-xl border border-slate-200 bg-[#f1f3f6] p-2.5"
                        >

                          <div className="mb-2.5 flex items-center justify-between px-1">

                            <div className="flex items-center gap-1.5">

                              <span
                                className={`h-2.5 w-2.5 rounded-full ${stage.color}`}
                              />

                              <h2 className="text-xs font-bold text-slate-800">
                                {stage.name}
                              </h2>

                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-semibold text-slate-500">
                                {stageCards.length}
                              </span>

                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setCandidateSearch("");
                                setJobSearch("");
                                setAddToStage(stage.id);
                              }}
                              className="text-lg font-medium text-slate-500 transition hover:text-slate-900"
                              title="Lägg till kandidat"
                            >
                              +
                            </button>

                          </div>

                          <div className="space-y-2.5">

                            {stageCards.map((card) => (

                              <div
                                key={card.application.id}
                                draggable
                                onDragStart={(event) =>
                                  handleDragStart(
                                    event,
                                    card.application.id
                                  )
                                }
                                className={`cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
                                  movingId ===
                                  card.application.id
                                    ? "opacity-50"
                                    : ""
                                }`}
                              >

                                <div className="flex items-start justify-between gap-2">

                                  <div className="flex min-w-0 items-center gap-2.5">

                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dceeff] text-[11px] font-bold text-[#1468b8]">
                                      {getInitials(
                                        card.candidate.name
                                      )}
                                    </div>

                                    <div className="min-w-0">

                                      <p className="whitespace-nowrap text-xs font-bold text-slate-800">
                                        {formatName(card.candidate.name)}
                                      </p>

                                      <p className="mt-0.5 truncate text-[10px] text-slate-500">
                                        {card.job.title}
                                      </p>

                                    </div>

                                  </div>

                                </div>

                                <div className="mt-3 flex flex-wrap gap-1.5">

                                  {card.candidate.email && (
                                    <span className="max-w-full truncate rounded-md bg-slate-100 px-2 py-1 text-[9px] font-medium text-slate-500">
                                      {card.candidate.email}
                                    </span>
                                  )}

                                  {(card.candidate.linkedin_url ||
                                    card.candidate.cv_url) && (

                                    <div className="basis-full flex items-center gap-2">

                                      {card.candidate.linkedin_url && (
                                        <a
                                          href={card.candidate.linkedin_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                          className="text-[9px] font-semibold text-[#2688ef] hover:underline"
                                        >
                                          LinkedIn
                                        </a>
                                      )}

                                      {card.candidate.cv_url && (
                                        <a
                                          href={card.candidate.cv_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                          className="text-[9px] font-semibold text-[#2688ef] hover:underline"
                                        >
                                          CV
                                        </a>
                                      )}

                                    </div>

                                  )}

                                </div>

                                <div className="my-3 border-t border-slate-200" />

                                <div className="flex items-center justify-between">

                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold ${
                                      card.application.ai_score !== null &&
                                      card.application.ai_score !== undefined
                                        ? "bg-[#dceeff] text-[#2688ef]"
                                        : "bg-slate-100 text-slate-500"
                                    }`}
                                  >

                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${
                                        card.application.ai_score !== null &&
                                        card.application.ai_score !== undefined
                                          ? "bg-[#2688ef]"
                                          : "bg-slate-400"
                                      }`}
                                    />

                                    {card.application.ai_score !== null &&
                                    card.application.ai_score !== undefined
                                      ? `${card.application.ai_score}% Match`
                                      : "Ej bedömd"}

                                  </span>

                                  <a
                                    href="/candidates"
                                    onClick={(event) =>
                                      event.stopPropagation()
                                    }
                                    className="text-slate-400 transition hover:text-[#2688ef]"
                                    title="Visa kandidat"
                                    aria-label="Visa kandidat"
                                  >
                                    ➚
                                  </a>

                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      removeCandidate(card.application.id);
                                    }}
                                    className="text-slate-400 transition hover:text-red-500"
                                    title="Ta bort kandidat"
                                    aria-label="Ta bort kandidat"
                                  >
                                    ×
                                  </button>

                                </div>

                              </div>

                            ))}

                            {stageCards.length === 0 && (
                              <div className="rounded-lg border border-dashed border-slate-300 bg-white/50 px-3 py-8 text-center">
                                <p className="text-[10px] text-slate-400">
                                  Dra en kandidat hit
                                </p>
                              </div>
                            )}

                          </div>

                        </div>

                      );

                    })}

                  </div>

                </div>

              )}

              {addToStage && (

                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">

                  <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">

                    <div className="mb-4 flex items-start justify-between gap-4">

                      <div>

                        <h2 className="text-base font-bold text-slate-900">
                          Lägg till kandidat
                        </h2>

                        <p className="mt-1 text-xs text-slate-500">

                          {stages.find(
                            (stage) =>
                              stage.id === addToStage
                          )?.name}

                          {selectedJobId
                            ? ` · ${
                                jobs.find(
                                  (job) =>
                                    job.id === selectedJobId
                                )?.title || ""
                              }`
                            : ""}

                        </p>

                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCandidateId(null);
                          setCandidateSearch("");
                          setJobSearch("");
                          setAddToStage(null);
                        }}
                        className="text-xl leading-none text-slate-400 transition hover:text-slate-800"
                        aria-label="Stäng"
                      >
                        ×
                      </button>

                    </div>

                    {!selectedCandidateId ? (

                      <div>

                        <input
                          type="text"
                          value={candidateSearch}
                          onChange={(event) =>
                            setCandidateSearch(event.target.value)
                          }
                          placeholder="Sök kandidat..."
                          className="mb-3 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs shadow-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                        />

                        <div className="max-h-80 space-y-1.5 overflow-y-auto">

                          {getAvailableCandidates(addToStage)
                            .filter((candidate) =>
                              candidate.name
                                .toLowerCase()
                                .includes(
                                  candidateSearch
                                    .trim()
                                    .toLowerCase()
                                )
                            )
                            .map((candidate) => (

                              <button
                                key={candidate.id}
                                type="button"
                                onClick={() =>
                                  setSelectedCandidateId(
                                    candidate.id
                                  )
                                }
                                className="flex w-full items-center rounded-xl border border-slate-200 px-3 py-3 text-left transition hover:bg-slate-50"
                              >
                                <span className="text-sm font-semibold text-slate-800">
                                  {formatName(candidate.name)}
                                </span>
                              </button>

                            ))}

                          {getAvailableCandidates(addToStage).filter(
                            (candidate) =>
                              candidate.name
                                .toLowerCase()
                                .includes(
                                  candidateSearch
                                    .trim()
                                    .toLowerCase()
                                )
                          ).length === 0 && (

                            <div className="rounded-xl bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                              Inga kandidater hittades.
                            </div>

                          )}

                        </div>

                      </div>

                    ) : (

                      <div>

                        <div className="mb-3 rounded-xl bg-slate-50 px-4 py-3">

                          <p className="text-[10px] font-medium text-slate-500">
                            Kandidat
                          </p>

                          <p className="mt-0.5 text-sm font-semibold text-slate-800">
                            {formatName(
                              candidates.find(
                                (candidate) =>
                                  candidate.id ===
                                  selectedCandidateId
                              )?.name || ""
                            )}
                          </p>

                        </div>

                        <p className="mb-2 text-xs font-semibold text-slate-700">
                          Välj rekrytering
                        </p>

                        <input
                          type="text"
                          value={jobSearch}
                          onChange={(event) =>
                            setJobSearch(event.target.value)
                          }
                          placeholder="Sök rekrytering..."
                          className="mb-3 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs shadow-sm outline-none transition focus:border-[#2688ef] focus:ring-2 focus:ring-blue-100"
                        />

                        <div className="max-h-80 space-y-1.5 overflow-y-auto">

                          {jobs
                            .filter((job) =>
                              job.title
                                .toLowerCase()
                                .includes(
                                  jobSearch
                                    .trim()
                                    .toLowerCase()
                                )
                            )
                            .map((job) => {
                              return (
                                <button
                                  key={job.id}
                                  type="button"
                                  onClick={() =>
                                    addCandidateToStage(
                                      selectedCandidateId,
                                      addToStage,
                                      job.id
                                    )
                                  }
                                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-left transition hover:bg-slate-50"
                                >
                                  <span className="text-sm font-semibold text-slate-800">
                                    {job.title}
                                  </span>
                                </button>
                              );
                            })}

                          {jobs.filter((job) =>
                            job.title
                              .toLowerCase()
                              .includes(
                                jobSearch
                                  .trim()
                                  .toLowerCase()
                              )
                          ).length === 0 && (

                            <div className="rounded-xl bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                              Inga rekryteringar hittades.
                            </div>

                          )}

                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCandidateId(null);
                            setJobSearch("");
                          }}
                          className="mt-3 text-xs font-semibold text-slate-500 transition hover:text-slate-900"
                        >
                          ← Tillbaka till kandidater
                        </button>

                      </div>

                    )}

                  </div>

                </div>

              )}

            </div>

          </main>

        </section>

      </div>
    </main>
  );
}