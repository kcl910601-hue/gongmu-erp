"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (!name.trim() || !email.trim() || !password) {
      setErrorMessage("이름, 이메일, 비밀번호를 모두 입력해주세요.");
      return;
    }

    if (password !== passwordConfirm) {
      setErrorMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const statusResponse = await fetch("/api/signup/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });
    const statusResult = (await statusResponse.json()) as { status?: string; approvalStatus?: string; active?: boolean; error?: string };
    if (!statusResponse.ok) {
      setLoading(false);
      setErrorMessage(statusResult.error ?? "가입 상태를 확인하지 못했습니다.");
      return;
    }
    const statusMessages: Record<string, string> = {
      auth_only_incomplete: "가입 정보가 불완전합니다. 관리자에게 문의하세요.",
      employee_only_missing_auth: "인증 계정 연결이 필요합니다. 관리자에게 문의하세요.",
    };
    if (statusResult.status === "linked") {
      setLoading(false);
      if (statusResult.approvalStatus === "pending") setErrorMessage("이미 가입 요청이 접수되어 승인 대기 중입니다.");
      else if (statusResult.approvalStatus === "rejected") setErrorMessage("가입 요청이 거절된 계정입니다. 관리자에게 문의하세요.");
      else if (statusResult.active === false) setErrorMessage("비활성화된 계정입니다. 관리자에게 문의하세요.");
      else setErrorMessage("이미 가입된 계정입니다. 로그인해 주세요.");
      return;
    }
    if (statusResult.status !== "not_found") {
      setLoading(false);
      setErrorMessage(statusMessages[statusResult.status ?? ""] ?? "가입 상태를 확인할 수 없습니다. 관리자에게 문의하세요.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { name: name.trim() } },
    });
    setLoading(false);

    if (error || data.user?.identities?.length === 0) {
      const isDuplicate =
        data.user?.identities?.length === 0 ||
        error?.message.toLowerCase().includes("already");
      if (isDuplicate) {
        const retryResponse = await fetch("/api/signup/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail }),
        });
        const retryResult = (await retryResponse.json()) as { status?: string; approvalStatus?: string };
        if (retryResult.status === "linked" && retryResult.approvalStatus === "pending") {
          setErrorMessage("이미 가입 요청이 접수되어 승인 대기 중입니다.");
        } else {
          setErrorMessage(statusMessages[retryResult.status ?? ""] ?? "이미 등록된 이메일입니다. 관리자에게 문의하세요.");
        }
      } else {
        setErrorMessage("가입 요청을 처리하지 못했습니다. 입력 정보를 확인해주세요.");
      }
      return;
    }

    await supabase.auth.signOut();
    setMessage(
      "가입 요청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다."
    );
    setPassword("");
    setPasswordConfirm("");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={handleSignup}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="text-center text-3xl font-bold text-slate-900">
          가입 요청
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          가입 요청 후 관리자 승인이 완료되어야 로그인할 수 있습니다.
        </p>

        <div className="mt-6 space-y-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름"
            autoComplete="name"
            className="w-full rounded-xl border border-slate-300 p-3"
          />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="이메일"
            autoComplete="email"
            className="w-full rounded-xl border border-slate-300 p-3"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
            autoComplete="new-password"
            className="w-full rounded-xl border border-slate-300 p-3"
          />
          <input
            type="password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            placeholder="비밀번호 확인"
            autoComplete="new-password"
            className="w-full rounded-xl border border-slate-300 p-3"
          />
        </div>

        {errorMessage && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </p>
        )}
        {message && (
          <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || Boolean(message)}
          className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
        >
          {loading ? "요청 중..." : "가입 요청"}
        </button>
        <Link
          href="/login"
          className="mt-4 block text-center text-sm font-medium text-slate-600 hover:text-blue-600"
        >
          로그인으로 돌아가기
        </Link>
      </form>
    </div>
  );
}
