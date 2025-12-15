"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getSocket } from "@/lib/socket";
import { toast } from "@/components/ui/Toast";

type Exam = {
  id: number;
  titre?: string;
  description?: string;
  date_debut?: string | null;
  date_fin?: string | null;
  sujet_path?: string | null;
};

export default function ProfessorDashboard() {
  const socket = useMemo(() => getSocket(), []);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  // création
  const [creating, setCreating] = useState(false);
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState<number>(90);
  const [startNow, setStartNow] = useState<boolean>(true);

  // timers reçus
  const [endMap, setEndMap] = useState<Record<number, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const tick = useRef<NodeJS.Timeout | null>(null);

  // Référence pour l'animation
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Effet d'animation sur le titre
  useEffect(() => {
    if (!titleRef.current) return;

    const title = titleRef.current;
    let animationFrameId: number;
    let hue = 0;

    const animateTitle = () => {
      hue = (hue + 0.5) % 360;
      title.style.background = `linear-gradient(45deg, 
        hsl(${hue}, 100%, 40%), 
        hsl(${(hue + 60) % 360}, 100%, 40%), 
        hsl(${(hue + 120) % 360}, 100%, 40%)
      )`;
      title.style.backgroundSize = "200% 200%";
      title.style.backgroundClip = "text";
      title.style.webkitBackgroundClip = "text";
      title.style.webkitTextFillColor = "transparent";
      title.style.animation = "gradientFlow 3s ease infinite";
      
      animationFrameId = requestAnimationFrame(animateTitle);
    };

    animateTitle();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Styles CSS pour les animations
  const styles = `
    @keyframes gradientFlow {
      0%, 100% {
        background-position: 0% 50%;
      }
      50% {
        background-position: 100% 50%;
      }
    }
    
    @keyframes pulseGlow {
      0%, 100% {
        box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
      }
      50% {
        box-shadow: 0 0 40px rgba(99, 102, 241, 0.6);
      }
    }
    
    @keyframes shimmer {
      0% {
        background-position: -200% center;
      }
      100% {
        background-position: 200% center;
      }
    }
    
    @keyframes float {
      0%, 100% {
        transform: translateY(0px);
      }
      50% {
        transform: translateY(-5px);
      }
    }
    
    @keyframes colorCycle {
      0% {
        border-color: #6366f1;
      }
      33% {
        border-color: #8b5cf6;
      }
      66% {
        border-color: #3b82f6;
      }
      100% {
        border-color: #6366f1;
      }
    }
    
    .animated-timer {
      animation: pulseGlow 2s ease-in-out infinite;
      background: linear-gradient(45deg, #6366f1, #8b5cf6, #3b82f6);
      background-size: 200% 200%;
      animation: gradientFlow 3s ease infinite;
    }
    
    .shimmer-button {
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 255, 255, 0.4),
        transparent
      );
      background-size: 200% 100%;
      animation: shimmer 2s infinite;
    }
    
    .floating-card {
      animation: float 3s ease-in-out infinite;
      border: 2px solid;
      animation: colorCycle 6s linear infinite;
    }
    
    .gradient-border {
      position: relative;
      border-radius: 1rem;
    }
    
    .gradient-border::before {
      content: '';
      position: absolute;
      top: -2px;
      left: -2px;
      right: -2px;
      bottom: -2px;
      background: linear-gradient(45deg, 
        #6366f1, #8b5cf6, #3b82f6, #6366f1);
      background-size: 300% 300%;
      border-radius: 1rem;
      z-index: -1;
      animation: gradientFlow 3s ease infinite;
      opacity: 0.7;
    }
  `;

  // charge examens
  async function loadExams() {
  try {
    setLoading(true);
    const url = `http://localhost:3001/exams`;
    console.log("Fetching:", url);
    const res = await fetch(`http://localhost:3001/exams`);

    // 🔴 important : tester le status HTTP
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} - ${text}`);
    }

    const data = await res.json();
    setExams(Array.isArray(data) ? data : []);

  } catch (error) {
    console.error("❌ loadExams error:", error); // 👈 console ici
    toast("Impossible de charger les examens");
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    loadExams();

    // timers via socket
    const onStarted = (p: any) =>
      setEndMap((m) => ({ ...m, [Number(p.examId)]: Number(p.endAt) }));
    const onEnded = (p: any) =>
      setEndMap((m) => {
        const copy = { ...m };
        delete copy[Number(p.examId)];
        return copy;
      });
    const onStopped = onEnded;

    socket.on("exam-started", onStarted);
    socket.on("exam-ended", onEnded);
    socket.on("exam-stopped", onStopped);
    socket.on("exam-warning", () => toast("⏰ Il reste 5 minutes"));

    tick.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      socket.off("exam-started", onStarted);
      socket.off("exam-ended", onEnded);
      socket.off("exam-stopped", onStopped);
      socket.off("exam-warning");
      if (tick.current) clearInterval(tick.current);
    };
  }, [socket]);

  // helpers
  const timeLeft = (examId: number) => {
    const endAt = endMap[examId];
    if (!endAt) return null;
    const ms = Math.max(endAt - now, 0);
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  async function createExam(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim()) return toast("Le titre est requis");
    setCreating(true);
    try {
      const end = new Date(Date.now() + duration * 60000).toISOString();
      const res = await fetch(`http://localhost:3001/exams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titre, description, date_fin: end }),
      });
      if (!res.ok) throw new Error("fail");
      const created = await res.json();
      toast("Examen créé ✅");
      setTitre("");
      setDescription("");
      await loadExams();
      if (startNow && created?.id) {
        socket.emit("start-exam", { examId: created.id, durationMin: duration });
        toast("Examen démarré ⏱️");
      }
    } catch {
      toast("Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  }

  function startExam(id: number) {
    socket.emit("start-exam", { examId: id, durationMin: duration });
  }
  function stopExam(id: number) {
    socket.emit("stop-exam", { examId: id });
  }

  // upload (sujet + pièces)
  async function uploadResources(examId: number, form: HTMLFormElement) {
    const fd = new FormData(form);
    const res = await fetch(`http://localhost:3001/exams/${examId}/resources`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) return toast("Upload échoué");
    toast("Fichiers importés ✅");
    (form as any).reset();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-purple-50">
      {/* Styles d'animation */}
      <style>{styles}</style>
      
      <div className="mx-auto max-w-7xl p-6 space-y-8">
        {/* HEADER avec animation */}
        <header className="flex items-center justify-between">
          <div>
            <h1 
              ref={titleRef}
              className="text-4xl font-extrabold tracking-tight"
              style={{
                background: "linear-gradient(45deg, #6366f1, #8b5cf6, #3b82f6)",
                backgroundSize: "200% 200%",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: "gradientFlow 3s ease infinite"
              }}
            >
              Tableau de bord professeur
            </h1>
            <p className="text-sm font-medium text-gray-800 mt-2 flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-gradient-to-r from-indigo-500 to-purple-500"></span>
              </span>
              Créez, lancez et suivez vos examens en temps réel.
            </p>
          </div>
          <Link
            href="/professor/login"
            className="relative px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-lg hover:shadow-indigo-200 transition-all duration-300 overflow-hidden group font-semibold"
          >
            <span className="relative z-10">Se déconnecter</span>
            <span className="shimmer-button absolute inset-0"></span>
          </Link>
        </header>

        {/* CRÉATION avec bordure animée */}
        <section className="relative gradient-border">
          <div className="absolute inset-0 -z-10 blur-3xl opacity-40 bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 rounded-3xl animate-pulse" />
          <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-6 ring-1 ring-black/5 floating-card">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gradient-to-r from-indigo-500 to-purple-500"></span>
              </span>
              Créer un examen
            </h2>
            <form onSubmit={createExam} className="grid gap-4 sm:grid-cols-2">
              <div className="relative">
                <label className="block text-sm font-bold mb-1 text-gray-900">Titre</label>
                <input
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300 hover:border-indigo-300 text-gray-900 font-medium"
                  placeholder="Ex: Réseaux – Session 1"
                />
              </div>
              <div className="relative">
                <label className="block text-sm font-bold mb-1 text-gray-900">Durée (min)</label>
                <input
                  type="number"
                  min={10}
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value || "0"))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300 hover:border-indigo-300 text-gray-900 font-medium"
                />
              </div>
              <div className="sm:col-span-2 relative">
                <label className="block text-sm font-bold mb-1 text-gray-900">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-300 hover:border-indigo-300 text-gray-900 font-medium"
                  placeholder="Consignes, matériel autorisé, etc."
                />
              </div>
              <div className="sm:col-span-2 flex items-center gap-3">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={startNow}
                      onChange={(e) => setStartNow(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-10 h-5 rounded-full transition-colors duration-300 ${startNow ? 'bg-gradient-to-r from-indigo-500 to-purple-500' : 'bg-gray-300'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-300 transform ${startNow ? 'translate-x-5' : ''}`}></div>
                    </div>
                  </div>
                  <span className="font-medium text-gray-900">Démarrer automatiquement après création</span>
                </label>
                <button
                  type="submit"
                  disabled={creating}
                  className="ml-auto relative px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-xl hover:shadow-indigo-200 disabled:opacity-50 transition-all duration-300 overflow-hidden group font-semibold"
                >
                  <span className="relative z-10">
                    {creating ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        Création...
                      </span>
                    ) : "Créer l'examen"}
                  </span>
                  <span className="shimmer-button absolute inset-0"></span>
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* LISTE + ACTIONS + IMPORT */}
        <section className="bg-white rounded-3xl shadow-2xl overflow-hidden ring-1 ring-black/5 floating-card">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                Examens
              </span>
              <span className="text-xs px-2 py-1 rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 font-bold">
                {exams.length} total
              </span>
            </h2>
            <button
              onClick={loadExams}
              className="relative px-4 py-2 rounded-lg bg-gradient-to-r from-slate-900 to-slate-800 text-white hover:shadow-lg transition-all duration-300 overflow-hidden group font-semibold"
            >
              <span className="relative z-10 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Rafraîchir
              </span>
              <span className="shimmer-button absolute inset-0"></span>
            </button>
          </div>

          {loading ? (
            <div className="p-8 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
              <div className="text-sm font-medium text-gray-700">Chargement des examens...</div>
            </div>
          ) : exams.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-5xl mb-4">📚</div>
              <div className="text-sm font-medium text-gray-700">Aucun examen pour le moment</div>
              <div className="text-xs text-gray-600 mt-2">Créez votre premier examen ci-dessus</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {exams.map((ex) => {
                const tl = timeLeft(ex.id);
                const running = tl !== null;
                return (
                  <div key={ex.id} className="p-6 grid gap-6 md:grid-cols-5 items-start hover:bg-gradient-to-r hover:from-indigo-50/50 hover:to-purple-50/50 transition-all duration-300 group">
                    {/* Infos */}
                    <div className="md:col-span-2">
                      <div className="text-xs font-bold px-2 py-1 rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 inline-block mb-2">
                        ID #{ex.id}
                      </div>
                      <div className="text-lg font-bold text-gray-900 group-hover:text-indigo-800 transition-colors">
                        {ex.titre || "-"}
                      </div>
                      <div className="text-sm font-medium text-gray-800 line-clamp-2 mt-1">
                        {ex.description || "Pas de description"}
                      </div>
                    </div>

                    {/* Timer + actions */}
                    <div className="flex items-center gap-3">
                      <span className={`px-4 py-2 rounded-full font-mono font-bold ${running ? 'animated-timer text-white' : 'bg-gray-100 text-gray-800'}`}>
                        {running ? (
                          <span className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                            </span>
                            {tl}
                          </span>
                        ) : "--:--"}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startExam(ex.id)}
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:shadow-lg hover:shadow-blue-200 transition-all duration-300 font-semibold"
                        >
                          Démarrer
                        </button>
                        <button
                          onClick={() => stopExam(ex.id)}
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-700 text-white hover:shadow-lg hover:shadow-rose-200 transition-all duration-300 font-semibold"
                        >
                          Arrêter
                        </button>
                        <Link
                          href={`/professor/exams/${ex.id}`}
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:shadow-lg hover:shadow-emerald-200 transition-all duration-300 flex items-center gap-2 font-semibold"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Surveiller
                        </Link>
                      </div>
                    </div>

                    {/* Import fichiers */}
                    <form
                      className="md:col-span-2 bg-gradient-to-br from-slate-50 to-indigo-50 rounded-2xl p-4 ring-1 ring-slate-200/50"
                      onSubmit={(e) => { e.preventDefault(); uploadResources(ex.id, e.currentTarget); }}
                    >
                      <div className="text-sm font-bold mb-3 flex items-center gap-2 text-gray-900">
                        <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Importer fichiers
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-indigo-500"></span>
                            Sujet (.pdf)
                          </div>
                          <input 
                            name="subject" 
                            type="file" 
                            accept=".pdf" 
                            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg hover:border-indigo-300 transition-colors file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-indigo-50 file:to-purple-50 file:text-indigo-800 hover:file:bg-gradient-to-r hover:file:from-indigo-100 hover:file:to-purple-100 text-gray-900"
                          />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-purple-500"></span>
                            Pièces jointes
                          </div>
                          <input
                            name="attachments"
                            type="file"
                            multiple
                            accept=".xlsx,.xls,.doc,.docx,.zip,.txt,.csv,.ppt,.pptx"
                            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg hover:border-purple-300 transition-colors file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-indigo-50 file:to-purple-50 file:text-indigo-800 hover:file:bg-gradient-to-r hover:file:from-indigo-100 hover:file:to-purple-100 text-gray-900"
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <button 
                          type="submit"
                          className="relative px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-lg hover:shadow-indigo-200 transition-all duration-300 overflow-hidden group font-semibold"
                        >
                          <span className="relative z-10 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                            </svg>
                            Importer
                          </span>
                          <span className="shimmer-button absolute inset-0"></span>
                        </button>
                        {ex.sujet_path && (
                          <a
                            href={`${process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")}/static/${ex.sujet_path}`}
                            className="text-xs font-medium text-indigo-800 hover:text-indigo-900 hover:underline flex items-center gap-1 transition-colors"
                            target="_blank"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Voir le sujet
                          </a>
                        )}
                      </div>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="text-xs font-medium text-gray-700 text-center p-4 border-t border-gray-200">
          <span className="inline-flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            Astuce : "Surveiller" ouvre le suivi temps réel (connectés/déconnectés, envois).
          </span>
        </p>
      </div>
    </div>
  );
}