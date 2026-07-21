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
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name: name.trim() } },
    });
    setLoading(false);

    if (error || data.user?.identities?.length === 0) {
      const isDuplicate =
        data.user?.identities?.length === 0 ||
        error?.message.toLowerCase().includes("already");
      setErrorMessage(
        isDuplicate
          ? "이미 가입되었거나 승인 대기 중인 이메일입니다."
          : "가입 요청을 처리하지 못했습니다. 입력 정보를 확인해주세요."
      );
      return;
    }

    await supabase.auth.signOut();
    setMessage(
      "가입 요청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다."
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
