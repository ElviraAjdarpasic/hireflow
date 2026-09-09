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

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return Response.json(
        {
          error:
            "GEMINI_API_KEY saknas i .env.local.",
        },
        { status: 500 }
      );
    }

    const { candidateId, jobId } = await request.json();

    if (!candidateId || !jobId) {
      return Response.json(
        {
          error: "candidateId och jobId krävs.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getAdminClient();

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

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("users")
      .select("id,role,customer_id")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      return Response.json(
        {
          error:
            "Användarprofilen kunde inte hittas.",
        },
        { status: 403 }
      );
    }

    const {
      data: candidate,
      error: candidateError,
    } = await supabaseAdmin
      .from("candidates")
      .select(
        "id,name,email,phone,linkedin_url,cv_url,customer_id"
      )
      .eq("id", candidateId)
      .single();

    if (candidateError || !candidate) {
      console.error(
        "Candidate query error:",
        candidateError
      );

      return Response.json(
        { error: "Kandidaten kunde inte hittas." },
        { status: 404 }
      );
    }

    const {
      data: job,
      error: jobError,
    } = await supabaseAdmin
      .from("jobs")
      .select(
        "id,title,description,customer_id"
      )
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error(
        "Job query error:",
        jobError
      );

      return Response.json(
        {
          error:
            "Rekryteringen kunde inte hittas.",
        },
        { status: 404 }
      );
    }

    const canAccess =
      profile.role === "admin" ||
      profile.customer_id === candidate.customer_id;

    const sameCompany =
      candidate.customer_id === job.customer_id;

    if (!canAccess || (profile.role !== "admin" && !sameCompany)) {
      return Response.json(
        {
          error:
            "Du saknar behörighet till denna data.",
        },
        { status: 403 }
      );
    }

    if (!candidate.cv_url) {
      return Response.json(
        {
          error:
            "Kandidaten har inget CV uppladdat.",
        },
        { status: 400 }
      );
    }

    const {
      data: application,
      error: applicationError,
    } = await supabaseAdmin
      .from("applications")
      .select(
        "id,job_id,candidate_id,status"
      )
      .eq("candidate_id", candidateId)
      .eq("job_id", jobId)
      .single();

    if (applicationError || !application) {
      console.error(
        "Application query error:",
        applicationError
      );

      return Response.json(
        {
          error:
            "Kandidaten är inte kopplad till den valda rekryteringen.",
        },
        { status: 400 }
      );
    }

    const prompt = `
Du är ett rekryteringsstöd.

Bedöm kandidaten enbart utifrån jobbrelaterade kvalifikationer.

JOBB:
Titel: ${job.title}

Beskrivning:
${job.description || "Ingen jobbeskrivning angiven."}

KANDIDAT:
Namn: ${candidate.name}
E-post: ${candidate.email || ""}

Kandidatens CV finns som bifogad fil.

Bedöm:
- relevant erfarenhet
- relevanta kompetenser
- utbildning
- tidigare roller
- relevans för jobbet

Använd inte kön, ålder, etnicitet, religion, funktionsnedsättning eller andra känsliga personliga attribut som grund för bedömningen.

Detta är endast beslutsstöd och inte ett automatiskt anställningsbeslut.
`;

    const cvResponse = await fetch(candidate.cv_url);

    if (!cvResponse.ok) {
      const details = await cvResponse.text();

      console.error("CV FETCH ERROR:", details);

      return Response.json(
        {
          error:
            "CV:t kunde inte hämtas för AI-bedömningen.",
        },
        { status: 502 }
      );
    }

    const cvArrayBuffer = await cvResponse.arrayBuffer();
    const cvBase64 = Buffer.from(cvArrayBuffer).toString("base64");
    const cvMimeType =
      cvResponse.headers.get("content-type")?.split(";")[0] ||
      "application/pdf";

    if (cvMimeType !== "application/pdf") {
      return Response.json(
        {
          error:
            "AI-bedömningen stöder just nu endast PDF-CV.",
        },
        { status: 400 }
      );
    }

    const geminiRequestBody = {
      contents: [
        {
          parts: [
            {
              text: `${prompt}

Return ONLY valid JSON in exactly this shape:
{
  "score": 0,
  "summary": "string",
  "strengths": ["string"],
  "concerns": ["string"],
  "recommendation": "string"
}

Score must be an integer from 0 to 100.`,
            },
            {
              inlineData: {
                mimeType: cvMimeType,
                data: cvBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            score: {
              type: "INTEGER",
              minimum: 0,
              maximum: 100,
            },
            summary: {
              type: "STRING",
            },
            strengths: {
              type: "ARRAY",
              items: {
                type: "STRING",
              },
            },
            concerns: {
              type: "ARRAY",
              items: {
                type: "STRING",
              },
            },
            recommendation: {
              type: "STRING",
            },
          },
          required: [
            "score",
            "summary",
            "strengths",
            "concerns",
            "recommendation",
          ],
        },
      },
    };

    let geminiResponse: Response | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      geminiResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiKey,
          },
          body: JSON.stringify(geminiRequestBody),
        }
      );

      if (geminiResponse.ok || geminiResponse.status !== 503) {
        break;
      }

      if (attempt < 3) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt * 2000)
        );
      }
    }

    if (!geminiResponse) {
      return Response.json(
        {
          error: "Gemini svarade inte.",
        },
        { status: 502 }
      );
    }

    if (!geminiResponse.ok) {
      const details = await geminiResponse.text();

      console.error("GEMINI ERROR:", details);

      return Response.json(
        {
          error: `Gemini-fel: ${details}`,
        },
        { status: 502 }
      );
    }

    const geminiData = await geminiResponse.json();

    const rawText =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map((part: any) => part?.text || "")
        .join("")
        .trim() || "";

    if (!rawText) {
      console.error(
        "Gemini returned no output:",
        geminiData
      );

      return Response.json(
        {
          error:
            "AI:n returnerade inget bedömningsresultat.",
        },
        { status: 502 }
      );
    }

    let parsed: {
      score: number;
      summary: string;
      strengths: string[];
      concerns: string[];
      recommendation: string;
    };

    try {
      parsed = JSON.parse(rawText);
    } catch (parseError) {
      console.error(
        "AI JSON parse error:",
        parseError,
        rawText
      );

      return Response.json(
        {
          error:
            "AI:n returnerade ett ogiltigt bedömningsresultat.",
        },
        { status: 502 }
      );
    }

    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(Number(parsed.score))
      )
    );

    if (!Number.isFinite(score)) {
      return Response.json(
        {
          error:
            "AI:n returnerade ett ogiltigt score.",
        },
        { status: 502 }
      );
    }

    const aiSummary =
      String(parsed.summary || "").trim();

    const aiStrengths = Array.isArray(
      parsed.strengths
    )
      ? parsed.strengths
          .map((item) => String(item))
          .join("\n")
      : "";

    const aiConcerns = Array.isArray(
      parsed.concerns
    )
      ? parsed.concerns
          .map((item) => String(item))
          .join("\n")
      : "";

    const aiRecommendation =
      String(
        parsed.recommendation || ""
      ).trim();

    const {
      data: updatedApplication,
      error: updateError,
    } = await supabaseAdmin
      .from("applications")
      .update({
        ai_score: score,
        ai_summary: aiSummary,
        ai_strengths: aiStrengths,
        ai_concerns: aiConcerns,
        ai_recommendation:
          aiRecommendation,
        ai_assessed_at:
          new Date().toISOString(),
      })
      .eq("id", application.id)
      .select(
        "id,job_id,candidate_id,status,ai_score,ai_summary,ai_strengths,ai_concerns,ai_recommendation,ai_assessed_at"
      )
      .single();

    if (updateError || !updatedApplication) {
      console.error(
        "AI database update error:",
        updateError
      );

      return Response.json(
        {
          error:
            "AI-resultatet kunde inte sparas.",
        },
        { status: 500 }
      );
    }

    return Response.json({
      application: updatedApplication,
    });
  } catch (error) {
    console.error(
      "AI assessment route error:",
      error
    );

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "AI-bedömningen misslyckades.",
      },
      { status: 500 }
    );
  }
}