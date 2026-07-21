"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity";

export default function LoginPage() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogin() {
  if (!email.trim()) {
    alert("이메일을 입력해주세요.");
    return;
  }

  if (!password.trim()) {
    alert("비밀번호를 입력해주세요.");
    return;
  }

  setLoading(true);
  setErrorMessage("");

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    setErrorMessage("이메일 또는 비밀번호를 확인해주세요.");
    setLoading(false);
    return;
  }

  const response = await fetch("/api/auth/authorization", {
    cache: "no-store",
  });
  const result = (await response.json()) as { status?: string };

  if (!response.ok) {
    await supabase.auth.signOut();
    const messages: Record<string, string> = {
      pending: "관리자 승인 대기 중입니다.",
      rejected: "가입 요청이 승인되지 않았습니다. 관리자에게 문의하세요.",
      missing_employee: "직원 정보가 등록되지 않았습니다.",
      inactive: "비활성화된 계정입니다. 관리자에게 문의하세요.",
    };
    setErrorMessage(
      messages[result.status ?? ""] ?? "로그인 권한을 확인하지 못했습니다."
    );
    setLoading(false);
    return;
  }

  await logActivity({
    type: "login_success",
    title: "로그인 성공",
    description: "ERP에 로그인했습니다.",
    targetType: "login",
  });

  window.location.href = "/";
}

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-[400px]">
        <h1 className="text-3xl font-bold mb-6 text-center">
          공무팀 ERP
        </h1>

        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded w-full p-3 mb-3"
        />

        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border rounded w-full p-3 mb-5"
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg"
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>

        {errorMessage && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <Link
          href="/signup"
          className="mt-5 block text-center text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          가입 요청
        </Link>
      </div>
    </div>
  );
}
