"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { toast } from "@/components/ui/Toast";

type Resource = { kind: "subject" | "attachment"; file_name: string; url: string };

type ExamApi = {
  id: number;
  titre?: string;
  description?: string;
  date_fin?: string | null;
};

type Exam = {
  id: string | number;
  title?: string;
  description?: string;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function getBaseApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
}

// Small inline icon (no dependency)
function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function StudentExamPage() {
  const params = useParams();

  // ✅ accepte [examId] ou [axamId]
  const raw =
    (params as any)?.examId ??
    (params as any)?.axamId;

  const examId = Array.isArray(raw) ? raw[0] : raw;

  const socket = useMemo(() => getSocket(), []);

  const [exam, setExam] = useState<Exam | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loadingExam, setLoadingExam] = useState(true);
  const [errorExam, setErrorExam] = useState<string | null>(null);

  const [now, setNow] = useState(() => Date.now());
  const [endAt, setEndAt] = useState<number | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const remainingMs = useMemo(() => {
    if (!endAt) return null;
    return endAt - now;
  }, [endAt, now]);

  const isExpired = useMemo(() => {
    if (remainingMs === null) return false;
    return remainingMs <= 0;
  }, [remainingMs]);

  const timerText = useMemo(() => {
    if (remainingMs === null) return "--:--:--";
    return formatDuration(remainingMs);
  }, [remainingMs]);

  // Timer UI
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // ✅ Load exam + resources (subject/attachments)
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!examId) {
        setLoadingExam(false);
        setErrorExam("Identifiant d’examen manquant dans l’URL.");
        return;
      }

      setLoadingExam(true);
      setErrorExam(null);

      try {
        const data = (await apiFetch<ExamApi>(`/exams/${examId}`)) as ExamApi;
        if (cancelled) return;

        setExam({
          id: data.id ?? examId,
          title: data.titre ?? "Examen",
          description: data.description ?? "",
        });

        // ✅ resources
        const res = await apiFetch<Resource[]>(`/exams/${examId}/resources`);
        if (cancelled) return;
        setResources(Array.isArray(res) ? res : []);
      } catch (e: unknown) {
        if (cancelled) return;
        setErrorExam(e instanceof Error ? e.message : "Erreur lors du chargement de l’examen.");
      } finally {
        if (!cancelled) setLoadingExam(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  // ✅ Socket.io: join + recevoir timer
  useEffect(() => {
    if (!examId) return;

    const studentId = "STD-42"; // TODO: depuis token
    const matricule = "MAT-2025-001";

    const onConnect = () => {
      socket.emit("join-exam", { examId: Number(examId), studentId, matricule, role: "student" });
    };

    const onStarted = (p: any) => {
      if (String(p.examId) !== String(examId)) return;
      setEndAt(Number(p.endAt));
      toast("L’épreuve commence maintenant ⏱️");
    };

    const onWarning = (p: any) => {
      if (String(p.examId) !== String(examId)) return;
      setEndAt(Number(p.endAt));
      toast("⏰ Il reste 5 minutes, pensez à envoyer votre travail !");
    };

    const onEnded = (p: any) => {
      if (String(p.examId) !== String(examId)) return;
      setEndAt(Date.now());
      toast("⛔ Temps terminé. Les envois sont verrouillés.");
    };

    socket.on("connect", onConnect);
    socket.on("exam-started", onStarted);
    socket.on("exam-warning", onWarning);
    socket.on("exam-ended", onEnded);

    if (socket.connected) onConnect();

    const hb = window.setInterval(() => {
      socket.emit("heartbeat", { examId: Number(examId), studentId });
    }, 10000);

    return () => {
      window.clearInterval(hb);
      socket.off("connect", onConnect);
      socket.off("exam-started", onStarted);
      socket.off("exam-warning", onWarning);
      socket.off("exam-ended", onEnded);
      socket.emit("leave-exam", { examId: Number(examId), studentId });
    };
  }, [socket, examId]);

  const baseUrl = getBaseApiUrl();
  const openFilePicker = () => fileInputRef.current?.click();

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setUploadMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ⚠️ Ton backend d’upload étudiant = /works/upload (pas /exams/:id/submissions)
  const handleSubmit = async () => {
    setUploadMessage(null);

    if (!examId) return setUploadMessage("Identifiant d’examen manquant.");
    if (!selectedFile) return setUploadMessage("Veuillez sélectionner un fichier.");
    if (isExpired) return setUploadMessage("Le temps est écoulé. Soumission impossible.");

    try {
      setUploading(true);

      const fd = new FormData();
      fd.append("files", selectedFile);
      fd.append("examId", String(examId));
      fd.append("id_etud", "STD-42");      // TODO token
      fd.append("matricule", "MAT-2025-001");
      fd.append("nom", "final");

      const res = await fetch(`${baseUrl}/works/upload`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());

      setUploadMessage("✅ Fichier envoyé avec succès.");
      clearSelectedFile();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Échec de l’envoi du fichier.";
      setUploadMessage(`❌ ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-200 via-white to-purple-100 p-6">
      <div className="w-full max-w-5xl bg-white/80 backdrop-blur rounded-3xl border border-purple-300 shadow-xl flex overflow-hidden">
        <div className="w-20 bg-gradient-to-b from-purple-500 to-purple-700" />

        <div className="flex-1 p-8 space-y-6">
          <div className="h-12 rounded-2xl border border-purple-300 bg-white flex items-center px-5 justify-between">
            <div className="min-w-[140px] text-sm font-semibold text-gray-800">
              {loadingExam ? "Chargement..." : exam?.title || "Examen"}
            </div>

            <div className="text-center">
              <div className="text-[11px] text-gray-600">Temps restant</div>
              <div className={["font-bold tabular-nums", isExpired ? "text-red-600" : "text-purple-700"].join(" ")}>
                {timerText}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-green-100 text-green-800 border-green-200">
                Socket.io
              </span>
            </div>
          </div>

          {errorExam ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorExam}</div>
          ) : (
            exam?.description && (
              <div className="rounded-2xl border border-purple-200 bg-white p-4 text-sm text-gray-700 whitespace-pre-wrap">
                {exam.description}
              </div>
            )
          )}

          <div className="rounded-2xl border border-purple-300 p-6 bg-white">
            <p className="font-semibold text-gray-800 mb-3">Télécharger le sujet :</p>

            {resources.length === 0 ? (
              <p className="text-sm text-gray-700">
                {loadingExam ? "Chargement..." : "Aucun fichier de sujet disponible pour le moment."}
              </p>
            ) : (
              <ul className="space-y-2">
                {resources.map((f, idx) => {
                  const href = f.url.startsWith("http") ? f.url : `${baseUrl}${f.url}`;
                  return (
                    <li key={`${f.file_name}-${idx}`}>
                      <a className="text-purple-700 underline hover:text-purple-900" href={href} target="_blank" rel="noreferrer">
                        {f.kind === "subject" ? `Sujet: ${f.file_name}` : `Pièce: ${f.file_name}`}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-purple-300 bg-white p-6">
            <div
              className={[
                "rounded-2xl bg-gradient-to-br from-purple-50 to-white p-10",
                "border-2 border-dashed transition",
                dragActive ? "border-purple-600 bg-purple-50" : "border-purple-300",
              ].join(" ")}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                setSelectedFile(e.dataTransfer.files?.[0] ?? null);
                setUploadMessage(null);
              }}
              role="button"
              tabIndex={0}
              onClick={openFilePicker}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openFilePicker(); }}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => { setSelectedFile(e.target.files?.[0] ?? null); setUploadMessage(null); }}
                disabled={uploading || isExpired}
              />

              <div className="flex flex-col items-center text-center gap-4">
                <div className="relative">
                  <div className="h-16 w-16 rounded-2xl bg-white shadow flex items-center justify-center text-purple-700">
                    <UploadIcon />
                  </div>
                  <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-full bg-gray-900 text-white flex items-center justify-center shadow">
                    <span className="text-lg leading-none">↑</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-lg font-semibold text-gray-800">Dépose ton fichier ici</p>
                  <p className="text-sm text-gray-700">Clique pour uploader ou glisse-dépose ton fichier dans cette zone.</p>

                  <p className="text-sm">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openFilePicker(); }}
                      className="text-purple-700 underline hover:text-purple-900 font-semibold"
                      disabled={uploading || isExpired}
                    >
                      Parcourir les fichiers
                    </button>
                  </p>

                  {selectedFile && (
                    <p className="text-sm text-gray-800">
                      Fichier sélectionné : <span className="font-semibold">{selectedFile.name}</span>
                    </p>
                  )}

                  {isExpired && <p className="text-sm text-red-600 font-semibold">⏰ Examen terminé</p>}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
                    disabled={!selectedFile || uploading || isExpired}
                    className={[
                      "px-6 py-2 rounded-xl font-semibold transition",
                      !selectedFile || uploading || isExpired
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "bg-purple-600 text-white hover:bg-purple-700",
                    ].join(" ")}
                  >
                    {uploading ? "Envoi..." : "Envoyer"}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); clearSelectedFile(); }}
                    className={[
                      "px-6 py-2 rounded-xl font-semibold border transition",
                      selectedFile ? "border-gray-300 text-gray-700 hover:bg-gray-100" : "border-gray-200 text-gray-400 cursor-not-allowed",
                    ].join(" ")}
                    disabled={!selectedFile || uploading}
                  >
                    Annuler
                  </button>
                </div>

                {uploadMessage && <p className="text-sm text-gray-800">{uploadMessage}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
