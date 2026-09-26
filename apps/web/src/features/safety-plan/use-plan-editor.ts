// 계획 초안의 메모 입력과 순차 자동 저장 상태를 관리한다.
import type { Plan } from "@crowdcast/contracts/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { savePlan } from "./api";

type SaveStatus = "saved" | "editing" | "saving" | "error";

// 서버 시각을 표기하고 수정 중인 메모는 서버 응답으로 덮지 않는다.
export function usePlanEditor(initial: Plan) {
  const [plan, setPlan] = useState(initial);
  const [notes, setNotes] = useState(() =>
    initial.sections.map((item) => item.notes ?? ""),
  );
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [savedAt, setSavedAt] = useState(initial.updatedAt);
  const inFlight = useRef(false);
  const dirty = useMemo(
    () =>
      plan.sections.some((item, index) => (item.notes ?? "") !== notes[index]),
    [plan, notes],
  );

  // 메모만 복사해 저장하며 같은 시각의 중복 PUT을 막는다.
  const save = useCallback(async () => {
    if (inFlight.current || !dirty) return;
    inFlight.current = true;
    setStatus("saving");
    const request = {
      ...plan,
      sections: plan.sections.map((item, index) => ({
        ...item,
        notes: notes[index],
      })) as Plan["sections"],
    };
    try {
      const saved = await savePlan(request);
      setPlan(saved);
      setSavedAt(saved.updatedAt);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [dirty, notes, plan]);

  // 마지막 입력 뒤 1초만 기다리고 실패하면 명시적인 재시도를 기다린다.
  useEffect(() => {
    if (!dirty || status === "saving" || status === "error") return;
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
  }, [dirty, save, status]);

  // 저장되지 않은 메모는 새로고침·탭 닫기 전에 경고한다.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // 앱 내부 링크도 메모가 남아 있으면 이동 전 확인한다.
  useEffect(() => {
    if (!dirty) return;
    const warnLink = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!link) return;
      const next = new URL(link.href);
      if (
        next.origin !== window.location.origin ||
        next.pathname === window.location.pathname
      )
        return;
      if (!window.confirm("저장되지 않은 메모가 있어요. 페이지를 떠날까요?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", warnLink, true);
    return () => document.removeEventListener("click", warnLink, true);
  }, [dirty]);

  // 입력 길이는 계약의 notes 상한과 맞춘다.
  const editNote = (index: number, value: string) => {
    setNotes((current) =>
      current.map((note, position) => (position === index ? value : note)),
    );
    if (status !== "error") setStatus("editing");
  };

  return { plan, notes, status, savedAt, dirty, editNote, retry: save };
}
