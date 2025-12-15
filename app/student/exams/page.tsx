"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Exam = {
  id: number;
  titre?: string;
  description?: string;
  date_fin?: string | null;
};

export default function StudentExamsListPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await apiFetch<Exam[]>("/exams");
        setExams(Array.isArray(data) ? data : []);
      } catch {
        setExams([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Mes examens</h1>

      {loading ? (
        <div className="text-gray-600">Chargement...</div>
      ) : exams.length === 0 ? (
        <div className="text-gray-600">Aucun examen.</div>
      ) : (
        <div className="grid gap-3">
          {exams.map((ex) => (
            <Link
              key={ex.id}
              href={`/student/exams/${ex.id}`}
              className="block bg-white rounded-2xl shadow p-4 hover:scale-[1.01] transition"
            >
              <div className="font-semibold text-lg">{ex.titre ?? `Examen #${ex.id}`}</div>
              <div className="text-sm text-gray-600">{ex.description ?? ""}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
