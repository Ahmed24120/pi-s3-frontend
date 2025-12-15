"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { toast } from "@/components/ui/Toast";

type Row = {
  studentId: string;
  matricule?: string;
  joinedAt?: string;
  leftAt?: string;
  status: "online" | "offline" | "disconnected";
};

export default function ProfessorExamWatch({ params }: { params: { examId: string } }) {
  const examId = Number(params.examId);
  const socket = useMemo(() => getSocket(), []);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [endAt, setEndAt] = useState<number | null>(null);
  const [duration, setDuration] = useState(90);
  const tick = useRef<NodeJS.Timeout | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const up = (id: string, patch: Partial<Row>) =>
      setRows((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || { studentId: id, status: "online" as const }), ...patch },
      }));

    const onConnect = () => {
      socket.emit("join-exam", { examId, studentId: `prof-${socket.id}`, role: "professor" });
    };

    const onStudentConnected = (p: any) => {
      if (Number(p.examId) !== examId) return;
      up(p.studentId, {
        status: "online",
        matricule: p.matricule,
        joinedAt: new Date().toLocaleTimeString(),
      });
    };

    const onStudentOffline = (p: any) => {
      if (Number(p.examId) !== examId) return;
      up(p.studentId, { status: "offline" });
    };

    const onStudentDisconnected = (p: any) => {
      if (Number(p.examId) !== examId) return;
      up(p.studentId, { status: "disconnected", leftAt: new Date().toLocaleTimeString() });
    };

    const onFileSubmitted = (p: any) => {
      if (String(p.examId) !== String(examId)) return;
      toast(`📁 ${p.studentId} a envoyé ${p.files?.length || 1} fichier(s)`);
    };

    const onStarted = (p: any) => {
      if (Number(p.examId) !== examId) return;
      setEndAt(Number(p.endAt));
      toast("Examen démarré ⏱️");
    };

    const onWarning = (p: any) => {
      if (Number(p.examId) !== examId) return;
      toast("⏰ Il reste 5 minutes");
    };

    const onEnded = (p: any) => {
      if (Number(p.examId) !== examId) return;
      setEndAt(Date.now());
      toast("Examen terminé");
    };

    const onStopped = (p: any) => {
      if (Number(p.examId) !== examId) return;
      setEndAt(null);
      toast("Examen arrêté");
    };

    socket.on("connect", onConnect);
    socket.on("student-connected", onStudentConnected);
    socket.on("student-offline", onStudentOffline);
    socket.on("student-disconnected", onStudentDisconnected);
    socket.on("file-submitted", onFileSubmitted);

    socket.on("exam-started", onStarted);
    socket.on("exam-warning", onWarning);
    socket.on("exam-ended", onEnded);
    socket.on("exam-stopped", onStopped);

    tick.current = setInterval(() => setNow(Date.now()), 1000);

    // si déjà connecté
    if (socket.connected) onConnect();

    return () => {
      tick.current && clearInterval(tick.current);
      socket.off("connect", onConnect);
      socket.off("student-connected", onStudentConnected);
      socket.off("student-offline", onStudentOffline);
      socket.off("student-disconnected", onStudentDisconnected);
      socket.off("file-submitted", onFileSubmitted);
      socket.off("exam-started", onStarted);
      socket.off("exam-warning", onWarning);
      socket.off("exam-ended", onEnded);
      socket.off("exam-stopped", onStopped);
    };
  }, [socket, examId]);

  const timeLeft = endAt ? Math.max(endAt - now, 0) : null;
  const asClock =
    timeLeft !== null
      ? `${Math.floor(timeLeft / 60000).toString().padStart(2, "0")}:${Math.floor(
          (timeLeft % 60000) / 1000
        )
          .toString()
          .padStart(2, "0")}`
      : "--:--";

  function startExam() {
    socket.emit("start-exam", { examId, durationMin: duration });
  }
  function stopExam() {
    socket.emit("stop-exam", { examId });
  }

  const list = Object.values(rows);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Surveillance examen #{examId}</h1>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value || "0"))}
            className="w-20 px-3 py-2 rounded-xl border"
            min={10}
          />
          <button onClick={startExam} className="px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700">
            Démarrer
          </button>
          <button onClick={stopExam} className="px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700">
            Arrêter
          </button>
          <div className={`px-3 py-1 rounded-full text-white ${endAt ? "bg-indigo-700" : "bg-gray-400"}`}>
            ⏱ {asClock}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-3">Étudiant</th>
              <th className="text-left p-3">Matricule</th>
              <th className="text-left p-3">Entrée</th>
              <th className="text-left p-3">Sortie</th>
              <th className="text-left p-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td className="p-4 text-gray-500" colSpan={5}>Aucun étudiant encore</td></tr>
            ) : (
              list.map((r) => (
                <tr key={r.studentId} className="border-t">
                  <td className="p-3 font-medium">{r.studentId}</td>
                  <td className="p-3">{r.matricule || "-"}</td>
                  <td className="p-3">{r.joinedAt || "-"}</td>
                  <td className="p-3">{r.leftAt || "-"}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-full text-white ${
                        r.status === "online"
                          ? "bg-green-600 animate-pulse"
                          : r.status === "offline"
                          ? "bg-orange-500"
                          : "bg-red-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500">
        • Démarrer = envoie "exam-started" à tous les étudiants connectés <br />
        • Alerte à 5 min automatique, puis "exam-ended" à la fin
      </div>
    </div>
  );
}
