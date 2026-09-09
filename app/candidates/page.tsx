"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Candidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  cv_url: string | null;
  created_at: string;
};

type Job = {
  id: string;
  title: string;
};

type Application = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
  ai_score: number | null;
  ai_summary: string | null;
  ai_strengths: string | null;
  ai_concerns: string | null;
  ai_recommendation: string | null;
  ai_assessed_at: string | null;
};

const statuses = [
  "new",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
];

const statusNames: Record<string, string> = {
  new: "Ny",
  screening: "Urval",
  interview: "Intervju",
  offer: "Erbjudande",
  hired: "Anställd",
  rejected: "Avvisad",
};

const statusStyles: Record<string, string> = {
  new: "bg-slate-400 text-white",
  screening: "bg-blue-500 text-white",
  interview: "bg-purple-500 text-white",
  offer: "bg-yellow-500 text-white",
  hired: "bg-emerald-500 text-white",
  rejected: "bg-red-500 text-white",
};

const CACHE_KEY = "hireflow-candidates-cache";

type CandidatesCache = {
  candidates: Candidate[];
  jobs: Job[];
  applications: Application[];
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getAvatarStyle(name: string) {
  const styles = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-violet-100 text-violet-700",
    "bg-amber-100 text-amber-700",
    "bg-pink-100 text-pink-700",
    "bg-cyan-100 text-cyan-700",
  ];

  const value = name
    .split("")
    .reduce(
      (total, character) =>
        total + character.charCodeAt(0),
      0
    );

  return styles[value % styles.length];
}

function getCachedData(): CandidatesCache | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = sessionStorage.getItem(CACHE_KEY);

    if (!cached) {
      return null;
    }

    return JSON.parse(cached);
  } catch {
    return null;
  }
}

function saveCachedData(data: CandidatesCache) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify(data)
    );
  } catch {
    // Ignore cache errors.
  }
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editingCandidate, setEditingCandidate] =
    useState<Candidate | null>(null);

  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState("");

  const [role, setRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

  useEffect(() => {
    startPage();
  }, []);

  async function startPage() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      window.location.href = "/";
      return;
    }

    const { data: profile } = await supabase.rpc("get_my_profile");

    setRole(profile?.role ?? null);
    setRoleLoaded(true);

    const cached = getCachedData();

    if (cached) {
      setCandidates(cached.candidates);
      setJobs(cached.jobs);
      setApplications(cached.applications);
      setCheckingAuth(false);

      loadData(true);
      return;
    }

    setCheckingAuth(false);
    await loadData(false);
  }

  async function loadData(silent = false) {
    if (!silent) {
      setError("");
    }

    const [
      { data: candidateData, error: candidateError },
      { data: jobData, error: jobError },
      { data: applicationData, error: applicationError },
    ] = await Promise.all([
      supabase
        .from("candidates")
        .select(
          "id, name, email, phone, linkedin_url, cv_url, created_at"
        )
        .order("created_at", {
          ascending: false,
        }),

      supabase
        .from("jobs")
        .select("id, title")
        .order("created_at", {
          ascending: false,
        }),

      supabase
        .from("applications")
        .select(
          "id, job_id, candidate_id, status, ai_score, ai_summary, ai_strengths, ai_concerns, ai_recommendation, ai_assessed_at"
        ),
    ]);

    if (candidateError) {
      if (!silent) {
        setError(candidateError.message);
      }
      return;
    }

    if (jobError) {
      if (!silent) {
        setError(jobError.message);
      }
      return;
    }

    if (applicationError) {
      if (!silent) {
        setError(applicationError.message);
      }
      return;
    }

    const newData: CandidatesCache = {
      candidates: candidateData || [],
      jobs: jobData || [],
      applications: applicationData || [],
    };

    setCandidates(newData.candidates);
    setJobs(newData.jobs);
    setApplications(newData.applications);

    saveCachedData(newData);
  }

  async function getCustomerId() {
    const { data, error } =
      await supabase.rpc("get_my_profile");

    if (error || !data) {
      throw new Error(
        error?.message ||
          "Kunde inte hitta användarprofilen."
      );
    }

    return data.customer_id ?? null;
  }

  function formatCandidateName(name: string) {
    return name
      .toLowerCase()
      .replace(/(^|\s)(\S)/g, (_, space, letter) =>
        space + letter.toUpperCase()
      );
  }

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setLinkedinUrl("");
    setCvFile(null);
    setJobId("");
    setSelectedJobIds([]);
    setEditingCandidate(null);
    setShowForm(false);
  }

  function startEditing(candidate: Candidate) {
    setEditingCandidate(candidate);
    setName(candidate.name);
    setEmail(candidate.email || "");
    setPhone(candidate.phone || "");
    setLinkedinUrl(candidate.linkedin_url || "");
    setCvFile(null);

    const candidateApplications = applications.filter(
      (item) => item.candidate_id === candidate.id
    );

    setJobId(candidateApplications[0]?.job_id || "");
    setSelectedJobIds(candidateApplications.map((item) => item.job_id));
    setShowForm(true);
    setError("");

    window.setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }, 50);
  }

  async function uploadCv(file: File, candidateId: string) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const filePath = `${candidateId}/${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("candidate-cvs")
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage
      .from("candidate-cvs")
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  async function saveCandidate(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const cleanName = name.trim();

      if (!cleanName) {
        throw new Error(
          "Ange kandidatens namn."
        );
      }

      if (selectedJobIds.length === 0) {
        throw new Error(
          "Välj minst en rekrytering för kandidaten."
        );
      }

      if (editingCandidate) {
        const {
          error: candidateError,
        } = await supabase
          .from("candidates")
          .update({
            name: cleanName,
            email: email.trim() || null,
            phone: phone.trim() || null,
            linkedin_url:
              linkedinUrl.trim() || null,
          })
          .eq("id", editingCandidate.id);

        if (candidateError) {
          throw new Error(
            candidateError.message
          );
        }

        const updatedCandidate = {
          ...editingCandidate,
          name: cleanName,
          email: email.trim() || null,
          phone: phone.trim() || null,
          linkedin_url:
            linkedinUrl.trim() || null,
        };

        if (cvFile) {
          const uploadedCvUrl = await uploadCv(
            cvFile,
            editingCandidate.id
          );

          const { error: cvUpdateError } = await supabase
            .from("candidates")
            .update({ cv_url: uploadedCvUrl })
            .eq("id", editingCandidate.id);

          if (cvUpdateError) {
            throw new Error(cvUpdateError.message);
          }

          updatedCandidate.cv_url = uploadedCvUrl;
        }

        const existingApplications = applications.filter(
          (application) =>
            application.candidate_id === editingCandidate.id
        );

        for (const existingApplication of existingApplications) {
          if (!selectedJobIds.includes(existingApplication.job_id)) {
            const { error: deleteApplicationError } = await supabase
              .from("applications")
              .delete()
              .eq("id", existingApplication.id);

            if (deleteApplicationError) {
              throw new Error(deleteApplicationError.message);
            }
          }
        }

        for (const selectedJobId of selectedJobIds) {
          const existingApplication = existingApplications.find(
            (application) =>
              application.job_id === selectedJobId
          );

          let applicationForAssessment: Application | null =
            existingApplication || null;

          if (!existingApplication) {
            const { data: databaseApplication, error: databaseApplicationError } =
              await supabase
                .from("applications")
                .select(
                  "id, job_id, candidate_id, status, ai_score, ai_summary, ai_strengths, ai_concerns, ai_recommendation, ai_assessed_at"
                )
                .eq("job_id", selectedJobId)
                .eq("candidate_id", editingCandidate.id)
                .maybeSingle();

            if (databaseApplicationError) {
              throw new Error(databaseApplicationError.message);
            }

            if (databaseApplication) {
              applicationForAssessment = databaseApplication;
            } else {
              const {
                data: createdApplication,
                error: applicationError,
              } = await supabase
                .from("applications")
                .insert({
                  job_id: selectedJobId,
                  candidate_id: editingCandidate.id,
                  status: "new",
                })
                .select(
                  "id, job_id, candidate_id, status, ai_score, ai_summary, ai_strengths, ai_concerns, ai_recommendation, ai_assessed_at"
                )
                .single();

              if (applicationError) {
                throw new Error(applicationError.message);
              }

              applicationForAssessment = createdApplication;
            }
          }

          if (applicationForAssessment) {
            await assessApplication(
              applicationForAssessment,
              updatedCandidate
            );
          }
        }
      } else {
        const { data: selectedJobs, error: selectedJobsError } =
          await supabase
            .from("jobs")
            .select("id, customer_id")
            .in("id", selectedJobIds);

        if (
          selectedJobsError ||
          !selectedJobs ||
          selectedJobs.length !== selectedJobIds.length
        ) {
          throw new Error(
            selectedJobsError?.message ||
              "Kunde inte hitta rekryteringarna."
          );
        }

        const customerIds = [
          ...new Set(
            selectedJobs
              .map((job) => job.customer_id)
              .filter(Boolean)
          ),
        ];

        if (customerIds.length > 1) {
          throw new Error(
            "Välj rekryteringar från samma kund."
          );
        }

        const customerId =
          customerIds[0] ?? await getCustomerId();

        const {
          data: candidate,
          error: candidateError,
        } = await supabase
          .from("candidates")
          .insert({
            customer_id: customerId,
            name: cleanName,
            email: email.trim() || null,
            phone: phone.trim() || null,
            linkedin_url:
              linkedinUrl.trim() || null,
          })
          .select(
            "id, name, email, phone, linkedin_url, cv_url, created_at"
          )
          .single();

        if (
          candidateError ||
          !candidate
        ) {
          throw new Error(
            candidateError?.message ||
              "Kunde inte skapa kandidaten."
          );
        }

        if (!cvFile) {
          throw new Error("Ladda upp kandidatens CV.");
        }

        const uploadedCvUrl = await uploadCv(
          cvFile,
          candidate.id
        );

        const { error: cvUpdateError } = await supabase
          .from("candidates")
          .update({ cv_url: uploadedCvUrl })
          .eq("id", candidate.id);

        if (cvUpdateError) {
          throw new Error(cvUpdateError.message);
        }

        candidate.cv_url = uploadedCvUrl;

        for (const selectedJobId of selectedJobIds) {
          const { data: existingApplication, error: existingApplicationError } =
            await supabase
              .from("applications")
              .select(
                "id, job_id, candidate_id, status, ai_score, ai_summary, ai_strengths, ai_concerns, ai_recommendation, ai_assessed_at"
              )
              .eq("job_id", selectedJobId)
              .eq("candidate_id", candidate.id)
              .maybeSingle();

          if (existingApplicationError) {
            throw new Error(existingApplicationError.message);
          }

          let applicationForAssessment = existingApplication;

          if (!applicationForAssessment) {
            const {
              data: createdApplication,
              error: applicationError,
            } = await supabase
              .from("applications")
              .insert({
                job_id: selectedJobId,
                candidate_id: candidate.id,
                status: "new",
              })
              .select(
                "id, job_id, candidate_id, status, ai_score, ai_summary, ai_strengths, ai_concerns, ai_recommendation, ai_assessed_at"
              )
              .single();

            if (applicationError) {
              throw new Error(applicationError.message);
            }

            applicationForAssessment = createdApplication;
          }

          if (applicationForAssessment) {
            await assessApplication(
              applicationForAssessment,
              candidate
            );
          }
        }
      }

      resetForm();
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

  async function deleteCandidate(
    candidateId: string
  ) {
    const confirmed = window.confirm(
      "Är du säker på att du vill ta bort kandidaten?"
    );

    if (!confirmed) {
      return;
    }

    setError("");

    const { error } = await supabase
      .from("candidates")
      .delete()
      .eq("id", candidateId);

    if (error) {
      setError(error.message);
      return;
    }

    await loadData();
  }

  async function changeApplicationStatus(
    applicationId: string,
    status: string
  ) {
    setError("");

    const { error } = await supabase
      .from("applications")
      .update({ status })
      .eq("id", applicationId);

    if (error) {
      setError(error.message);
      return;
    }

    await loadData();
  }

  async function assessApplication(
    application: Application,
    candidate: Candidate
  ) {
    if (!candidate.cv_url) {
      throw new Error("Kandidaten saknar CV.");
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Du är inte inloggad.");
      }

      const response = await fetch(
        "/api/ai/assess-cv",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            candidateId: candidate.id,
            jobId: application.job_id,
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || "AI-bedömningen misslyckades."
        );
      }

      if (!result.application) {
        throw new Error("AI-bedömningen gav inget resultat.");
      }

      setApplications((current) =>
        current.map((item) =>
          item.id === result.application.id
            ? result.application
            : item
        )
      );
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "AI-bedömningen misslyckades."
      );
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    if (typeof window !== "undefined") {
      sessionStorage.removeItem(CACHE_KEY);
    }

    window.location.href = "/";
  }

  function getCandidateApplications(
    candidateId: string
  ) {
    return applications.filter(
      (application) =>
        application.candidate_id ===
        candidateId
    );
  }

  function getCandidateJob(
    candidateId: string
  ) {
    const application = applications.find(
      (item) =>
        item.candidate_id === candidateId
    );

    if (!application) {
      return null;
    }

    return (
      jobs.find(
        (job) =>
          job.id === application.job_id
      ) || null
    );
  }

  function getCandidateApplication(
    candidateId: string
  ) {
    return applications.find(
      (application) =>
        application.candidate_id ===
        candidateId
    );
  }

  const filteredCandidates = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return candidates.filter(
      (candidate) => {
        const matchesSearch =
          !normalizedSearch ||
          candidate.name
            .toLowerCase()
            .includes(normalizedSearch) ||
          candidate.email
            ?.toLowerCase()
            .includes(normalizedSearch);

        const candidateApplications =
          getCandidateApplications(
            candidate.id
          );

        const matchesJob =
          !selectedJobId ||
          candidateApplications.some(
            (application) =>
              application.job_id ===
              selectedJobId
          );

        const matchesStatus =
          !selectedStatus ||
          candidateApplications.some(
            (application) =>
              application.status ===
              selectedStatus
          );

        return (
          matchesSearch &&
          matchesJob &&
          matchesStatus
        );
      }
    );
  }, [
    candidates,
    applications,
    search,
    selectedJobId,
    selectedStatus,
  ]);

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f9fb]">
        <div className="text-xs font-medium text-slate-500">
          Laddar HireFlow...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8f9fb] text-[#0b1220]">
      <div className="flex min-h-screen">

        <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 shrink-0 bg-[#0f151d] text-white md:flex md:flex-col">

          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3994ef]">
                <span className="text-xl font-bold">
                  ✦
                </span>
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
              className="mb-1.5 flex items-center justify-between rounded-lg border border-white bg-[#202832] px-3 py-3 text-sm font-bold text-white"
            >
              <span className="flex items-center gap-3">
                <span>♙</span>
                Kandidater
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
                className="whitespace-nowrap rounded-lg bg-[#202832] px-2.5 py-1.5 text-xs font-semibold text-white"
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

              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

                <div>

                  <h1 className="text-[32px] font-semibold tracking-tight text-[#101820] md:text-[36px]">
                    Kandidater
                  </h1>

                  <p className="mt-2 text-sm text-slate-500 md:text-[15px]">
                    En komplett översikt över alla kandidater i dina rekryteringar.
                  </p>

                </div>

                <button
                  onClick={() => {
                    if (showForm) {
                      resetForm();
                    } else {
                      setShowForm(true);
                      setError("");
                    }
                  }}
                  className="inline-flex items-center justify-center gap-3 rounded-xl bg-[#18283a] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#101c2a]"
                >
                  {showForm
                    ? "Stäng"
                    : "+ Lägg till kandidat"}
                </button>

              </div>

            </div>

          </header>

          <div className="px-6 py-7 md:px-12 md:py-8">

            <div className="mx-auto max-w-[1380px]">

              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}

              {showForm && (
                <form
                  onSubmit={saveCandidate}
                  className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
                >

                  <div className="mb-5">

                    <p className="text-xs font-bold uppercase tracking-wide text-[#2587ed]">
                      KANDIDAT
                    </p>

                    <h2 className="mt-1 text-base font-bold">
                      {editingCandidate
                        ? "Redigera kandidat"
                        : "Lägg till kandidat"}
                    </h2>

                  </div>

                  <div className="grid gap-4 md:grid-cols-2">

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">
                        Namn
                      </label>

                      <input
                        type="text"
                        value={name}
                        onChange={(event) =>
                          setName(formatCandidateName(event.target.value))
                        }
                        required
                        placeholder="Anna Andersson"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#2587ed] focus:ring-2 focus:ring-blue-100"
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
                        placeholder="anna@email.se"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#2587ed] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">
                        Telefon
                      </label>

                      <input
                        type="tel"
                        value={phone}
                        onChange={(event) =>
                          setPhone(event.target.value)
                        }
                        placeholder="070-123 45 67"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#2587ed] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">
                        LinkedIn
                      </label>

                      <input
                        type="url"
                        value={linkedinUrl}
                        onChange={(event) =>
                          setLinkedinUrl(event.target.value)
                        }
                        placeholder="https://linkedin.com/in/..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#2587ed] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">
                        CV
                      </label>

                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={(event) =>
                          setCvFile(event.target.files?.[0] || null)
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold focus:border-[#2587ed] focus:ring-2 focus:ring-blue-100"
                      />

                      {editingCandidate?.cv_url && !cvFile ? (
                        <p className="mt-1.5 text-[10px] text-slate-400">
                          CV uppladdat. Välj en ny fil för att byta CV.
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold">
                        Rekryteringar
                      </label>

                      <div className="rounded-lg border border-slate-300 bg-white p-2">

                        <div className="mb-2 flex items-center justify-between px-1">

                          <p className="text-[10px] text-slate-400">
                            Välj en eller flera rekryteringar
                          </p>

                          <p className="text-[10px] font-semibold text-[#2587ed]">
                            {selectedJobIds.length} valda
                          </p>

                        </div>

                        <div className="max-h-48 space-y-1.5 overflow-y-auto">

                          {jobs.map((job) => {
                            const selected = selectedJobIds.includes(job.id);

                            return (
                              <button
                                key={job.id}
                                type="button"
                                onClick={() =>
                                  setSelectedJobIds((current) =>
                                    selected
                                      ? current.filter((id) => id !== job.id)
                                      : [...current, job.id]
                                  )
                                }
                                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                                  selected
                                    ? "border-[#2688ef] bg-blue-50"
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                              >

                                <span className="text-xs font-semibold text-slate-700">
                                  {job.title}
                                </span>

                                <span
                                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                                    selected
                                      ? "border-[#2688ef] bg-[#2688ef] text-white"
                                      : "border-slate-300 bg-white text-transparent"
                                  }`}
                                >
                                  ✓
                                </span>

                              </button>
                            );
                          })}

                        </div>

                      </div>

                    </div>

                  </div>

                  <div className="mt-5 flex flex-wrap gap-2.5">

                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-lg bg-[#18283a] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#101c2a] disabled:opacity-50"
                    >
                      {loading
                        ? "Sparar..."
                        : editingCandidate
                          ? "Spara ändringar"
                          : "Skapa kandidat"}
                    </button>

                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Avbryt
                    </button>

                  </div>

                </form>
              )}

              <div className="mb-4 flex flex-col gap-2.5 lg:flex-row">

                <div className="relative flex-1">

                  <input
                    type="text"
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                    placeholder="Sök kandidat..."
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-[#2587ed] focus:ring-2 focus:ring-blue-100"
                  />

                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowFilters(!showFilters)
                  }
                  className="h-11 rounded-lg border border-slate-300 bg-white px-5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {showFilters ? "Stäng filter" : "Filter"}
                </button>

              </div>

              {showFilters && (
                <div className="mb-5 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      Rekrytering
                    </label>

                    <select
                      value={selectedJobId}
                      onChange={(event) =>
                        setSelectedJobId(event.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#2587ed]"
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

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold">
                      Status
                    </label>

                    <select
                      value={selectedStatus}
                      onChange={(event) =>
                        setSelectedStatus(event.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#2587ed]"
                    >
                      <option value="">
                        Alla statusar
                      </option>

                      {statuses.map((status) => (
                        <option
                          key={status}
                          value={status}
                        >
                          {statusNames[status]}
                        </option>
                      ))}
                    </select>
                  </div>

                </div>
              )}

              <div className="mb-3 flex items-center justify-between">

                <p className="text-xs font-medium text-slate-500">

                  Visar{" "}

                  <span className="font-bold text-slate-800">
                    {filteredCandidates.length}
                  </span>

                  {" "}av {candidates.length} kandidater

                </p>

              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

                <div className="hidden grid-cols-[2fr_1.4fr_1fr_1fr_180px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 md:grid">

                  <div>
                    Kandidat
                  </div>

                  <div>
                    Rekrytering
                  </div>

                  <div>
                    AI-match
                  </div>

                  <div>
                    Status
                  </div>

                  <div className="text-right">
                    Åtgärder
                  </div>

                </div>

                {filteredCandidates.length === 0 ? (

                  <div className="px-5 py-14 text-center">

                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-xl">
                      ♙
                    </div>

                    <h3 className="mt-4 text-sm font-bold">
                      Inga kandidater hittades
                    </h3>

                    <p className="mx-auto mt-1.5 max-w-md text-xs text-white/70">
                      Lägg till en kandidat eller ändra dina sökfilter.
                    </p>

                  </div>

                ) : (

                  <div>

                    {filteredCandidates.map(
                      (candidate) => {

                        const candidateApplications =
                          getCandidateApplications(candidate.id);

                        return (

                          <div
                            key={candidate.id}
                            className="grid gap-4 border-b border-slate-100 px-5 py-5 last:border-b-0 md:grid-cols-[2fr_1.4fr_1fr_1fr_180px] md:items-center"
                          >

                            <div className="flex min-w-0 items-center gap-3">

                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getAvatarStyle(
                                  candidate.name
                                )}`}
                              >
                                {getInitials(
                                  candidate.name
                                )}
                              </div>

                              <div className="min-w-0">

                                <p className="truncate text-sm font-bold text-slate-900">
                                  {formatCandidateName(candidate.name)}
                                </p>

                                <p className="mt-0.5 truncate text-xs text-slate-500">
                                  {candidate.email ||
                                    "Ingen e-post"}
                                </p>

                                {(candidate.linkedin_url ||
                                  candidate.cv_url) && (
                                  <div className="mt-1 flex items-center gap-3">

                                    {candidate.linkedin_url && (
                                      <a
                                        href={candidate.linkedin_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs font-medium text-[#2587ed] hover:underline"
                                      >
                                        LinkedIn
                                      </a>
                                    )}

                                    {candidate.cv_url && (
                                      <a
                                        href={candidate.cv_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs font-medium text-[#2587ed] hover:underline"
                                      >
                                        CV
                                      </a>
                                    )}

                                  </div>
                                )}

                              </div>

                            </div>

                            <div>

                              <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400 md:hidden">
                                Rekrytering
                              </p>

                              {getCandidateApplications(candidate.id).length > 0 ? (

                                <div className="flex flex-col gap-1">

                                  {getCandidateApplications(candidate.id).map((candidateApplication) => {
                                    const candidateJob = jobs.find(
                                      (item) => item.id === candidateApplication.job_id
                                    );

                                    return candidateJob ? (
                                      <p
                                        key={candidateApplication.id}
                                        className="text-xs font-medium text-slate-700"
                                      >
                                        {candidateJob.title}
                                      </p>
                                    ) : null;
                                  })}

                                </div>

                              ) : (

                                <p className="text-xs text-slate-400">
                                  Ingen rekrytering
                                </p>

                              )}

                            </div>

                            <div>

                              <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400 md:hidden">
                                AI-match
                              </p>

                              {getCandidateApplications(candidate.id).length > 0 ? (

                                <div className="flex flex-col items-start gap-1">

                                  {getCandidateApplications(candidate.id).map((candidateApplication) => (
                                    <span
                                      key={candidateApplication.id}
                                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                        candidateApplication.ai_score !== null &&
                                        candidateApplication.ai_score !== undefined
                                          ? "bg-[#2688ef] text-white"
                                          : "bg-slate-100 text-slate-500"
                                      }`}
                                    >
                                      {candidateApplication.ai_score !== null &&
                                      candidateApplication.ai_score !== undefined
                                        ? `${candidateApplication.ai_score}%`
                                        : "Ej bedömd"}
                                    </span>
                                  ))}

                                </div>

                              ) : (

                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                                  Ej bedömd
                                </span>

                              )}

                            </div>

                            <div>

                              <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400 md:hidden">
                                Status
                              </p>

                              {candidateApplications.length > 0 ? (

                                <div className="flex flex-col items-start gap-1">

                                  {candidateApplications.map((candidateApplication) => (
                                    <span
                                      key={candidateApplication.id}
                                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                        statusStyles[
                                          candidateApplication.status
                                        ] ||
                                        "bg-slate-100 text-slate-700"
                                      }`}
                                    >
                                      {statusNames[
                                        candidateApplication.status
                                      ] || candidateApplication.status}
                                    </span>
                                  ))}

                                </div>

                              ) : (

                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                                  Ej kopplad
                                </span>

                              )}

                            </div>

                            <div className="flex flex-wrap justify-start gap-1.5 md:justify-end">

                              <button
                                onClick={() =>
                                  startEditing(
                                    candidate
                                  )
                                }
                                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                Redigera
                              </button>

                              <button
                                onClick={() =>
                                  deleteCandidate(
                                    candidate.id
                                  )
                                }
                                className="rounded-md border border-red-200 px-2.5 py-1.5 text-[10px] font-semibold text-red-600 transition hover:bg-red-50"
                              >
                                Ta bort
                              </button>

                            </div>

                          </div>

                        );
                      }
                    )}

                  </div>

                )}

              </div>

            </div>

          </div>

        </section>

      </div>
    </main>
  );
}