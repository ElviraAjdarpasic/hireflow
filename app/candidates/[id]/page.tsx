"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Candidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  cv_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Job = {
  id: string;
  title: string;
  description: string | null;
};

type Application = {
  id: string;
  job_id: string;
  status: string;
  ai_score: number | null;
  ai_summary: string | null;
  ai_strengths: string | null;
  ai_concerns: string | null;
  ai_recommendation: string | null;
  ai_assessed_at: string | null;
};

const stages = [
  { value: "new", label: "Ny" },
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Intervju" },
  { value: "offer", label: "Erbjudande" },
  { value: "hired", label: "Anställd" },
  { value: "rejected", label: "Avvisad" },
];

const statusStyles: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  screening: "bg-amber-50 text-amber-700",
  interview: "bg-violet-50 text-violet-700",
  offer: "bg-blue-50 text-blue-700",
  hired: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

function splitLines(value: string | null) {
  return (value || "")
    .split("\n")
    .map((item) => item.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
}

export default function CandidateDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");

  useEffect(() => {
    if (id) {
      void loadData();
    }
  }, [id]);

  async function loadData() {
    setLoading(true);
    setError("");

    const [
      candidateResult,
      applicationsResult,
      jobsResult,
    ] = await Promise.all([
      supabase
        .from("candidates")
        .select(
          "id,name,email,phone,linkedin_url,cv_url,notes,created_at,updated_at"
        )
        .eq("id", id)
        .single(),

      supabase
        .from("applications")
        .select(
          "id,job_id,status,ai_score,ai_summary,ai_strengths,ai_concerns,ai_recommendation,ai_assessed_at"
        )
        .eq("candidate_id", id),

      supabase
        .from("jobs")
        .select("id,title,description")
        .order("created_at", { ascending: false }),
    ]);

    if (candidateResult.error || !candidateResult.data) {
      setError(
        candidateResult.error?.message ||
          "Kandidaten kunde inte hittas."
      );
      setLoading(false);
      return;
    }

    if (applicationsResult.error) {
      setError(applicationsResult.error.message);
      setLoading(false);
      return;
    }

    if (jobsResult.error) {
      setError(jobsResult.error.message);
      setLoading(false);
      return;
    }

    setCandidate(candidateResult.data);
    setApplications(applicationsResult.data || []);
    setJobs(jobsResult.data || []);

    setName(candidateResult.data.name);
    setEmail(candidateResult.data.email || "");
    setPhone(candidateResult.data.phone || "");
    setLinkedinUrl(candidateResult.data.linkedin_url || "");
    setNotes(candidateResult.data.notes || "");

    setSelectedJobId(
      applicationsResult.data?.[0]?.job_id || ""
    );

    setLoading(false);
  }

  async function saveProfile(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!candidate) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const { data, error: updateError } = await supabase
      .from("candidates")
      .update({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        linkedin_url: linkedinUrl.trim() || null,
        notes: notes.trim() || null,
      })
      .eq("id", candidate.id)
      .select(
        "id,name,email,phone,linkedin_url,cv_url,notes,created_at,updated_at"
      )
      .single();

    if (updateError || !data) {
      setError(
        updateError?.message ||
          "Kunde inte spara kandidaten."
      );
      setSaving(false);
      return;
    }

    setCandidate(data);
    setSuccess("Kandidatprofilen är sparad.");
    setSaving(false);
  }

  async function updateStatus(
    applicationId: string,
    status: string
  ) {
    setError("");

    const { error: updateError } = await supabase
      .from("applications")
      .update({ status })
      .eq("id", applicationId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setApplications((current) =>
      current.map((application) =>
        application.id === applicationId
          ? { ...application, status }
          : application
      )
    );
  }

  async function assessCv(jobIdOverride?: string) {
    if (!candidate?.cv_url) {
      setError(
        "Ladda upp ett CV innan du kör AI-bedömningen."
      );
      return;
    }

    const assessmentJobId =
      jobIdOverride || selectedJobId;

    if (!assessmentJobId) {
      setError(
        "Välj en rekrytering att bedöma kandidaten mot."
      );
      return;
    }

    setSelectedJobId(assessmentJobId);
    setAssessing(true);
    setError("");
    setSuccess("");

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
            jobId: assessmentJobId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "AI-bedömningen misslyckades."
        );
      }

      setApplications((current) =>
        current.map((application) =>
          application.id === result.application.id
            ? result.application
            : application
        )
      );

      setSuccess(
        "AI-bedömningen är klar och sparad."
      );
    } catch (assessmentError) {
      setError(
        assessmentError instanceof Error
          ? assessmentError.message
          : "AI-bedömningen misslyckades."
      );
    } finally {
      setAssessing(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const jobById = useMemo(() => {
    const map = new Map<string, Job>();

    jobs.forEach((job) => {
      map.set(job.id, job);
    });

    return map;
  }, [jobs]);

  const selectedApplication =
    applications.find(
      (application) =>
        application.job_id === selectedJobId
    ) || null;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8f9fb] px-6 py-10 text-slate-900 md:ml-64">
        <p className="text-sm text-slate-500">
          Laddar kandidat...
        </p>
      </main>
    );
  }

  if (!candidate) {
    return (
      <main className="min-h-screen bg-[#f8f9fb] px-6 py-10 text-slate-900 md:ml-64">
        <a
          href="/candidates"
          className="text-sm font-semibold text-[#2688ef]"
        >
          ← Tillbaka till kandidater
        </a>

        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error || "Kandidaten kunde inte hittas."}
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
              <span>▥</span>
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
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-medium text-slate-400 hover:text-white"
            >
              Logga ut
            </button>
          </div>
        </aside>

        <section className="min-w-0 flex-1 md:ml-64">
          <header className="border-b border-slate-200 bg-white">
            <div className="px-6 py-7 md:px-12 md:py-8">
              <a
                href="/candidates"
                className="text-xs font-semibold text-[#2688ef] hover:underline"
              >
                ← Kandidater
              </a>

              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-[32px] font-semibold tracking-tight text-[#101820] md:text-[36px]">
                    {candidate.name}
                  </h1>

                  <p className="mt-2 text-sm text-slate-500 md:text-[15px]">
                    Kandidatprofil och AI-bedömning
                  </p>
                </div>

                {candidate.cv_url && (
                  <a
                    href={candidate.cv_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit rounded-lg bg-[#18283a] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#101c2a]"
                  >
                    Öppna CV
                  </a>
                )}
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

              <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
                <div className="space-y-5">
                  <form
                    onSubmit={saveProfile}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <h2 className="text-base font-bold">
                      Kandidatprofil
                    </h2>

                    <div className="mt-5 space-y-4">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold">
                          Namn
                        </label>

                        <input
                          value={name}
                          onChange={(event) =>
                            setName(event.target.value)
                          }
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#2688ef]"
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
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#2688ef]"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold">
                          Telefon
                        </label>

                        <input
                          value={phone}
                          onChange={(event) =>
                            setPhone(event.target.value)
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#2688ef]"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold">
                          LinkedIn
                        </label>

                        {candidate.linkedin_url ? (
                          <a
                            href={candidate.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-sm font-semibold text-[#2688ef] hover:underline"
                          >
                            Öppna LinkedIn-profil
                          </a>
                        ) : (
                          <input
                            type="url"
                            value={linkedinUrl}
                            onChange={(event) =>
                              setLinkedinUrl(
                                event.target.value
                              )
                            }
                            placeholder="https://linkedin.com/in/..."
                            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#2688ef]"
                          />
                        )}
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold">
                          Anteckningar
                        </label>

                        <textarea
                          value={notes}
                          onChange={(event) =>
                            setNotes(event.target.value)
                          }
                          rows={5}
                          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#2688ef]"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={saving}
                      className="mt-5 rounded-lg bg-[#18283a] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {saving
                        ? "Sparar..."
                        : "Spara profil"}
                    </button>
                  </form>

                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-base font-bold">
                      CV
                    </h2>

                    {candidate.cv_url ? (
                      <div className="mt-4 rounded-lg bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-800">
                          CV uppladdat
                        </p>

                        <a
                          href={candidate.cv_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs font-semibold text-[#2688ef] hover:underline"
                        >
                          Visa CV
                        </a>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">
                        Inget CV uppladdat ännu.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 px-5 py-4">
                      <h2 className="text-base font-bold">
                        Rekryteringar
                      </h2>

                      <p className="mt-1 text-xs text-slate-500">
                        Kandidaten kan vara kopplad till flera jobb.
                      </p>
                    </div>

                    {applications.length === 0 ? (
                      <div className="px-5 py-10 text-center text-sm text-slate-500">
                        Ingen rekrytering är kopplad till kandidaten.
                      </div>
                    ) : (
                      <div>
                        {applications.map((application) => {
                          const job = jobById.get(
                            application.job_id
                          );

                          return (
                            <div
                              key={application.id}
                              className="border-b border-slate-100 px-5 py-4 last:border-b-0"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <a
                                    href={`/recruitments/${application.job_id}`}
                                    className="text-sm font-bold text-slate-900 hover:text-[#2688ef]"
                                  >
                                    {job?.title ||
                                      "Okänd rekrytering"}
                                  </a>

                                  <p className="mt-1 text-xs text-slate-500">
                                    {job?.description ||
                                      "Ingen jobbeskrivning."}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedJobId(
                                        application.job_id
                                      );
                                      void assessCv(
                                        application.job_id
                                      );
                                    }}
                                    disabled={
                                      assessing ||
                                      !candidate.cv_url
                                    }
                                    className="rounded-lg bg-[#2688ef] px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#1976d2] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {assessing &&
                                    selectedJobId ===
                                      application.job_id
                                      ? "Bedömer..."
                                      : application.ai_score !==
                                          null &&
                                        application.ai_score !==
                                          undefined
                                      ? "Kör igen"
                                      : "AI-bedöm CV"}
                                  </button>

                                  <select
                                    value={application.status}
                                    onChange={(event) =>
                                      updateStatus(
                                        application.id,
                                        event.target.value
                                      )
                                    }
                                    className={`w-fit rounded-full border-0 px-3 py-1.5 text-[10px] font-bold outline-none ${
                                      statusStyles[
                                        application.status
                                      ] || statusStyles.new
                                    }`}
                                  >
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
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 px-5 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-base font-bold">
                            AI-bedömning
                          </h2>

                          <p className="mt-1 text-xs text-slate-500">
                            Beslutsstöd baserat på CV och vald rekrytering.
                          </p>
                        </div>

                        <p className="text-xs font-medium text-slate-400">
                          Kör AI-bedömningen från vald rekrytering ovan.
                        </p>
                      </div>
                    </div>

                    {!selectedJobId ? (
                      <div className="px-5 py-12 text-center text-sm text-slate-500">
                        Välj en rekrytering för att se eller köra en AI-bedömning.
                      </div>
                    ) : !selectedApplication ? (
                      <div className="px-5 py-12 text-center text-sm text-slate-500">
                        Den här kandidaten är inte kopplad till den valda rekryteringen.
                      </div>
                    ) : selectedApplication.ai_score === null ? (
                      <div className="px-5 py-12 text-center">
                        <p className="text-sm font-bold text-slate-900">
                          Ingen AI-bedömning ännu
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Klicka på AI-bedöm CV bredvid en rekrytering för att jämföra CV:t med jobbets krav.
                        </p>
                      </div>
                    ) : (
                      <div className="p-5">
                        <div className="flex flex-col gap-4 rounded-xl bg-slate-50 p-5 sm:flex-row sm:items-center">
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-blue-50 text-2xl font-bold text-[#2688ef]">
                            {selectedApplication.ai_score}
                          </div>

                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              Match score
                            </p>

                            <p className="mt-1 text-sm font-semibold text-slate-900">
                              {selectedApplication.ai_score}/100
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {selectedApplication.ai_assessed_at
                                ? `Bedömd ${new Date(
                                    selectedApplication.ai_assessed_at
                                  ).toLocaleString("sv-SE")}`
                                : "Bedömning sparad"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-5 md:grid-cols-2">
                          <div>
                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              Sammanfattning
                            </h3>

                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              {selectedApplication.ai_summary}
                            </p>
                          </div>

                          <div>
                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              Rekommendation
                            </h3>

                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              {selectedApplication.ai_recommendation}
                            </p>
                          </div>

                          <div>
                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              Styrkor
                            </h3>

                            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                              {splitLines(
                                selectedApplication.ai_strengths
                              ).map((item, index) => (
                                <li key={index}>
                                  • {item}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              Potentiella frågetecken
                            </h3>

                            <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                              {splitLines(
                                selectedApplication.ai_concerns
                              ).map((item, index) => (
                                <li key={index}>
                                  • {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                          AI-bedömningen är endast beslutsstöd. Det slutliga beslutet fattas alltid av rekryteraren.
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-base font-bold">
                      Information
                    </h2>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-400">
                          Skapad
                        </p>

                        <p className="mt-1 text-sm">
                          {new Date(
                            candidate.created_at
                          ).toLocaleDateString("sv-SE")}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-slate-400">
                          Senast uppdaterad
                        </p>

                        <p className="mt-1 text-sm">
                          {new Date(
                            candidate.updated_at
                          ).toLocaleDateString("sv-SE")}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </section>
      </div>
    </main>
  );
}
